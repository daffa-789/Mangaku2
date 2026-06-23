// Helper untuk database transactions
export async function withTransaction(pool, callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Helper untuk query dengan error handling
export async function safeQuery(connectionOrPool, sql, params = []) {
  try {
    return await connectionOrPool.query(sql, params);
  } catch (error) {
    console.error('Query error:', error.message);
    throw error;
  }
}
