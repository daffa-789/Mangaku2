import jwt from 'jsonwebtoken';

const AUTH_TOKEN_EXPIRES_IN = process.env.AUTH_TOKEN_EXPIRES_IN || '12h';
const AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-only-change-me';
const ROLE_ORDER = {
  user: 1,
  admin: 2,
  super_admin: 3,
};

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeRole(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  return Object.prototype.hasOwnProperty.call(ROLE_ORDER, normalized)
    ? normalized
    : 'user';
}

function hasMinimumRole(userRole, minimumRole) {
  return (
    ROLE_ORDER[normalizeRole(userRole)] >=
    ROLE_ORDER[normalizeRole(minimumRole)]
  );
}

function createAuthToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: normalizeEmail(user.email),
      role: normalizeRole(user.role),
    },
    AUTH_JWT_SECRET,
    {
      expiresIn: AUTH_TOKEN_EXPIRES_IN,
    },
  );
}

function getBearerToken(req) {
  const authorization = String(req.get('authorization') || '');

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = authorization.slice(7).trim();
  return token || null;
}

function verifyBearerToken(req) {
  const token = getBearerToken(req);

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, AUTH_JWT_SECRET);
    const userId = Number.parseInt(String(payload?.sub || ''), 10);
    const email = normalizeEmail(payload?.email || '');

    if (!Number.isInteger(userId) || userId <= 0 || !email) {
      return null;
    }

    return {
      userId,
      email,
      role: normalizeRole(payload?.role),
    };
  } catch (error) {
    return null;
  }
}

function getRequestUserId(req) {
  const verifiedToken = verifyBearerToken(req);

  if (verifiedToken) {
    return verifiedToken.userId;
  }

  const rawValue = req.get('x-user-id') || req.body?.userId || req.query.userId;
  const userId = Number.parseInt(String(rawValue || ''), 10);

  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  return userId;
}

async function getUserById(connectionOrPool, userId) {
  const [rows] = await connectionOrPool.query(
    'SELECT id, email, role, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  if (!rows[0]) {
    return null;
  }

  return {
    id: rows[0].id,
    email: rows[0].email,
    role: normalizeRole(rows[0].role),
    createdAt: rows[0].createdAt || null,
    updatedAt: rows[0].updatedAt || null,
  };
}

async function resolveRequestUser(connectionOrPool, req, options = {}) {
  const { requireToken = false } = options;
  const verifiedToken = verifyBearerToken(req);

  if (requireToken && !verifiedToken) {
    return {
      user: null,
      error: {
        status: 401,
        message: 'Token login tidak valid. Silakan login ulang.',
      },
    };
  }

  const userId = verifiedToken?.userId || getRequestUserId(req);

  if (!userId) {
    return {
      user: null,
      error: {
        status: 401,
        message: 'User tidak valid. Silakan login ulang.',
      },
    };
  }

  const user = await getUserById(connectionOrPool, userId);

  if (!user) {
    return {
      user: null,
      error: {
        status: 401,
        message: 'User tidak ditemukan. Silakan login ulang.',
      },
    };
  }

  if (verifiedToken && normalizeEmail(user.email) !== verifiedToken.email) {
    return {
      user: null,
      error: {
        status: 401,
        message: 'Token login tidak cocok dengan akun user.',
      },
    };
  }

  return {
    user,
    error: null,
  };
}

function buildAuthUserPayload(user) {
  return {
    id: user.id,
    email: user.email,
    role: normalizeRole(user.role),
    token: createAuthToken(user),
  };
}

export {
  ROLE_ORDER,
  normalizeEmail,
  normalizeRole,
  hasMinimumRole,
  createAuthToken,
  getRequestUserId,
  getUserById,
  resolveRequestUser,
  buildAuthUserPayload,
};
