import { parseGenreList } from './books-validation.js';
import { addCacheBuster } from '../utils/url.js';

function mapBookRow(row = {}) {
  // Field yang di-SELECT & dipetakan di sini HARUS sinkron dengan pemakaian UI
  // (dashboard.js). Field mati seperti panelCount/favoriteCount/totalReads*/createdBy*
  // sudah dihapus dari SELECT di books.js agar query lebih ringan.
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    author: row.author,
    genres: parseGenreList(row.genre),
    thumbnailUrl: row.thumbnailUrl ? addCacheBuster(row.thumbnailUrl, row.updatedAt || row.id) : null,
    description: row.description || '',
    publishedOn: row.publishedOn || null,
    status: row.status || 'to_read',
    isFavorite: Boolean(Number(row.isFavorite || 0)),
    chapterCount: Number(row.chapterCount || 0),
    firstChapterNumber:
      row.firstChapterNumber === null ? null : Number(row.firstChapterNumber),
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
