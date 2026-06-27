function slugifyTitle(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'manga';
}

function sanitizeFolderName(mangaTitle) {
  return slugifyTitle(mangaTitle);
}

const MAX_SLUG_ATTEMPTS = 50;

async function buildUniqueSlug(connection, title, options = {}) {
  const { excludeBookId = null } = options;
  const baseSlug = slugifyTitle(title);
  let attempt = 1;
  let slug = baseSlug;

  while (attempt <= MAX_SLUG_ATTEMPTS) {
    const params = [slug];
    let sql = 'SELECT id FROM books WHERE slug = ? LIMIT 1';

    if (excludeBookId) {
      sql = 'SELECT id FROM books WHERE slug = ? AND id <> ? LIMIT 1';
      params.push(excludeBookId);
    }

    const [rows] = await connection.query(sql, params);

    if (rows.length === 0) {
      return slug;
    }

    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  // Fallback unik terakhir: pakai suffix timestamp agar dijamin tidak bentrok.
  return `${baseSlug}-${Date.now()}`;
}

function sortPagesByNumber(pages = []) {
  return [...pages].sort((left, right) => {
    if (left.pageNumber !== right.pageNumber) {
      return left.pageNumber - right.pageNumber;
    }

    return (left.id || 0) - (right.id || 0);
  });
}

export {
  buildUniqueSlug,
  slugifyTitle,
  sortPagesByNumber,
  sanitizeFolderName,
};
