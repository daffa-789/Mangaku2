-- ⚠️ FILE KEDALUARSA — HANYA REFERENSI AWAL.
-- Skema sekarang dikelola oleh `src/scripts/initDb.js` (otomatis saat server start).
-- Jalankan `npm run db:init` untuk inisialisasi database, jangan pakai file ini langsung.

USE mangaku;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS books (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  display_order INT NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NULL,
  author VARCHAR(255) NOT NULL,
  genre VARCHAR(50) NOT NULL,
  thumbnail_url VARCHAR(500),
  description TEXT,
  published_on DATE NULL,
  published_year INT NULL,
  pages INT NULL,
  status ENUM('to_read', 'reading', 'completed') NOT NULL DEFAULT 'to_read',
  is_favorite TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_books_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_books_user_id (user_id),
  INDEX idx_books_display_order (display_order),
  INDEX idx_books_updated_at (updated_at),
  UNIQUE KEY uq_books_user_slug (user_id, slug)
);

CREATE TABLE IF NOT EXISTS chapters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  book_id INT NOT NULL,
  display_order INT NOT NULL DEFAULT 1,
  chapter_number INT NULL,
  chapter_label VARCHAR(100) NULL,
  title VARCHAR(255) NULL,
  release_date DATE NULL,
  page_count INT NOT NULL DEFAULT 0,
  preview_image_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_chapters_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  INDEX idx_chapters_book_id (book_id),
  INDEX idx_chapters_display_order (display_order),
  UNIQUE KEY uq_chapters_book_number (book_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS chapter_pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id INT NOT NULL,
  page_number INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pages_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  INDEX idx_pages_chapter_id (chapter_id),
  INDEX idx_pages_page_number (page_number),
  UNIQUE KEY uq_pages_chapter_number (chapter_id, page_number)
);

CREATE TABLE IF NOT EXISTS reading_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  book_id INT NOT NULL,
  chapter_id INT NULL,
  duration_seconds INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL,
  INDEX idx_sessions_user_book (user_id, book_id),
  INDEX idx_sessions_created_at (created_at)
);
