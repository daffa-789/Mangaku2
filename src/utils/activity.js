function normalizeDescription(value) {
  return String(value || '').trim().slice(0, 255);
}

async function logActivity(
  connectionOrPool,
  actorUserId,
  action,
  description,
  options = {},
) {
  const {
    targetType = null,
    targetId = null,
    metadata = null,
  } = options;

  if (!actorUserId || !action) {
    return;
  }

  await connectionOrPool.query(
    `INSERT INTO activity_logs
     (actor_user_id, action, target_type, target_id, description, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      actorUserId,
      String(action).trim().toLowerCase(),
      targetType ? String(targetType).trim().toLowerCase() : null,
      targetId || null,
      normalizeDescription(description),
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
}

export { logActivity };
