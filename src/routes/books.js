import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import multer from "multer";
import { pool } from "../config/db.js";
import {
  buildUniqueSlug,
  sortPagesByNumber,
  sanitizeFolderName,
} from "../utils/manga.js";
import { resolveRequestUser, hasMinimumRole } from "../utils/access.js";
import { logActivity } from "../utils/activity.js";
import {
  BOOK_STATUSES,
  normalizeOptionalInteger,
  normalizeBookPayload,
  validateBookPayload,
  normalizeChapterPayload,
  validateChapterPayload,
  normalizeBoolean,
  serializeGenreList,
} from "./books-validation.js";
import { mapBookRow, mapChapterRow, mapPageRow } from "./books-mappers.js";
import { cache } from "../utils/cache.js";

const router = express.Router();

// Cache configuration
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const PAGINATION_DEFAULT_LIMIT = 12;
const PAGINATION_MAX_LIMIT = 100;

const MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;
const MAX_PAGE_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_CHAPTER_PAGES = 200;
const MIN_READING_SECONDS = 5;
const MAX_READING_SECONDS = 24 * 60 * 60;
const CURRENT_YEAR = new Date().getFullYear();
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const publicUploadDir = path.join(__dirname, "..", "..", "public", "uploads");
fs.mkdirSync(publicUploadDir, { recursive: true });

function parsePositiveInteger(rawValue) {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createStorage(mangaTitle, fileType, chapterNumber = null) {
  const safeMangaFolder = sanitizeFolderName(mangaTitle);
  const mangaUploadPath = path.join(publicUploadDir, safeMangaFolder);

  function resolveDestination(req) {
    if (fileType === "thumbnail") {
      return path.join(mangaUploadPath, "books");
    }

    if (fileType === "page") {
      const requestChapterNumber = req.body?.chapterNumber ?? chapterNumber;
      const safeChapterFolder = Number.isInteger(Number(requestChapterNumber))
        ? `chapter-${Number(requestChapterNumber)}`
        : "chapter-unknown";

      return path.join(mangaUploadPath, "pages", safeChapterFolder);
    }

    return mangaUploadPath;
  }

  return multer.diskStorage({
    destination(req, _file, callback) {
      const destination = resolveDestination(req);
      fs.mkdirSync(destination, { recursive: true });
      callback(null, destination);
    },
    filename(_req, file, callback) {
      const extension =
        path.extname(file.originalname || "").toLowerCase() || ".jpg";

      if (fileType === "thumbnail") {
        callback(null, `thumbnail${extension}`);
        return;
      }

      if (fileType === "page") {
        const match = String(file.fieldname || "").match(/\d+/);
        const pageNumber = match ? match[0] : "unknown";
        callback(null, `panel-${pageNumber}${extension}`);
        return;
      }

      callback(
        null,
        `${fileType}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`,
      );
    },
  });
}

function imageFileFilter(_req, file, callback) {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    callback(new Error("Format gambar tidak didukung."));
    return;
  }

  callback(null, true);
}

function createUploadMiddleware(fileType, options = {}) {
  const { mangaTitle = "manga", chapterNumber = null } = options;
  return multer({
    storage: createStorage(mangaTitle, fileType, chapterNumber),
    limits:
      fileType === "thumbnail"
        ? { fileSize: MAX_THUMBNAIL_SIZE }
        : { fileSize: MAX_PAGE_IMAGE_SIZE, files: MAX_CHAPTER_PAGES },
    fileFilter: imageFileFilter,
  });
}

function cleanupUploadedFiles(files = []) {
  files.forEach((file) => {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  });
}

function resolveManagedUploadPath(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) {
    return null;
  }

  const filePath = path.join(publicUploadDir, url.replace(/^\/uploads\//, ""));
  const normalizedPath = path.normalize(filePath);

  // Prevent path traversal attacks: ensure normalized path is still within uploads directory
  if (
    !normalizedPath.startsWith(path.normalize(publicUploadDir) + path.sep) &&
    normalizedPath !== path.normalize(publicUploadDir)
  ) {
    return null;
  }

  return normalizedPath;
}

function deleteManagedFiles(urls = []) {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];

  uniqueUrls.forEach((url) => {
    const filePath = resolveManagedUploadPath(url);

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}

function getPageUrlFromFile(file, mangaTitle = null, chapterNumber = null) {
  const safeMangaFolder = sanitizeFolderName(mangaTitle || "manga");
  const safeChapterFolder = Number.isInteger(Number(chapterNumber))
    ? `chapter-${Number(chapterNumber)}`
    : "chapter-unknown";

  return `/uploads/${safeMangaFolder}/pages/${safeChapterFolder}/${file.filename}`;
}

function parseUploadedPageFiles(files = []) {
  const pageFiles = new Map();

  for (const file of files) {
    const match = String(file.fieldname || "").match(/^page-(\d+)$/);

    if (!match) {
      return {
        error: "Field upload panel tidak valid.",
      };
    }

    const pageNumber = Number.parseInt(match[1], 10);

    if (pageFiles.has(pageNumber)) {
      return {
        error: `Upload panel ${pageNumber} terdeteksi lebih dari satu file.`,
      };
    }

    pageFiles.set(pageNumber, file);
  }

  return { pageFiles };
}

function buildPageSavePlan(options) {
  const {
    pageCount,
    existingPages = [],
    uploadedPageFiles = new Map(),
    mangaTitle = null,
    chapterNumber = null,
  } = options;
  const existingByNumber = new Map(
    existingPages.map((page) => [page.pageNumber, page]),
  );
  const finalPages = [];
  const removedUrls = [];

  for (const pageNumber of uploadedPageFiles.keys()) {
    if (pageNumber > pageCount) {
      return {
        error: `Upload untuk panel ${pageNumber} melebihi jumlah panel yang diatur.`,
      };
    }
  }

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const uploadedFile = uploadedPageFiles.get(pageNumber);
    const existingPage = existingByNumber.get(pageNumber);

    if (uploadedFile) {
      finalPages.push({
        pageNumber,
        imageUrl: getPageUrlFromFile(uploadedFile, mangaTitle, chapterNumber),
      });

      if (existingPage) {
        removedUrls.push(existingPage.imageUrl);
      }

      continue;
    }

    if (existingPage) {
      finalPages.push({
        pageNumber,
        imageUrl: existingPage.imageUrl,
      });
      continue;
    }

    return {
      error: `Gambar untuk panel ${pageNumber} wajib diunggah.`,
    };
  }

  existingPages.forEach((page) => {
    if (page.pageNumber > pageCount) {
      removedUrls.push(page.imageUrl);
    }
  });

  const finalUrls = new Set(finalPages.map((p) => p.imageUrl));

  return {
    finalPages,
    removedUrls: [...new Set(removedUrls.filter((url) => url && !finalUrls.has(url)))],
  };
}

async function getNextBookDisplayOrder(connection) {
  const [rows] = await connection.query(
    "SELECT COALESCE(MAX(display_order), 0) + 1 AS nextOrder FROM books",
  );
  return Number(rows[0]?.nextOrder || 1);
}

async function compactBookDisplayOrder(connection) {
  const [rows] = await connection.query(
    "SELECT id FROM books ORDER BY display_order ASC, id ASC",
  );

  for (let index = 0; index < rows.length; index += 1) {
    await connection.query("UPDATE books SET display_order = ? WHERE id = ?", [
      index + 1,
      rows[index].id,
    ]);
  }
}

async function getNextChapterNumber(connection, bookId, options = {}) {
  const { excludeChapterId = null } = options;
  const params = [bookId];
  let sql =
    "SELECT COALESCE(MAX(chapter_number), 0) + 1 AS nextNumber FROM chapters WHERE book_id = ?";

  if (excludeChapterId) {
    sql += " AND id <> ?";
    params.push(excludeChapterId);
  }

  const [rows] = await connection.query(sql, params);
  return Number(rows[0]?.nextNumber || 1);
}

async function chapterNumberExists(
  connection,
  bookId,
  chapterNumber,
  options = {},
) {
  const { excludeChapterId = null } = options;
  const params = [bookId, chapterNumber];
  let sql =
    "SELECT id FROM chapters WHERE book_id = ? AND chapter_number = ? LIMIT 1";

  if (excludeChapterId) {
    sql =
      "SELECT id FROM chapters WHERE book_id = ? AND chapter_number = ? AND id <> ? LIMIT 1";
    params.push(excludeChapterId);
  }

  const [rows] = await connection.query(sql, params);
  return rows.length > 0;
}

async function getBookById(connection, bookId) {
  const [rows] = await connection.query(
    `SELECT id,
            user_id AS createdByUserId,
            title,
            slug,
            thumbnail_url AS thumbnailUrl
     FROM books
     WHERE id = ?
     LIMIT 1`,
    [bookId],
  );

  return rows[0] || null;
}

async function getChapterOwnership(connection, bookId, chapterId) {
  const [rows] = await connection.query(
    `SELECT id,
            book_id AS bookId,
            chapter_number AS chapterNumber,
            preview_image_url AS previewImageUrl
     FROM chapters
     WHERE id = ? AND book_id = ?
     LIMIT 1`,
    [chapterId, bookId],
  );

  return rows[0] || null;
}

// ============ Cache Helper Functions ============
function getCacheKeyBooks(userId, options = {}) {
  const {
    favoritesOnly = false,
    page = 1,
    limit = PAGINATION_DEFAULT_LIMIT,
  } = options;
  const type = favoritesOnly ? "favorites" : "all";
  return `books:${userId}:${type}:page${page}:limit${limit}`;
}

function getCacheKeyBookDetail(bookId) {
  return `book:${bookId}:detail`;
}

function invalidateUserBooksCache(userId) {
  // Invalidate all books cache for this user
  cache.invalidatePattern(`books:${userId}:.*`);
  cache.invalidatePattern(`book:.*:detail`);
}

function invalidateBookCache(bookId) {
  cache.delete(`book:${bookId}:detail`);
  // Also invalidate all user books caches since book details changed
  cache.invalidatePattern(`books:.*`);
}

// ============ Pagination Helper Functions ============
function parsePositiveIntegerParam(value, defaultValue = 1, maxValue = 100) {
  const num = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(num) || num < 1) return defaultValue;
  return Math.min(num, maxValue);
}

async function fetchBooksWithPagination(
  connection,
  currentUserId,
  options = {},
) {
  const {
    favoritesOnly = false,
    page = 1,
    limit = PAGINATION_DEFAULT_LIMIT,
    useCache = true,
  } = options;

  // Check cache first
  if (useCache) {
    const cacheKey = getCacheKeyBooks(currentUserId, {
      favoritesOnly,
      page,
      limit,
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const safePage = Math.max(1, page);
  const safeLimit = Math.min(Math.max(1, limit), PAGINATION_MAX_LIMIT);
  const offset = (safePage - 1) * safeLimit;

  const params = [currentUserId, currentUserId];
  let favoriteClause = "";

  if (favoritesOnly) {
    favoriteClause = "WHERE uf.user_id IS NOT NULL";
  }

  // Get total count
  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM books b
     LEFT JOIN user_favorites uf
       ON uf.book_id = b.id AND uf.user_id = ?
     ${favoritesOnly ? "WHERE uf.user_id IS NOT NULL" : ""}`,
    [currentUserId],
  );
  const totalBooks = countRows[0]?.total || 0;
  const totalPages = Math.ceil(totalBooks / safeLimit);

  // Get paginated books
  const [rows] = await connection.query(
    `SELECT b.id,
            b.display_order AS displayOrder,
            b.title,
            b.slug,
            b.author,
            b.genre,
            b.thumbnail_url AS thumbnailUrl,
            b.description,
            b.published_on AS publishedOn,
            b.status,
            b.user_id AS createdByUserId,
            owner.email AS createdByEmail,
            owner.role AS createdByRole,
            b.created_at AS createdAt,
            b.updated_at AS updatedAt,
            COALESCE(cs.chapterCount, 0) AS chapterCount,
            COALESCE(cs.panelCount, 0) AS panelCount,
            cs.firstChapterNumber,
            cs.latestChapterNumber,
            CASE WHEN uf.user_id IS NULL THEN 0 ELSE 1 END AS isFavorite,
            COALESCE(fc.favoriteCount, 0) AS favoriteCount,
            COALESCE(rs.totalReads, 0) AS totalReads,
            COALESCE(rs.totalReadSeconds, 0) AS totalReadSeconds,
            rs.lastReadAt
     FROM books b
     LEFT JOIN users owner ON owner.id = b.user_id
     LEFT JOIN (
       SELECT book_id,
              COUNT(*) AS chapterCount,
              COALESCE(SUM(page_count), 0) AS panelCount,
              MIN(chapter_number) AS firstChapterNumber,
              MAX(chapter_number) AS latestChapterNumber
       FROM chapters
       GROUP BY book_id
     ) cs ON cs.book_id = b.id
     LEFT JOIN user_favorites uf
       ON uf.book_id = b.id AND uf.user_id = ?
     LEFT JOIN (
       SELECT book_id, COUNT(*) AS favoriteCount
       FROM user_favorites
       GROUP BY book_id
     ) fc ON fc.book_id = b.id
     LEFT JOIN (
       SELECT book_id,
              COUNT(*) AS totalReads,
              COALESCE(SUM(duration_seconds), 0) AS totalReadSeconds,
              MAX(created_at) AS lastReadAt
       FROM reading_sessions
       WHERE user_id = ?
       GROUP BY book_id
     ) rs ON rs.book_id = b.id
     ${favoriteClause}
     ORDER BY b.updated_at DESC, b.display_order ASC, b.id DESC
     LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset],
  );

  const books = rows.map(mapBookRow);
  const result = {
    books,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: totalBooks,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };

  // Cache result
  if (useCache) {
    const cacheKey = getCacheKeyBooks(currentUserId, {
      favoritesOnly,
      page,
      limit,
    });
    cache.set(cacheKey, result, CACHE_DURATION_MS);
  }

  return result;
}

async function fetchBooks(connection, currentUserId, options = {}) {
  const { favoritesOnly = false } = options;
  const params = [currentUserId, currentUserId];
  let favoriteClause = "";

  if (favoritesOnly) {
    favoriteClause = "WHERE uf.user_id IS NOT NULL";
  }

  const [rows] = await connection.query(
    `SELECT b.id,
            b.display_order AS displayOrder,
            b.title,
            b.slug,
            b.author,
            b.genre,
            b.thumbnail_url AS thumbnailUrl,
            b.description,
            b.published_on AS publishedOn,
            b.status,
            b.user_id AS createdByUserId,
            owner.email AS createdByEmail,
            owner.role AS createdByRole,
            b.created_at AS createdAt,
            b.updated_at AS updatedAt,
            COALESCE(cs.chapterCount, 0) AS chapterCount,
            COALESCE(cs.panelCount, 0) AS panelCount,
            cs.firstChapterNumber,
            cs.latestChapterNumber,
            CASE WHEN uf.user_id IS NULL THEN 0 ELSE 1 END AS isFavorite,
            COALESCE(fc.favoriteCount, 0) AS favoriteCount,
            COALESCE(rs.totalReads, 0) AS totalReads,
            COALESCE(rs.totalReadSeconds, 0) AS totalReadSeconds,
            rs.lastReadAt
     FROM books b
     LEFT JOIN users owner ON owner.id = b.user_id
     LEFT JOIN (
       SELECT book_id,
              COUNT(*) AS chapterCount,
              COALESCE(SUM(page_count), 0) AS panelCount,
              MIN(chapter_number) AS firstChapterNumber,
              MAX(chapter_number) AS latestChapterNumber
       FROM chapters
       GROUP BY book_id
     ) cs ON cs.book_id = b.id
     LEFT JOIN user_favorites uf
       ON uf.book_id = b.id AND uf.user_id = ?
     LEFT JOIN (
       SELECT book_id, COUNT(*) AS favoriteCount
       FROM user_favorites
       GROUP BY book_id
     ) fc ON fc.book_id = b.id
     LEFT JOIN (
       SELECT book_id,
              COUNT(*) AS totalReads,
              COALESCE(SUM(duration_seconds), 0) AS totalReadSeconds,
              MAX(created_at) AS lastReadAt
       FROM reading_sessions
       WHERE user_id = ?
       GROUP BY book_id
     ) rs ON rs.book_id = b.id
     ${favoriteClause}
     ORDER BY b.updated_at DESC, b.display_order ASC, b.id DESC`,
    params,
  );

  return rows.map(mapBookRow);
}

async function fetchBookById(connection, currentUserId, bookId) {
  const [rows] = await connection.query(
    `SELECT b.id,
            b.display_order AS displayOrder,
            b.title,
            b.slug,
            b.author,
            b.genre,
            b.thumbnail_url AS thumbnailUrl,
            b.description,
            b.published_on AS publishedOn,
            b.status,
            b.user_id AS createdByUserId,
            owner.email AS createdByEmail,
            owner.role AS createdByRole,
            b.created_at AS createdAt,
            b.updated_at AS updatedAt,
            COALESCE(cs.chapterCount, 0) AS chapterCount,
            COALESCE(cs.panelCount, 0) AS panelCount,
            cs.firstChapterNumber,
            cs.latestChapterNumber,
            CASE WHEN uf.user_id IS NULL THEN 0 ELSE 1 END AS isFavorite,
            COALESCE(fc.favoriteCount, 0) AS favoriteCount,
            COALESCE(rs.totalReads, 0) AS totalReads,
            COALESCE(rs.totalReadSeconds, 0) AS totalReadSeconds,
            rs.lastReadAt
     FROM books b
     LEFT JOIN users owner ON owner.id = b.user_id
     LEFT JOIN (
       SELECT book_id,
              COUNT(*) AS chapterCount,
              COALESCE(SUM(page_count), 0) AS panelCount,
              MIN(chapter_number) AS firstChapterNumber,
              MAX(chapter_number) AS latestChapterNumber
       FROM chapters
       GROUP BY book_id
     ) cs ON cs.book_id = b.id
     LEFT JOIN user_favorites uf
       ON uf.book_id = b.id AND uf.user_id = ?
     LEFT JOIN (
       SELECT book_id, COUNT(*) AS favoriteCount
       FROM user_favorites
       GROUP BY book_id
     ) fc ON fc.book_id = b.id
     LEFT JOIN (
       SELECT book_id,
              COUNT(*) AS totalReads,
              COALESCE(SUM(duration_seconds), 0) AS totalReadSeconds,
              MAX(created_at) AS lastReadAt
       FROM reading_sessions
       WHERE user_id = ?
       GROUP BY book_id
     ) rs ON rs.book_id = b.id
     WHERE b.id = ?
     LIMIT 1`,
    [currentUserId, currentUserId, bookId],
  );

  if (!rows[0]) {
    return null;
  }

  const [chapterRows] = await connection.query(
    `SELECT id,
            book_id AS bookId,
            chapter_number AS chapterNumber,
            release_date AS releaseDate,
            page_count AS pageCount,
            preview_image_url AS previewImageUrl,
            created_at AS createdAt,
            updated_at AS updatedAt
     FROM chapters
     WHERE book_id = ?
     ORDER BY chapter_number ASC, id ASC`,
    [bookId],
  );

  return {
    ...mapBookRow(rows[0]),
    chapters: chapterRows.map(mapChapterRow),
  };
}

async function fetchChapterById(connection, bookId, chapterId) {
  const [chapterRows] = await connection.query(
    `SELECT id,
            book_id AS bookId,
            chapter_number AS chapterNumber,
            release_date AS releaseDate,
            page_count AS pageCount,
            preview_image_url AS previewImageUrl,
            created_at AS createdAt,
            updated_at AS updatedAt
     FROM chapters
     WHERE id = ? AND book_id = ?
     LIMIT 1`,
    [chapterId, bookId],
  );

  if (!chapterRows[0]) {
    return null;
  }

  const [pageRows] = await connection.query(
    `SELECT id,
            chapter_id AS chapterId,
            page_number AS pageNumber,
            image_url AS imageUrl,
            created_at AS createdAt
     FROM chapter_pages
     WHERE chapter_id = ?
     ORDER BY page_number ASC, id ASC`,
    [chapterId],
  );

  return {
    ...mapChapterRow(chapterRows[0]),
    pages: sortPagesByNumber(pageRows.map(mapPageRow)),
  };
}

function requireCatalogManager(req, res) {
  if (!hasMinimumRole(req.user?.role, "admin")) {
    res.status(403).json({
      status: "error",
      message: "Akses admin atau super admin diperlukan.",
    });
    return false;
  }

  return true;
}

function requireAdmin(req, res) {
  if (!hasMinimumRole(req.user?.role, "admin")) {
    res.status(403).json({
      status: "error",
      message: "Akses admin atau super admin diperlukan.",
    });
    return false;
  }

  return true;
}

router.use(async (req, res, next) => {
  try {
    const { user, error } = await resolveRequestUser(pool, req);

    if (error) {
      return res.status(error.status).json({
        status: "error",
        message: error.message,
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Books auth check error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const page = parsePositiveIntegerParam(req.query.page, 1);
    const limit = parsePositiveIntegerParam(
      req.query.limit,
      PAGINATION_DEFAULT_LIMIT,
      PAGINATION_MAX_LIMIT,
    );

    const result = await fetchBooksWithPagination(pool, req.user.id, {
      favoritesOnly: false,
      page,
      limit,
    });

    return res.status(200).json({
      status: "success",
      message: "Daftar manga berhasil dimuat.",
      data: result.books,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Books list error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.get("/favorites", async (req, res) => {
  try {
    const page = parsePositiveIntegerParam(req.query.page, 1);
    const limit = parsePositiveIntegerParam(
      req.query.limit,
      PAGINATION_DEFAULT_LIMIT,
      PAGINATION_MAX_LIMIT,
    );

    const result = await fetchBooksWithPagination(pool, req.user.id, {
      favoritesOnly: true,
      page,
      limit,
    });

    return res.status(200).json({
      status: "success",
      message: "Daftar manga favorit berhasil dimuat.",
      data: result.books,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Favorites error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const [[catalogTotals]] = await pool.query(
      `SELECT COUNT(*) AS totalBooks
       FROM books`,
    );

    const [[chapterTotals]] = await pool.query(
      `SELECT COUNT(*) AS totalChapters,
              COALESCE(SUM(page_count), 0) AS totalPanels
       FROM chapters`,
    );

    const [[favoriteTotals]] = await pool.query(
      `SELECT COUNT(*) AS totalFavorites
       FROM user_favorites`,
    );

    const [[viewerFavorites]] = await pool.query(
      `SELECT COUNT(*) AS totalFavorites
       FROM user_favorites
       WHERE user_id = ?`,
      [req.user.id],
    );

    const [[viewerReads]] = await pool.query(
      `SELECT COUNT(*) AS totalReads,
              COALESCE(SUM(duration_seconds), 0) AS totalReadSeconds,
              MAX(created_at) AS lastReadAt
       FROM reading_sessions
       WHERE user_id = ?`,
      [req.user.id],
    );

    const [[roleTotals]] = await pool.query(
      `SELECT COUNT(*) AS totalUsers,
              SUM(CASE WHEN role = 'super_admin' THEN 1 ELSE 0 END) AS totalSuperAdmins,
              SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS totalAdmins,
              SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS totalReaders
       FROM users`,
    );

    return res.status(200).json({
      status: "success",
      data: {
        catalog: {
          totalBooks: Number(catalogTotals.totalBooks || 0),
          totalChapters: Number(chapterTotals.totalChapters || 0),
          totalPanels: Number(chapterTotals.totalPanels || 0),
          totalFavorites: Number(favoriteTotals.totalFavorites || 0),
        },
        audience: {
          totalUsers: Number(roleTotals.totalUsers || 0),
          totalSuperAdmins: Number(roleTotals.totalSuperAdmins || 0),
          totalAdmins: Number(roleTotals.totalAdmins || 0),
          totalReaders: Number(roleTotals.totalReaders || 0),
        },
        viewer: {
          totalFavorites: Number(viewerFavorites.totalFavorites || 0),
          totalReads: Number(viewerReads.totalReads || 0),
          totalReadSeconds: Number(viewerReads.totalReadSeconds || 0),
          lastReadAt: viewerReads.lastReadAt || null,
        },
      },
    });
  } catch (error) {
    console.error("Stats error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.post("/upload-thumbnail", (req, res) => {
  if (!requireCatalogManager(req, res)) {
    return;
  }

  const mangaTitle = String(req.query.title || req.body.title || "").trim();

  if (!mangaTitle) {
    return res.status(400).json({
      status: "error",
      message: "Judul manga wajib dikirimkan untuk upload thumbnail.",
    });
  }

  const upload = createUploadMiddleware("thumbnail", {
    mangaTitle,
  });

  upload.single("thumbnail")(req, res, (error) => {
    if (error) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          status: "error",
          message: "Ukuran thumbnail maksimal 10MB.",
        });
      }

      return res.status(400).json({
        status: "error",
        message: error.message || "Upload thumbnail gagal.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "File thumbnail wajib dipilih.",
      });
    }

    return res.status(201).json({
      status: "success",
      message: "Thumbnail berhasil diunggah.",
      data: {
        thumbnailUrl: `/uploads/${sanitizeFolderName(mangaTitle)}/books/${req.file.filename}`,
      },
    });
  });
});

router.post("/", async (req, res) => {
  if (!requireCatalogManager(req, res)) {
    return;
  }

  const payload = normalizeBookPayload(req.body);
  const validationError = validateBookPayload(payload, {
    bookStatuses: BOOK_STATUSES,
    currentYear: CURRENT_YEAR,
  });

  if (validationError) {
    return res.status(400).json({
      status: "error",
      message: validationError,
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const displayOrder = await getNextBookDisplayOrder(connection);
    const slug = await buildUniqueSlug(connection, payload.title);

    const [result] = await connection.query(
      `INSERT INTO books
       (user_id, display_order, title, slug, author, genre, thumbnail_url, description, published_on, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        displayOrder,
        payload.title,
        slug,
        payload.author,
        serializeGenreList(payload.genres),
        payload.thumbnailUrl || null,
        payload.description || null,
        payload.publishedOn,
        payload.status,
      ],
    );

    await logActivity(
      connection,
      req.user.id,
      "create_manga",
      `${req.user.email} menambahkan manga ${payload.title}.`,
      {
        targetType: "book",
        targetId: result.insertId,
      },
    );

    await connection.commit();

    invalidateUserBooksCache(req.user.id);

    const book = await fetchBookById(pool, req.user.id, result.insertId);

    return res.status(201).json({
      status: "success",
      message: "Manga berhasil ditambahkan.",
      data: book,
    });
  } catch (error) {
    await connection.rollback();
    // Cleanup uploaded thumbnail if book creation failed
    if (payload.thumbnailUrl) {
      deleteManagedFiles([payload.thumbnailUrl]);
    }
    console.error("Create manga error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  } finally {
    connection.release();
  }
});

router.get("/:id/chapters/:chapterId", async (req, res) => {
  if (!requireCatalogManager(req, res)) {
    return;
  }

  const bookId = parsePositiveInteger(req.params.id);
  const chapterId = parsePositiveInteger(req.params.chapterId);

  if (!bookId || !chapterId) {
    return res.status(400).json({
      status: "error",
      message: "ID manga atau chapter tidak valid.",
    });
  }

  try {
    const chapter = await fetchChapterById(pool, bookId, chapterId);

    if (!chapter) {
      return res.status(404).json({
        status: "error",
        message: "Chapter tidak ditemukan.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Detail chapter berhasil dimuat.",
      data: chapter,
    });
  } catch (error) {
    console.error("Chapter detail error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.post("/:id/chapters", async (req, res) => {
  if (!requireCatalogManager(req, res)) {
    return;
  }

  const bookId = parsePositiveInteger(req.params.id);

  if (!bookId) {
    return res.status(400).json({
      status: "error",
      message: "ID manga tidak valid.",
    });
  }

  try {
    const book = await getBookById(pool, bookId);

    if (!book) {
      return res.status(404).json({
        status: "error",
        message: "Manga tidak ditemukan.",
      });
    }

    const upload = createUploadMiddleware("page", {
      mangaTitle: book.title,
    });

    upload.any()(req, res, async (error) => {
      if (error) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            status: "error",
            message: "Ukuran gambar panel maksimal 8MB per file.",
          });
        }

        return res.status(400).json({
          status: "error",
          message: error.message || "Upload chapter gagal.",
        });
      }

      const uploadedFiles = Array.isArray(req.files) ? req.files : [];
      const payload = normalizeChapterPayload(req.body);
      const validationError = validateChapterPayload(payload, {
        maxChapterPages: MAX_CHAPTER_PAGES,
      });

      if (validationError) {
        cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({
          status: "error",
          message: validationError,
        });
      }

      const { pageFiles, error: pageFilesError } =
        parseUploadedPageFiles(uploadedFiles);

      if (pageFilesError) {
        cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({
          status: "error",
          message: pageFilesError,
        });
      }

      if (pageFiles.size !== payload.pageCount) {
        cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({
          status: "error",
          message: "Semua panel chapter wajib diunggah.",
        });
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const existingBook = await getBookById(connection, bookId);

        if (!existingBook) {
          cleanupUploadedFiles(uploadedFiles);
          await connection.rollback();
          return res.status(404).json({
            status: "error",
            message: "Manga tidak ditemukan.",
          });
        }

        const duplicateNumber = await chapterNumberExists(
          connection,
          bookId,
          payload.chapterNumber,
        );

        if (duplicateNumber) {
          cleanupUploadedFiles(uploadedFiles);
          await connection.rollback();
          return res.status(409).json({
            status: "error",
            message: "Nomor chapter sudah dipakai untuk manga ini.",
          });
        }

        const pagePlan = buildPageSavePlan({
          pageCount: payload.pageCount,
          existingPages: [],
          uploadedPageFiles: pageFiles,
          mangaTitle: existingBook.title,
          chapterNumber: payload.chapterNumber,
        });

        if (pagePlan.error) {
          cleanupUploadedFiles(uploadedFiles);
          await connection.rollback();
          return res.status(400).json({
            status: "error",
            message: pagePlan.error,
          });
        }

        const nextDisplayOrder = await getNextChapterNumber(connection, bookId);

        const [chapterResult] = await connection.query(
          `INSERT INTO chapters
           (book_id, display_order, chapter_number, chapter_label, release_date, page_count, preview_image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            bookId,
            nextDisplayOrder,
            payload.chapterNumber,
            String(payload.chapterNumber),
            payload.releaseDate,
            payload.pageCount,
            pagePlan.finalPages[0]?.imageUrl || null,
          ],
        );

        for (const page of pagePlan.finalPages) {
          await connection.query(
            `INSERT INTO chapter_pages
             (chapter_id, page_number, image_url)
             VALUES (?, ?, ?)`,
            [chapterResult.insertId, page.pageNumber, page.imageUrl],
          );
        }

        await logActivity(
          connection,
          req.user.id,
          "create_chapter",
          `${req.user.email} menambahkan chapter ${payload.chapterNumber} ke ${existingBook.title}.`,
          {
            targetType: "chapter",
            targetId: chapterResult.insertId,
          },
        );

        await connection.commit();
        invalidateUserBooksCache(req.user.id);
        const chapter = await fetchChapterById(
          pool,
          bookId,
          chapterResult.insertId,
        );

        return res.status(201).json({
          status: "success",
          message: "Chapter berhasil ditambahkan.",
          data: chapter,
        });
      } catch (createError) {
        cleanupUploadedFiles(uploadedFiles);
        await connection.rollback();
        console.error("Create chapter error:", createError.message);
        return res.status(500).json({
          status: "error",
          message: "Terjadi kesalahan pada server.",
        });
      } finally {
        connection.release();
      }
    });
  } catch (error) {
    console.error("Chapter POST error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.put("/:id/chapters/:chapterId", async (req, res) => {
  if (!requireCatalogManager(req, res)) {
    return;
  }

  const bookId = parsePositiveInteger(req.params.id);
  const chapterId = parsePositiveInteger(req.params.chapterId);

  if (!bookId || !chapterId) {
    return res.status(400).json({
      status: "error",
      message: "ID manga atau chapter tidak valid.",
    });
  }

  try {
    const book = await getBookById(pool, bookId);

    if (!book) {
      return res.status(404).json({
        status: "error",
        message: "Manga tidak ditemukan.",
      });
    }

    const upload = createUploadMiddleware("page", {
      mangaTitle: book.title,
    });

    upload.any()(req, res, async (error) => {
      if (error) {
        if (error.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            status: "error",
            message: "Ukuran gambar panel maksimal 8MB per file.",
          });
        }

        return res.status(400).json({
          status: "error",
          message: error.message || "Update chapter gagal.",
        });
      }

      const uploadedFiles = Array.isArray(req.files) ? req.files : [];
      const payload = normalizeChapterPayload(req.body);
      const validationError = validateChapterPayload(payload, {
        maxChapterPages: MAX_CHAPTER_PAGES,
      });

      if (validationError) {
        cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({
          status: "error",
          message: validationError,
        });
      }

      const { pageFiles, error: pageFilesError } =
        parseUploadedPageFiles(uploadedFiles);

      if (pageFilesError) {
        cleanupUploadedFiles(uploadedFiles);
        return res.status(400).json({
          status: "error",
          message: pageFilesError,
        });
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const existingBook = await getBookById(connection, bookId);
        const existingChapter = await getChapterOwnership(
          connection,
          bookId,
          chapterId,
        );

        if (!existingBook || !existingChapter) {
          cleanupUploadedFiles(uploadedFiles);
          await connection.rollback();
          return res.status(404).json({
            status: "error",
            message: "Chapter tidak ditemukan.",
          });
        }

        const duplicateNumber = await chapterNumberExists(
          connection,
          bookId,
          payload.chapterNumber,
          { excludeChapterId: chapterId },
        );

        if (duplicateNumber) {
          cleanupUploadedFiles(uploadedFiles);
          await connection.rollback();
          return res.status(409).json({
            status: "error",
            message: "Nomor chapter sudah dipakai untuk manga ini.",
          });
        }

        const [existingPageRows] = await connection.query(
          `SELECT id,
                  chapter_id AS chapterId,
                  page_number AS pageNumber,
                  image_url AS imageUrl,
                  created_at AS createdAt
           FROM chapter_pages
           WHERE chapter_id = ?
           ORDER BY page_number ASC, id ASC`,
          [chapterId],
        );
        const existingPages = sortPagesByNumber(
          existingPageRows.map(mapPageRow),
        );

        const pagePlan = buildPageSavePlan({
          pageCount: payload.pageCount,
          existingPages,
          uploadedPageFiles: pageFiles,
          mangaTitle: existingBook.title,
          chapterNumber: payload.chapterNumber,
        });

        if (pagePlan.error) {
          cleanupUploadedFiles(uploadedFiles);
          await connection.rollback();
          return res.status(400).json({
            status: "error",
            message: pagePlan.error,
          });
        }

        await connection.query(
          "DELETE FROM chapter_pages WHERE chapter_id = ?",
          [chapterId],
        );

        for (const page of pagePlan.finalPages) {
          await connection.query(
            `INSERT INTO chapter_pages
             (chapter_id, page_number, image_url)
             VALUES (?, ?, ?)`,
            [chapterId, page.pageNumber, page.imageUrl],
          );
        }

        await connection.query(
          `UPDATE chapters
           SET chapter_number = ?,
               chapter_label = ?,
               release_date = ?,
               page_count = ?,
               preview_image_url = ?
           WHERE id = ? AND book_id = ?`,
          [
            payload.chapterNumber,
            String(payload.chapterNumber),
            payload.releaseDate,
            payload.pageCount,
            pagePlan.finalPages[0]?.imageUrl || null,
            chapterId,
            bookId,
          ],
        );

        await logActivity(
          connection,
          req.user.id,
          "update_chapter",
          `${req.user.email} memperbarui chapter ${payload.chapterNumber} di ${existingBook.title}.`,
          {
            targetType: "chapter",
            targetId: chapterId,
          },
        );

        await connection.commit();
        invalidateUserBooksCache(req.user.id);
        deleteManagedFiles(pagePlan.removedUrls);

        const chapter = await fetchChapterById(pool, bookId, chapterId);

        return res.status(200).json({
          status: "success",
          message: "Chapter berhasil diperbarui.",
          data: chapter,
        });
      } catch (updateError) {
        cleanupUploadedFiles(uploadedFiles);
        await connection.rollback();
        console.error("Update chapter error:", updateError.message);
        return res.status(500).json({
          status: "error",
          message: "Terjadi kesalahan pada server.",
        });
      } finally {
        connection.release();
      }
    });
  } catch (error) {
    console.error("Chapter PUT error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.delete("/:id/chapters/:chapterId", async (req, res) => {
  if (!requireCatalogManager(req, res)) {
    return;
  }

  const bookId = parsePositiveInteger(req.params.id);
  const chapterId = parsePositiveInteger(req.params.chapterId);

  if (!bookId || !chapterId) {
    return res.status(400).json({
      status: "error",
      message: "ID manga atau chapter tidak valid.",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const book = await getBookById(connection, bookId);
    const chapter = await getChapterOwnership(connection, bookId, chapterId);

    if (!book || !chapter) {
      await connection.rollback();
      return res.status(404).json({
        status: "error",
        message: "Chapter tidak ditemukan.",
      });
    }

    const [pageRows] = await connection.query(
      "SELECT image_url AS imageUrl FROM chapter_pages WHERE chapter_id = ?",
      [chapterId],
    );

    await connection.query(
      "DELETE FROM chapters WHERE id = ? AND book_id = ?",
      [chapterId, bookId],
    );

    await logActivity(
      connection,
      req.user.id,
      "delete_chapter",
      `${req.user.email} menghapus chapter ${chapter.chapterNumber} dari ${book.title}.`,
      {
        targetType: "chapter",
        targetId: chapterId,
      },
    );

    await connection.commit();
    invalidateUserBooksCache(req.user.id);
    deleteManagedFiles(pageRows.map((row) => row.imageUrl));

    return res.status(200).json({
      status: "success",
      message: "Chapter berhasil dihapus.",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Delete chapter error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  } finally {
    connection.release();
  }
});

router.post("/:id/favorite", async (req, res) => {
  const bookId = parsePositiveInteger(req.params.id);

  if (!bookId) {
    return res.status(400).json({
      status: "error",
      message: "ID manga tidak valid.",
    });
  }

  const isFavorite = normalizeBoolean(req.body.isFavorite);

  try {
    const existingBook = await getBookById(pool, bookId);

    if (!existingBook) {
      return res.status(404).json({
        status: "error",
        message: "Manga tidak ditemukan.",
      });
    }

    if (isFavorite) {
      await pool.query(
        "INSERT IGNORE INTO user_favorites (user_id, book_id) VALUES (?, ?)",
        [req.user.id, bookId],
      );
    } else {
      await pool.query(
        "DELETE FROM user_favorites WHERE user_id = ? AND book_id = ?",
        [req.user.id, bookId],
      );
    }

    await logActivity(
      pool,
      req.user.id,
      isFavorite ? "favorite_manga" : "unfavorite_manga",
      `${req.user.email} ${isFavorite ? "menambahkan" : "menghapus"} favorit untuk ${existingBook.title}.`,
      {
        targetType: "book",
        targetId: bookId,
      },
    );

    invalidateUserBooksCache(req.user.id);

    const book = await fetchBookById(pool, req.user.id, bookId);

    return res.status(200).json({
      status: "success",
      message: isFavorite
        ? "Manga ditambahkan ke favorit."
        : "Manga dihapus dari favorit.",
      data: book,
    });
  } catch (error) {
    console.error("Favorite toggle error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.post("/:id/reading-sessions", async (req, res) => {
  const bookId = parsePositiveInteger(req.params.id);
  const chapterId = req.body.chapterId
    ? parsePositiveInteger(req.body.chapterId)
    : null;
  const durationSeconds = normalizeOptionalInteger(req.body.durationSeconds);

  if (!bookId) {
    return res.status(400).json({
      status: "error",
      message: "ID manga tidak valid.",
    });
  }

  if (
    !Number.isInteger(durationSeconds) ||
    durationSeconds < MIN_READING_SECONDS ||
    durationSeconds > MAX_READING_SECONDS
  ) {
    return res.status(400).json({
      status: "error",
      message: "Durasi baca tidak valid.",
    });
  }

  const connection = await pool.getConnection();

  try {
    const book = await getBookById(connection, bookId);

    if (!book) {
      return res.status(404).json({
        status: "error",
        message: "Manga tidak ditemukan.",
      });
    }

    if (chapterId) {
      const chapter = await getChapterOwnership(connection, bookId, chapterId);

      if (!chapter) {
        return res.status(404).json({
          status: "error",
          message: "Chapter tidak ditemukan.",
        });
      }
    }

    await connection.query(
      `INSERT INTO reading_sessions
       (user_id, book_id, chapter_id, duration_seconds)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, bookId, chapterId, durationSeconds],
    );

    return res.status(201).json({
      status: "success",
      message: "Waktu baca berhasil dicatat.",
    });
  } catch (error) {
    console.error("Reading session error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  } finally {
    connection.release();
  }
});

router.get("/:id", async (req, res) => {
  const bookId = parsePositiveInteger(req.params.id);

  if (!bookId) {
    return res.status(400).json({
      status: "error",
      message: "ID manga tidak valid.",
    });
  }

  try {
    const book = await fetchBookById(pool, req.user.id, bookId);

    if (!book) {
      return res.status(404).json({
        status: "error",
        message: "Manga tidak ditemukan.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Detail manga berhasil dimuat.",
      data: book,
    });
  } catch (error) {
    console.error("Detail manga error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  }
});

router.put("/:id", async (req, res) => {
  if (!requireCatalogManager(req, res)) {
    return;
  }

  const bookId = parsePositiveInteger(req.params.id);

  if (!bookId) {
    return res.status(400).json({
      status: "error",
      message: "ID manga tidak valid.",
    });
  }

  const payload = normalizeBookPayload(req.body);
  const validationError = validateBookPayload(payload, {
    bookStatuses: BOOK_STATUSES,
    currentYear: CURRENT_YEAR,
  });

  if (validationError) {
    return res.status(400).json({
      status: "error",
      message: validationError,
    });
  }

  const connection = await pool.getConnection();
  let existingBook = null;

  try {
    await connection.beginTransaction();

    existingBook = await getBookById(connection, bookId);

    if (!existingBook) {
      await connection.rollback();
      return res.status(404).json({
        status: "error",
        message: "Manga tidak ditemukan.",
      });
    }

    const slug = await buildUniqueSlug(connection, payload.title, {
      excludeBookId: bookId,
    });

    await connection.query(
      `UPDATE books
       SET title = ?,
           slug = ?,
           author = ?,
           genre = ?,
           thumbnail_url = ?,
           description = ?,
           published_on = ?,
           status = ?
       WHERE id = ?`,
      [
        payload.title,
        slug,
        payload.author,
        serializeGenreList(payload.genres),
        payload.thumbnailUrl || null,
        payload.description || null,
        payload.publishedOn,
        payload.status,
        bookId,
      ],
    );

    if (
      payload.thumbnailUrl &&
      existingBook.thumbnailUrl &&
      payload.thumbnailUrl !== existingBook.thumbnailUrl
    ) {
      deleteManagedFiles([existingBook.thumbnailUrl]);
    }

    await logActivity(
      connection,
      req.user.id,
      "update_manga",
      `${req.user.email} memperbarui manga ${payload.title}.`,
      {
        targetType: "book",
        targetId: bookId,
      },
    );

    await connection.commit();

    invalidateUserBooksCache(req.user.id);

    const book = await fetchBookById(connection, req.user.id, bookId);

    return res.status(200).json({
      status: "success",
      message: "Manga berhasil diperbarui.",
      data: book,
    });
  } catch (error) {
    await connection.rollback();
    // Cleanup new thumbnail if book update failed
    if (
      payload.thumbnailUrl &&
      existingBook &&
      payload.thumbnailUrl !== existingBook.thumbnailUrl
    ) {
      deleteManagedFiles([payload.thumbnailUrl]);
    }
    console.error("Update manga error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  } finally {
    connection.release();
  }
});

router.delete("/:id", async (req, res) => {
  if (!requireAdmin(req, res)) {
    return;
  }

  const bookId = parsePositiveInteger(req.params.id);

  if (!bookId) {
    return res.status(400).json({
      status: "error",
      message: "ID manga tidak valid.",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const book = await getBookById(connection, bookId);

    if (!book) {
      await connection.rollback();
      return res.status(404).json({
        status: "error",
        message: "Manga tidak ditemukan.",
      });
    }

    const [pageRows] = await connection.query(
      `SELECT cp.image_url AS imageUrl
       FROM chapter_pages cp
       INNER JOIN chapters c ON c.id = cp.chapter_id
       WHERE c.book_id = ?`,
      [bookId],
    );

    await connection.query("DELETE FROM books WHERE id = ?", [bookId]);
    await compactBookDisplayOrder(connection);

    await logActivity(
      connection,
      req.user.id,
      "delete_manga",
      `${req.user.email} menghapus manga ${book.title}.`,
      {
        targetType: "book",
        targetId: bookId,
      },
    );

    await connection.commit();

    deleteManagedFiles([
      book.thumbnailUrl,
      ...pageRows.map((row) => row.imageUrl),
    ]);

    // Delete the entire manga folder
    const safeMangaFolder = sanitizeFolderName(book.title);
    const mangaFolderPath = path.join(publicUploadDir, safeMangaFolder);
    if (fs.existsSync(mangaFolderPath)) {
      fs.rmSync(mangaFolderPath, { recursive: true, force: true });
    }

    invalidateUserBooksCache(req.user.id);

    return res.status(200).json({
      status: "success",
      message: "Manga berhasil dihapus.",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Delete manga error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Terjadi kesalahan pada server.",
    });
  } finally {
    connection.release();
  }
});

export default router;
