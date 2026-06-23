const BOOK_GENRES = new Set([
  'action', 'adventure', 'comedy', 'demons', 'drama', 'fantasy',
  'game', 'gore', 'harem', 'historical', 'horror', 'isekai', 'josei',
  'magic', 'martial_arts', 'mature', 'mecha', 'military', 'music',
  'mystery', 'parody', 'psychological', 'romance', 'school', 'sci_fi',
  'seinen', 'shoujo', 'shounen', 'slice_of_life', 'sports', 'supernatural',
  'thriller', 'vampire',
]);

const BOOK_STATUSES = new Set(['to_read', 'reading', 'completed']);

function normalizeOptionalInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function normalizePositiveInteger(value) {
  if (value === undefined || value === null || value === '') return Number.NaN;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeOptionalDate(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : Number.NaN;
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function normalizeGenreList(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  return [
    ...new Set(
      items
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function serializeGenreList(genres = []) {
  return normalizeGenreList(genres).join(',');
}

function parseGenreList(value) {
  return normalizeGenreList(value);
}

function normalizeBookPayload(body = {}) {
  const payload = {};
  if ('title' in body) payload.title = normalizeOptionalText(body.title);
  if ('author' in body) payload.author = normalizeOptionalText(body.author);
  if ('genres' in body || 'genre' in body) {
    payload.genres = normalizeGenreList(body.genres || body.genre);
  }
  if ('description' in body) payload.description = normalizeOptionalText(body.description);
  if ('thumbnailUrl' in body) payload.thumbnailUrl = normalizeOptionalText(body.thumbnailUrl);
  if ('publishedOn' in body) payload.publishedOn = normalizeOptionalDate(body.publishedOn);
  if ('status' in body) payload.status = String(body.status || '').trim().toLowerCase();
  return payload;
}

function validateBookPayload(payload, options = {}) {
  const {
    partial = false,
    bookStatuses = BOOK_STATUSES,
    currentYear = new Date().getFullYear(),
  } = options;

  if (partial && Object.keys(payload).length === 0) {
    return 'Tidak ada data manga yang dikirim untuk diperbarui.';
  }

  if (!partial || 'title' in payload) {
    if (!payload.title) return 'Judul manga wajib diisi.';
    if (payload.title.length > 255) return 'Judul manga maksimal 255 karakter.';
  }

  if (!partial || 'author' in payload) {
    if (!payload.author) return 'Nama author wajib diisi.';
    if (payload.author.length > 255) return 'Nama author maksimal 255 karakter.';
  }

  if (!partial || 'genres' in payload) {
    if (!Array.isArray(payload.genres) || payload.genres.length === 0) {
      return 'Pilih minimal satu genre manga.';
    }
    if (payload.genres.length > 6) return 'Genre maksimal 6 pilihan.';
    if (payload.genres.some((genre) => !BOOK_GENRES.has(genre))) {
      return 'Genre manga tidak valid.';
    }
  }

  if ('description' in payload && payload.description.length > 4000) {
    return 'Deskripsi maksimal 4000 karakter.';
  }

  if ('thumbnailUrl' in payload) {
    if (payload.thumbnailUrl.length > 500) return 'URL thumbnail maksimal 500 karakter.';
    if (
      payload.thumbnailUrl &&
      (!payload.thumbnailUrl.startsWith('/uploads/') ||
        !payload.thumbnailUrl.includes('/books/'))
    ) {
      return 'URL thumbnail tidak valid.';
    }
  }

  if ('publishedOn' in payload) {
    if (Number.isNaN(payload.publishedOn)) return 'Tanggal rilis tidak valid.';
    if (payload.publishedOn) {
      const publishedYear = Number.parseInt(payload.publishedOn.slice(0, 4), 10);
      if (publishedYear < 1900 || publishedYear > currentYear + 2) {
        return `Tanggal rilis harus berada antara tahun 1900 sampai ${currentYear + 2}.`;
      }
    }
  }

  if (!partial || 'status' in payload) {
    if (!bookStatuses.has(payload.status)) return 'Status manga tidak valid.';
  }

  return null;
}

function normalizeChapterPayload(body = {}) {
  return {
    chapterNumber: normalizePositiveInteger(body.chapterNumber),
    releaseDate: normalizeOptionalDate(body.releaseDate),
    pageCount: normalizePositiveInteger(body.pageCount),
  };
}

function validateChapterPayload(payload, options = {}) {
  const { maxChapterPages = 200 } = options;

  if (Number.isNaN(payload.chapterNumber)) {
    return 'Nomor chapter wajib berupa angka bulat positif.';
  }
  if (Number.isNaN(payload.releaseDate)) {
    return 'Tanggal chapter tidak valid.';
  }
  if (Number.isNaN(payload.pageCount)) {
    return 'Jumlah panel wajib berupa angka bulat positif.';
  }
  if (payload.pageCount > maxChapterPages) {
    return `Jumlah panel maksimal ${maxChapterPages}.`;
  }

  return null;
}

export {
  BOOK_GENRES,
  BOOK_STATUSES,
  normalizeOptionalInteger,
  normalizePositiveInteger,
  normalizeOptionalText,
  normalizeOptionalDate,
  normalizeBoolean,
  normalizeGenreList,
  serializeGenreList,
  parseGenreList,
  normalizeBookPayload,
  validateBookPayload,
  normalizeChapterPayload,
  validateChapterPayload,
};
