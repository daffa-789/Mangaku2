import { parseGenreList } from './books-validation.js';

function addCacheBuster(url, version) {
  if (!url) return url;
  const separator = String(url).includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(version || '0'))}`;
}

function mapBookRow(row = {}) {
  return {
    id: row.id,
    displayOrder: Number(row.displayOrder || 0),
    title: row.title,
    slug: row.slug,
    author: row.author,
    genres: parseGenreList(row.genre),
    thumbnailUrl: row.thumbnailUrl ? addCacheBuster(row.thumbnailUrl, row.updatedAt || row.id) : null,
    description: row.description || '',
    publishedOn: row.publishedOn || null,
    status: row.status || 'to_read',
    isFavorite: Boolean(Number(row.isFavorite || 0)),
    favoriteCount: Number(row.favoriteCount || 0),
    chapterCount: Number(row.chapterCount || 0),
    panelCount: Number(row.panelCount || 0),
    firstChapterNumber:
      row.firstChapterNumber === null ? null : Number(row.firstChapterNumber),
    latestChapterNumber:
      row.latestChapterNumber === null ? null : Number(row.latestChapterNumber),
    createdByUserId:
      row.createdByUserId === null ? null : Number(row.createdByUserId),
    createdByEmail: row.createdByEmail || null,
    createdByRole: row.createdByRole || null,
    totalReads: Number(row.totalReads || 0),
    totalReadSeconds: Number(row.totalReadSeconds || 0),
    lastReadAt: row.lastReadAt || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function mapChapterRow(row = {}) {
  return {
    id: row.id,
    bookId: row.bookId === null ? null : Number(row.bookId),
    chapterNumber: Number(row.chapterNumber || 0),
    releaseDate: row.releaseDate || null,
    pageCount: Number(row.pageCount || 0),
    previewImageUrl: row.previewImageUrl || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
  };
}

function mapPageRow(row = {}) {
  return {
    id: row.id,
    chapterId: row.chapterId === null ? null : Number(row.chapterId),
    pageNumber: Number(row.pageNumber || 0),
    imageUrl: row.imageUrl,
    createdAt: row.createdAt || null,
  };
}

export {
  mapBookRow,
  mapChapterRow,
  mapPageRow,
};
