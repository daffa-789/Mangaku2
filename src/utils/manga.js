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

async function buildUniqueSlug(connection, title, options = {}) {
  const { excludeBookId = null } = options;
  const baseSlug = slugifyTitle(title);
  let attempt = 1;
  let slug = baseSlug;

  while (true) {
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
