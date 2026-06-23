import express from "express";
import { z } from "zod";
import { pool } from "../config/db.js";
import {
  normalizeEmail,
  normalizeRole,
  hasMinimumRole,
  getUserById,
  resolveRequestUser,
  buildAuthUserPayload,
} from "../utils/access.js";
import { logActivity } from "../utils/activity.js";
import {
  successResponse,
  errorResponse,
  notFoundResponse,
  serverErrorResponse,
  parsePositiveInteger,
  validateId,
} from "../utils/response.js";
import { withTransaction } from "../utils/database.js";

const router = express.Router();

const MIN_PASSWORD_LENGTH = 6;
const BOOTSTRAP_SUPER_ADMIN_EMAILS = new Set(
  String(
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAILS ||
      process.env.BOOTSTRAP_ADMIN_EMAILS ||
      "admin@mangaku.local",
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const credentialsSchema = z.object({
  email: z
    .string({ required_error: "Email wajib diisi." })
    .trim()
    .min(1, "Email wajib diisi.")
    .email("Format email tidak valid.")
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ required_error: "Password wajib diisi." })
    .min(1, "Password wajib diisi.")
    .min(
      MIN_PASSWORD_LENGTH,
      `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`,
    ),
});

function parseCredentials(body = {}) {
  const result = credentialsSchema.safeParse(body);
  if (!result.success) {
    return {
      data: null,
      error: result.error.issues[0]?.message || "Data login tidak valid.",
    };
  }
  return { data: result.data, error: null };
}

function parseRole(value) {
  const normalized = normalizeRole(value);
  return ["user", "admin", "super_admin"].includes(normalized)
    ? normalized
    : null;
}

async function requireMinimumRole(req, res, minimumRole) {
  try {
    const { user, error } = await resolveRequestUser(pool, req, {
      requireToken: true,
    });
    if (error) {
      return errorResponse(res, error.message, error.status);
    }
    if (!hasMinimumRole(user.role, minimumRole)) {
      return errorResponse(
        res,
        minimumRole === "super_admin"
          ? "Akses super admin diperlukan."
          : "Akses admin atau super admin diperlukan.",
        403,
      );
    }
    return user;
  } catch (error) {
    return serverErrorResponse(res, error);
  }
}

async function getRoleCounts() {
  const [rows] = await pool.query(
    "SELECT role, COUNT(*) AS total FROM users GROUP BY role",
  );
  return rows.reduce(
    (acc, row) => ({
      ...acc,
      [normalizeRole(row.role)]: Number(row.total || 0),
    }),
    { super_admin: 0, admin: 0, user: 0 },
  );
}

function mapActivityLogRow(row = {}) {
  return {
    id: row.id,
    userId: row.userId === null ? null : Number(row.userId),
    userEmail: row.userEmail || "User dihapus",
    userRole: row.userRole || "unknown",
    action: row.action || "",
    description: row.description || "",
    targetType: row.targetType || null,
    targetId: row.targetId === null ? null : Number(row.targetId),
    createdAt: row.createdAt || null,
  };
}

// GET /api/auth/me
router.get("/me", async (req, res) => {
  try {
    const { user, error } = await resolveRequestUser(pool, req);
    if (error) return errorResponse(res, error.message, error.status);
    return successResponse(
      res,
      "User berhasil dimuat.",
      buildAuthUserPayload(user),
    );
  } catch (error) {
    return serverErrorResponse(res, error);
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { data, error } = parseCredentials(req.body);
  if (error) return errorResponse(res, error);

  const { email, password } = data;

  try {
    const result = await withTransaction(pool, async (connection) => {
      const [existingUsers] = await connection.query(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [email],
      );
      if (existingUsers.length > 0) {
        throw new Error("EMAIL_EXISTS");
      }

      const [superAdminCountRows] = await connection.query(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin'",
      );
      const shouldBootstrap =
        Number(superAdminCountRows[0]?.count || 0) === 0 &&
        BOOTSTRAP_SUPER_ADMIN_EMAILS.has(normalizeEmail(email));
      const role = shouldBootstrap ? "super_admin" : "user";

      const [insertResult] = await connection.query(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, password, role],
      );

      const userId = insertResult.insertId;
      const user = await getUserById(connection, userId);

      await logActivity(connection, userId, "register", `${email} mendaftar.`, {
        targetType: "user",
        targetId: userId,
      });

      return user;
    });

    return successResponse(
      res,
      "Registrasi berhasil.",
      buildAuthUserPayload(result),
      201,
    );
  } catch (error) {
    if (error.message === "EMAIL_EXISTS") {
      return errorResponse(res, "Email sudah terdaftar.", 409);
    }
    return serverErrorResponse(res, error);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { data, error } = parseCredentials(req.body);
  if (error) return errorResponse(res, error);

  const { email, password } = data;

  try {
    const [rows] = await pool.query(
      "SELECT id, email, password, role FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    const user = rows[0];

    if (!user || user.password !== password) {
      return errorResponse(res, "Email atau password salah.", 401);
    }

    await logActivity(pool, user.id, "login", `${email} login.`, {
      targetType: "user",
      targetId: user.id,
    });

    return successResponse(res, "Login berhasil.", buildAuthUserPayload(user));
  } catch (error) {
    return serverErrorResponse(res, error);
  }
});

// GET /api/auth/users
router.get("/users", async (req, res) => {
  const managerUser = await requireMinimumRole(req, res, "admin");
  if (!managerUser) return;

  try {
    const [rows] = await pool.query(
      "SELECT id, email, role, created_at AS createdAt, updated_at AS updatedAt FROM users ORDER BY created_at DESC, id DESC",
    );
    const roleCounts = await getRoleCounts();

    return successResponse(res, "Daftar user berhasil dimuat.", {
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: normalizeRole(row.role),
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
      })),
      roleCounts,
    });
  } catch (error) {
    return serverErrorResponse(res, error);
  }
});

// PATCH /api/auth/users/:id/role
router.patch("/users/:id/role", async (req, res) => {
  const superAdminUser = await requireMinimumRole(req, res, "super_admin");
  if (!superAdminUser) return;

  const targetUserId = parsePositiveInteger(req.params.id);
  const validationError = validateId(targetUserId, "ID user");
  if (validationError) return errorResponse(res, validationError);

  const nextRole = parseRole(req.body?.role);
  if (!nextRole) return errorResponse(res, "Role tidak valid.");

  try {
    const targetUser = await getUserById(pool, targetUserId);
    if (!targetUser) return notFoundResponse(res, "User tidak ditemukan.");

    if (targetUserId === superAdminUser.id) {
      return errorResponse(
        res,
        "Tidak bisa mengubah role akun yang sedang dipakai.",
      );
    }

    if (
      normalizeRole(targetUser.role) === "super_admin" &&
      nextRole !== "super_admin"
    ) {
      const [countRows] = await pool.query(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin'",
      );
      if (Number(countRows[0]?.count || 0) <= 1) {
        return errorResponse(
          res,
          "Tidak bisa mengubah super admin terakhir ke role lain.",
        );
      }
    }

    await pool.query("UPDATE users SET role = ? WHERE id = ?", [
      nextRole,
      targetUserId,
    ]);
    await logActivity(
      pool,
      superAdminUser.id,
      "update_role",
      `${superAdminUser.email} mengubah role ${targetUser.email} menjadi ${nextRole}.`,
      { targetType: "user", targetId: targetUserId },
    );

    return successResponse(res, "Role berhasil diperbarui.", {
      id: targetUser.id,
      email: targetUser.email,
      role: nextRole,
    });
  } catch (error) {
    return serverErrorResponse(res, error);
  }
});

// DELETE /api/auth/users/:id
router.delete("/users/:id", async (req, res) => {
  const superAdminUser = await requireMinimumRole(req, res, "super_admin");
  if (!superAdminUser) return;

  const targetUserId = parsePositiveInteger(req.params.id);
  const validationError = validateId(targetUserId, "ID user");
  if (validationError) return errorResponse(res, validationError);

  if (targetUserId === superAdminUser.id) {
    return errorResponse(res, "Tidak bisa menghapus akun yang sedang dipakai.");
  }

  try {
    const result = await withTransaction(pool, async (connection) => {
      const [targetRows] = await connection.query(
        "SELECT id, email, role FROM users WHERE id = ? LIMIT 1",
        [targetUserId],
      );
      const targetUser = targetRows[0];
      if (!targetUser) throw new Error("USER_NOT_FOUND");

      if (normalizeRole(targetUser.role) === "super_admin") {
        const [countRows] = await connection.query(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin'",
        );
        if (Number(countRows[0]?.count || 0) <= 1) {
          throw new Error("LAST_SUPER_ADMIN");
        }
      }

      await logActivity(
        connection,
        superAdminUser.id,
        "delete_user",
        `${superAdminUser.email} menghapus akun ${targetUser.email}.`,
        { targetType: "user", targetId: targetUserId },
      );

      await connection.query("DELETE FROM users WHERE id = ?", [targetUserId]);
      return targetUser;
    });

    return successResponse(res, "User berhasil dihapus.", {
      id: result.id,
      email: result.email,
      role: normalizeRole(result.role),
    });
  } catch (error) {
    if (error.message === "USER_NOT_FOUND") {
      return notFoundResponse(res, "User tidak ditemukan.");
    }
    if (error.message === "LAST_SUPER_ADMIN") {
      return errorResponse(res, "Tidak bisa menghapus super admin terakhir.");
    }
    return serverErrorResponse(res, error);
  }
});

// GET /api/auth/logs
router.get("/logs", async (req, res) => {
  const managerUser = await requireMinimumRole(req, res, "admin");
  if (!managerUser) return;

  try {
    const [rows] = await pool.query(
      `SELECT l.id,
              l.actor_user_id AS userId,
              u.email AS userEmail,
              u.role AS userRole,
              l.action,
              l.description,
              l.target_type AS targetType,
              l.target_id AS targetId,
              l.created_at AS createdAt
       FROM activity_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 250`,
    );

    return successResponse(
      res,
      "Activity logs berhasil dimuat.",
      rows.map(mapActivityLogRow),
    );
  } catch (error) {
    return serverErrorResponse(res, error);
  }
});

// DELETE /api/auth/logs - Hapus semua activity logs (admin only)
router.delete("/logs", async (req, res) => {
  const managerUser = await requireMinimumRole(req, res, "admin");
  if (!managerUser) return;

  try {
    await pool.query("DELETE FROM activity_logs");
    return successResponse(res, "Semua activity logs berhasil dihapus.");
  } catch (error) {
    return serverErrorResponse(res, error);
  }
});

export default router;
