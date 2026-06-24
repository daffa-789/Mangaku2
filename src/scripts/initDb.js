import 'dotenv/config';

import mysql from 'mysql2/promise';
import { buildUniqueSlug } from '../utils/manga.js';

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "mangaku";
const BOOTSTRAP_SUPER_ADMIN_EMAILS = [
  ...new Set(
    String(
      process.env.BOOTSTRAP_SUPER_ADMIN_EMAILS ||
        process.env.BOOTSTRAP_ADMIN_EMAILS ||
        process.env.ROLE_MANAGER_EMAILS ||
        "admin@mangaku.local",
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ),
];

function parseLegacyChapterNumber(label, fallback) {
  if (!label) return Number(fallback) || 1;

  const str = String(label).trim();

  const numberMatch = str.match(/(\d+(?:\.\d+)?)/);
  if (numberMatch) {
    return Number(numberMatch[1]);
  }

  return Number(fallback) || 1;
}

async function ensureColumn(connection, tableName, columnName, definition) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, tableName, columnName],
  );

  if (rows.length === 0) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`,
    );
  }
}

async function ensureIndex(connection, tableName, indexName, definition) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [DB_NAME, tableName, indexName],
  );

  if (rows.length === 0) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` ADD INDEX \`${indexName}\` ${definition}`,
    );
  }
}

async function ensureUniqueIndex(connection, tableName, indexName, definition) {
  const [rows] = await connection.query(
    `SELECT INDEX_NAME, NON_UNIQUE
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [DB_NAME, tableName, indexName],
  );

  if (rows.length === 0) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` ADD UNIQUE INDEX \`${indexName}\` ${definition}`,
    );
    return;
  }

  const hasUniqueConstraint = rows.every(
    (row) => Number(row.NON_UNIQUE || 1) === 0,
  );

  if (!hasUniqueConstraint) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\`, ADD UNIQUE INDEX \`${indexName}\` ${definition}`,
    );
  }
}

async function backfillUsers(connection) {
  await connection.query(`
    UPDATE users
    SET role = 'user'
    WHERE role IS NULL OR role NOT IN ('user', 'admin', 'super_admin', 'moderator')
  `);

  const [[roleCounts]] = await connection.query(
    `SELECT SUM(role = 'super_admin') AS superAdmins,
            SUM(role = 'admin') AS admins,
            SUM(role = 'moderator') AS moderators
     FROM users`,
  );

  if (Number(roleCounts.superAdmins || 0) === 0) {
    await connection.query(
      "UPDATE users SET role = 'super_admin' WHERE role = 'admin'",
    );
  }

  if (Number(roleCounts.moderators || 0) > 0) {
    await connection.query(
      "UPDATE users SET role = 'admin' WHERE role = 'moderator'",
    );
  }

  await connection.query(`
    UPDATE users
    SET role = 'user'
    WHERE role IS NULL OR role NOT IN ('user', 'admin', 'super_admin')
  `);

  if (BOOTSTRAP_SUPER_ADMIN_EMAILS.length > 0) {
    const placeholders = BOOTSTRAP_SUPER_ADMIN_EMAILS.map(() => "?").join(", ");

    await connection.query(
      `UPDATE users
       SET role = 'super_admin'
       WHERE LOWER(email) IN (${placeholders})`,
      BOOTSTRAP_SUPER_ADMIN_EMAILS,
    );
  }
}

async function backfillBooks(connection) {
  await connection.query(`
    UPDATE books
    SET display_order = id
    WHERE display_order IS NULL OR display_order <= 0
  `);

  await connection.query(`
    UPDATE books
    SET published_on = STR_TO_DATE(CONCAT(published_year, '-01-01'), '%Y-%m-%d')
    WHERE published_on IS NULL AND published_year IS NOT NULL
  `);

  await connection.query(`
    UPDATE books
    SET status = 'reading'
    WHERE status IS NULL OR status NOT IN ('to_read', 'reading', 'completed')
  `);

  const [bookRows] = await connection.query(
    `SELECT id, title
     FROM books
     ORDER BY display_order ASC, id ASC`,
  );

  for (let index = 0; index < bookRows.length; index += 1) {
    const row = bookRows[index];
    const slug = await buildUniqueSlug(connection, row.title, {
      excludeBookId: row.id,
    });

    await connection.query(
      "UPDATE books SET display_order = ?, slug = ? WHERE id = ?",
      [index + 1, slug, row.id],
    );
  }
}

async function backfillFavorites(connection) {
  await connection.query(`
    INSERT IGNORE INTO user_favorites (user_id, book_id)
    SELECT user_id, id
    FROM books
    WHERE is_favorite = 1 AND user_id IS NOT NULL
  `);
}

async function backfillChapters(connection) {
  const [books] = await connection.query(
    "SELECT id FROM books ORDER BY display_order ASC, id ASC",
  );

  for (const book of books) {
    const [chapterRows] = await connection.query(
      `SELECT id, chapter_label AS chapterLabel, display_order AS displayOrder
       FROM chapters
       WHERE book_id = ?
       ORDER BY display_order ASC, id ASC`,
      [book.id],
    );

    const usedNumbers = new Set();

    for (let index = 0; index < chapterRows.length; index += 1) {
      const row = chapterRows[index];
      let chapterNumber = parseLegacyChapterNumber(
        row.chapterLabel,
        row.displayOrder || index + 1,
      );

      while (usedNumbers.has(chapterNumber)) {
        chapterNumber += 1;
      }

      usedNumbers.add(chapterNumber);

      await connection.query(
        `UPDATE chapters
         SET display_order = ?, chapter_number = ?, chapter_label = ?
         WHERE id = ?`,
        [index + 1, chapterNumber, String(chapterNumber), row.id],
      );
    }
  }
}

async function backfillPages(connection) {
  const [pageRows] = await connection.query(
    `SELECT id, chapter_id AS chapterId
     FROM chapter_pages
     ORDER BY chapter_id ASC, page_number ASC, id ASC`,
  );

  let currentChapterId = null;
  let pageNumber = 0;

  for (const row of pageRows) {
    if (row.chapterId !== currentChapterId) {
      currentChapterId = row.chapterId;
      pageNumber = 1;
    } else {
      pageNumber += 1;
    }

    await connection.query(
      "UPDATE chapter_pages SET page_number = ? WHERE id = ?",
      [pageNumber, row.id],
    );
  }

  await connection.query(`
    UPDATE chapters c
    LEFT JOIN (
      SELECT chapter_id, COUNT(*) AS pageCount, MIN(image_url) AS previewImageUrl
      FROM chapter_pages
      GROUP BY chapter_id
    ) p ON p.chapter_id = c.id
    SET c.page_count = COALESCE(p.pageCount, 0),
        c.preview_image_url = p.previewImageUrl
  `);
}

async function initDb(options = {}) {
  const { dropDatabase = false } = options;

  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true,
  });

  try {
    if (dropDatabase) {
      await connection.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
    }

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    await connection.query(`USE \`${DB_NAME}\``);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('user', 'moderator', 'admin', 'super_admin') NOT NULL DEFAULT 'user'
    `);

    await backfillUsers(connection);

    await connection.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user'
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS books (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        display_order INT NOT NULL DEFAULT 1,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NULL,
        author VARCHAR(255) NOT NULL,
        genre VARCHAR(255) NOT NULL,
        thumbnail_url VARCHAR(500) NULL,
        description TEXT NULL,
        published_on DATE NULL,
        published_year INT NULL,
        pages INT NULL,
        status ENUM('to_read', 'reading', 'completed') NOT NULL DEFAULT 'reading',
        is_favorite TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_books_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await ensureColumn(
      connection,
      "books",
      "display_order",
      "INT NOT NULL DEFAULT 1 AFTER user_id",
    );
    await ensureColumn(
      connection,
      "books",
      "slug",
      "VARCHAR(255) NULL AFTER title",
    );
    await ensureColumn(
      connection,
      "books",
      "genre",
      "VARCHAR(255) NOT NULL AFTER author",
    );
    await ensureColumn(
      connection,
      "books",
      "thumbnail_url",
      "VARCHAR(500) NULL AFTER genre",
    );
    await ensureColumn(
      connection,
      "books",
      "description",
      "TEXT NULL AFTER thumbnail_url",
    );
    await ensureColumn(
      connection,
      "books",
      "published_on",
      "DATE NULL AFTER description",
    );
    await ensureColumn(
      connection,
      "books",
      "status",
      "ENUM('to_read', 'reading', 'completed') NOT NULL DEFAULT 'reading' AFTER pages",
    );
    await ensureColumn(
      connection,
      "books",
      "is_favorite",
      "TINYINT(1) NOT NULL DEFAULT 0 AFTER status",
    );

    await connection.query(`
      ALTER TABLE books
      MODIFY COLUMN genre VARCHAR(255) NOT NULL,
      MODIFY COLUMN thumbnail_url VARCHAR(500) NULL,
      MODIFY COLUMN description TEXT NULL,
      MODIFY COLUMN status ENUM('to_read', 'reading', 'completed') NOT NULL DEFAULT 'reading'
    `);

    await ensureIndex(connection, "books", "idx_books_user_id", "(user_id)");
    await ensureIndex(
      connection,
      "books",
      "idx_books_display_order",
      "(display_order)",
    );
    await ensureIndex(
      connection,
      "books",
      "idx_books_updated_at",
      "(updated_at)",
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chapters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL,
        display_order INT NOT NULL DEFAULT 1,
        chapter_number INT NULL,
        chapter_label VARCHAR(100) NULL,
        release_date DATE NULL,
        page_count INT NOT NULL DEFAULT 0,
        preview_image_url VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_chapters_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      )
    `);

    // Ensure chapter_label is nullable (remove NOT NULL constraint) for existing tables
    await connection.query(
      `ALTER TABLE chapters MODIFY chapter_label VARCHAR(100) NULL`,
    );

    await ensureColumn(
      connection,
      "chapters",
      "display_order",
      "INT NOT NULL DEFAULT 1 AFTER book_id",
    );
    await ensureColumn(
      connection,
      "chapters",
      "chapter_number",
      "INT NULL AFTER display_order",
    );
    await ensureColumn(
      connection,
      "chapters",
      "page_count",
      "INT NOT NULL DEFAULT 0 AFTER release_date",
    );
    await ensureColumn(
      connection,
      "chapters",
      "preview_image_url",
      "VARCHAR(500) NULL AFTER page_count",
    );

    await ensureIndex(
      connection,
      "chapters",
      "idx_chapters_book_id",
      "(book_id)",
    );
    await ensureIndex(
      connection,
      "chapters",
      "idx_chapters_display_order",
      "(display_order)",
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chapter_pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chapter_id INT NOT NULL,
        page_number INT NOT NULL,
        image_url VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_pages_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
      )
    `);

    await ensureIndex(
      connection,
      "chapter_pages",
      "idx_pages_chapter_id",
      "(chapter_id)",
    );
    await ensureIndex(
      connection,
      "chapter_pages",
      "idx_pages_page_number",
      "(page_number)",
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS reading_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        book_id INT NOT NULL,
        chapter_id INT NULL,
        duration_seconds INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_sessions_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        CONSTRAINT fk_sessions_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
      )
    `);

    await ensureIndex(
      connection,
      "reading_sessions",
      "idx_sessions_user_book",
      "(user_id, book_id)",
    );
    await ensureIndex(
      connection,
      "reading_sessions",
      "idx_sessions_created_at",
      "(created_at)",
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        user_id INT NOT NULL,
        book_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, book_id),
        CONSTRAINT fk_user_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_user_favorites_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      )
    `);

    await ensureIndex(
      connection,
      "user_favorites",
      "idx_user_favorites_book",
      "(book_id)",
    );

    await connection.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        actor_user_id INT NULL,
        action VARCHAR(120) NOT NULL,
        target_type VARCHAR(60) NULL,
        target_id INT NULL,
        description VARCHAR(255) NOT NULL,
        metadata JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_activity_logs_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await ensureIndex(
      connection,
      "activity_logs",
      "idx_activity_logs_user",
      "(actor_user_id)",
    );
    await ensureIndex(
      connection,
      "activity_logs",
      "idx_activity_logs_created_at",
      "(created_at)",
    );

    await backfillBooks(connection);
    await backfillFavorites(connection);
    await backfillChapters(connection);
    await backfillPages(connection);

    await ensureUniqueIndex(connection, "books", "uq_books_slug", "(slug)");
    await ensureUniqueIndex(
      connection,
      "chapters",
      "uq_chapters_book_number",
      "(book_id, chapter_number)",
    );
    await ensureUniqueIndex(
      connection,
      "chapter_pages",
      "uq_pages_chapter_number",
      "(chapter_id, page_number)",
    );
  } finally {
    await connection.end();
  }
}

export { initDb };
