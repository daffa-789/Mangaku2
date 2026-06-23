import express from "express";
import { z } from "zod";
import { pool } from "../config/db.js";
import {
  normalizeEmail,
  createAuthToken,
  buildAuthUserPayload,
} from "../utils/access.js";
import { logActivity } from "../utils/activity.js";
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from "../utils/response.js";

const router = express.Router();

const MIN_PASSWORD_LENGTH = 6;

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

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { data, error } = parseCredentials(req.body);
  if (error) return errorResponse(res, error);

  const { email, password } = data;

  try {
    const [users] = await pool.query(
      "SELECT id, email, password, role FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    
    if (users.length === 0) {
      return errorResponse(res, "Email atau password salah.", 401);
    }

    const user = users[0];
    
    if (user.password !== password) {
      return errorResponse(res, "Email atau password salah.", 401);
    }

    const token = createAuthToken(user);

    await logActivity(pool, user.id, "login", `${email} login.`, {
      targetType: "user",
      targetId: user.id,
    });

    const payload = buildAuthUserPayload(user);
    payload.token = token;

    return successResponse(res, "Login berhasil.", payload);
  } catch (error) {
    return serverErrorResponse(res, error);
  }
});

export default router;
