import express from 'express';
import { pool } from '../config/db.js';
import { resolveRequestUser } from '../utils/access.js';
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
  parsePositiveInteger,
} from '../utils/response.js';
import { addCacheBuster } from '../utils/url.js';

const router = express.Router();

function createReaderNotFoundResponse(message) {
  return {
    status: 'error',
    code: 'READER_NOT_FOUND',
    message,
  };
}

// Middleware: Require authentication
router.use(async (req, res, next) => {
  try {
    const { user, error } = await resolveRequestUser(pool, req);
    if (error) return errorResponse(res, error.message, error.status);
    req.user = user;
    return next();
  } catch (error) {
    return serverErrorResponse(res, error);
  }
});

// GET /api/reader/manga/:slug/:chapter/:page
router.get('/manga/:slug/:chapter/:page', async (req, res) => {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  const chapterNumber = parsePositiveInteger(req.params.chapter);
  const pageNumber = parsePositiveInteger(req.params.page);

  if (!slug || !chapterNumber || !pageNumber) {
    return res.status(404).json(
      createReaderNotFoundResponse('Halaman reader yang kamu cari tidak ditemukan.'),
    );
  }

  try {
    // Fetch book
    const [bookRows] = await pool.query(
      `SELECT id, title, slug, author, thumbnail_url AS thumbnailUrl, description
       FROM books WHERE slug = ? LIMIT 1`,
      [slug],
    );
    const book = bookRows[0];
    if (!book) {
      return res.status(404).json(createReaderNotFoundResponse('Manga tidak ditemukan.'));
    }

    // Fetch chapters
    const [chapterRows] = await pool.query(
      `SELECT id, book_id AS bookId, chapter_number AS chapterNumber,
              release_date AS releaseDate, page_count AS pageCount,
              preview_image_url AS previewImageUrl
       FROM chapters WHERE book_id = ?
       ORDER BY chapter_number ASC, id ASC`,
      [book.id],
    );
    if (chapterRows.length === 0) {
      return res.status(404).json(
        createReaderNotFoundResponse('Manga ini belum punya chapter yang bisa dibaca.'),
      );
    }

    // Find active chapter
    const activeChapterIndex = chapterRows.findIndex(
      (ch) => Number(ch.chapterNumber) === chapterNumber,
    );
    if (activeChapterIndex === -1) {
      return res.status(404).json(createReaderNotFoundResponse('Chapter tidak ditemukan.'));
    }

    const activeChapter = chapterRows[activeChapterIndex];

    // Fetch pages
    const [pageRows] = await pool.query(
      `SELECT id, chapter_id AS chapterId, page_number AS pageNumber, image_url AS imageUrl
       FROM chapter_pages WHERE chapter_id = ?
       ORDER BY page_number ASC, id ASC`,
      [activeChapter.id],
    );
    if (pageRows.length === 0) {
      return res.status(404).json(
        createReaderNotFoundResponse('Chapter ini belum punya panel yang bisa dibaca.'),
      );
    }

    // Find active page
    const activePageIndex = pageRows.findIndex(
      (p) => Number(p.pageNumber) === pageNumber,
    );
    if (activePageIndex === -1) {
      return res.status(404).json(
        createReaderNotFoundResponse('Halaman manga tidak ditemukan.'),
      );
    }

    const activePage = pageRows[activePageIndex];
    return successResponse(res, 'Halaman reader berhasil dimuat.', {
      book: {
        id: book.id,
        title: book.title,
        slug: book.slug,
        author: book.author,
        thumbnailUrl: book.thumbnailUrl || null,
        description: book.description || '',
      },
      chapter: {
        id: activeChapter.id,
        chapterNumber: Number(activeChapter.chapterNumber),
        releaseDate: activeChapter.releaseDate || null,
        pageCount: Number(activeChapter.pageCount || pageRows.length),
        previewImageUrl: activeChapter.previewImageUrl || null,
      },
      pages: pageRows.map((p) => ({
        id: p.id,
        pageNumber: Number(p.pageNumber),
        imageUrl: addCacheBuster(p.imageUrl, p.id),
      })),
      page: {
        id: activePage.id,
        pageNumber: Number(activePage.pageNumber),
        imageUrl: addCacheBuster(activePage.imageUrl, activePage.id),
      },
      chapters: chapterRows.map((chapter) => ({
        id: chapter.id,
        chapterNumber: Number(chapter.chapterNumber),
        releaseDate: chapter.releaseDate || null,
        pageCount: Number(chapter.pageCount || 0),
        previewImageUrl: chapter.previewImageUrl || null,
        href: `/read/manga/${encodeURIComponent(book.slug)}/${Number(chapter.chapterNumber)}/1/`,
        isCurrent: chapter.id === activeChapter.id,
      })),
    });
  } catch (error) {
    return serverErrorResponse(res, error);
  }
});

export default router;
