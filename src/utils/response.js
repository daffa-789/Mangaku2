// Helper functions untuk response handling
export function successResponse(res, message, data = null, statusCode = 200) {
  const response = { status: 'success', message };
  if (data !== null) response.data = data;
  return res.status(statusCode).json(response);
}

export function errorResponse(res, message, statusCode = 400) {
  return res.status(statusCode).json({
    status: 'error',
    message,
  });
}

export function notFoundResponse(res, message = 'Data tidak ditemukan.') {
  return errorResponse(res, message, 404);
}

export function serverErrorResponse(res, error, customMessage = null) {
  console.error('Server error:', error.message);
  return errorResponse(
    res,
    customMessage || 'Terjadi kesalahan pada server.',
    500,
  );
}

// Helper untuk parsing ID
export function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Helper untuk validasi ID
export function validateId(id, fieldName = 'ID') {
  if (!parsePositiveInteger(id)) {
    return `${fieldName} tidak valid.`;
  }
  return null;
}
