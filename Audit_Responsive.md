# Audit Responsive — Mangaku2

**Tanggal Audit**: 29 Juni 2026
**Breakpoint**: 2 media query — Mobile (≤480px) dan Tablet (≤768px)
**Standar HP 2026**: Layar ~6.1"–6.9", viewport 360–430px (mobile), 768px (tablet/foldable)

---

## 1. File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `public/css/styles.css` | Hapus media query lama `@media (max-width: 430px)`, ganti 2 breakpoint baru (tablet ≤768px, mobile ≤480px), tambah `.sidebar-toggle` & `.sidebar-overlay` |
| `public/home.html` | Tambah tombol hamburger `#sidebarToggle` dan `#sidebarOverlay` di dalam `<body>` |
| `public/js/dashboard.js` | Tambah fungsi `attachSidebarToggle()` untuk open/close sidebar di layar kecil |
| `public/login.html` | Tidak perlu diubah — sudah responsive via CSS auth-card |
| `public/register.html` | Tidak perlu diubah — sudah responsive via CSS auth-card |

---

## 2. Audit Per Halaman

### 2.1 Login (`login.html`)

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.auth-layout` | max-width: 440px, centered | max-width: 440px | max-width: 100%, padding dikurangi | ✅ OK |
| `.auth-card` | padding: 3rem 2.5rem | padding: 2.5rem 2rem | padding: 2rem 1.25rem, radius: 16px | ✅ OK |
| `.auth-heading h1` | font-size: 2rem | 2rem | 1.625rem | ✅ OK |
| `.auth-form input` | padding: 0.875rem 1rem | tetap | padding: 0.75rem 0.875rem, radius: 10px | ✅ OK |
| `.auth-submit` | padding: 1rem, radius: 12px | tetap | padding: 0.875rem, radius: 10px | ✅ OK |
| `.switch-link` | font-size: 0.9375rem | tetap | font-size: 0.875rem | ✅ OK |
| `.password-input-wrap` | relative positioning | tetap | tetap — input dan toggle tetap rapi | ✅ OK |

### 2.2 Register (`register.html`)

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| Semua komponen | Identik dengan login | Identik dengan login | Identik dengan login | ✅ OK |

> Login & Register menggunakan class yang sama (`.auth-page`, `.auth-card`, `.auth-form`) sehingga satu set media query berlaku untuk keduanya.

### 2.3 Home / Dashboard (`home.html`)

#### 2.3.1 Layout & Sidebar

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.app-shell` | flex, sidebar + main | flex tetap | flex tetap | ✅ OK |
| `.app-sidebar` | width: 200px, static | fixed left, width: 240px, hidden by default, slide-in via `.is-open` | width: 220px, slide-in | ✅ OK |
| `.sidebar-toggle` | hidden | tampil, fixed top-left | ukuran lebih kecil (2.5rem) | ✅ OK |
| `.sidebar-overlay` | hidden | tampil saat sidebar terbuka | tampil saat sidebar terbuka | ✅ OK |
| `.nav-button` | padding: 0.75rem 1rem | tetap | padding: 0.625rem 0.75rem, font lebih kecil | ✅ OK |

#### 2.3.2 Tab Panel & Cards

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.tab-panel` | padding: clamp(1.5rem,2vw,2.5rem) | padding: 1.25rem 1rem | padding: 1rem 0.75rem | ✅ OK |
| `.card` | padding: 1.5rem | padding: 1.25rem | padding: 1rem, radius: 8px | ✅ OK |
| `.section-head` | flex row, space-between | tetap | flex column, gap: 0.5rem | ✅ OK |

#### 2.3.3 Manga Grid (Beranda & Favorit — `renderMangaGrid`)

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.manga-grid` | minmax(160px, 1fr) | minmax(140px, 1fr), gap: 1rem | minmax(120px, 1fr), gap: 0.75rem | ✅ OK |
| `.manga-card-copy` | default padding | tetap | padding: 0.5rem, font kecil | ✅ OK |
| `.manga-card .button-row` | default | tetap | padding & gap lebih kecil | ✅ OK |
| `.small` buttons | default size | tetap | padding & font lebih kecil | ✅ OK |

#### 2.3.4 Edit Manga — Thumbnail Gallery (`renderEditMangaGallery`)

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.editor-layout` | 2-column grid | 1 column | 1 column | ✅ OK |
| `.thumb-gallery` | minmax(130px, 1fr) | minmax(110px, 1fr) | minmax(90px, 1fr) | ✅ OK |
| `.thumb-copy` | padding: 0.875rem | tetap | padding: 0.625rem | ✅ OK |

#### 2.3.5 Tambah/Edit Manga Form

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.field-grid.two-col` | 2 columns | 1 column | 1 column | ✅ OK |
| `.genre-picker` | 2 columns | 2 columns | 1 column | ✅ OK |
| `.form-actions` | flex row | flex row | flex column, button full-width | ✅ OK |
| `.thumbnail-preview img` | max-height: 260px | tetap | max-height: 200px | ✅ OK |

#### 2.3.6 Chapter Management (`renderChapterPageSlots`)

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.page-slot-grid` | minmax(200px, 1fr) | minmax(150px, 1fr) | minmax(130px, 1fr) | ✅ OK |
| `.page-slot-meta` | padding: 0.75rem | tetap | padding: 0.5rem | ✅ OK |
| `.chapter-card` | flex row | flex column, gap: 0.75rem | flex column | ✅ OK |

#### 2.3.7 Database Manga (`renderDatabaseList`)

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.database-list` | minmax(280px, 1fr) | minmax(220px, 1fr) | 1 column | ✅ OK |

#### 2.3.8 User Management (`renderUserRoleList`)

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.user-card` | flex row | flex column | flex column | ✅ OK |
| `.user-actions` | flex column, align end | flex row, wrap | flex row, wrap | ✅ OK |

#### 2.3.9 Activity Logs (`renderActivityLogs`)

| Komponen | Desktop | Tablet (≤768px) | Mobile (≤480px) | Status |
|----------|---------|-----------------|-----------------|--------|
| `.log-head` | 3-column grid | 3-column (lebih sempit) | hidden | ✅ OK |
| `.log-row` | 3-column grid | 3-column | 1-column stacked | ✅ OK |

---

## 3. Fitur Responsive Baru

### 3.1 Sidebar Hamburger Toggle
- **Komponen**: `#sidebarToggle` (tombol hamburger), `#sidebarOverlay` (backdrop gelap)
- **Perilaku**:
  - Di ≤768px, sidebar tersembunyi off-screen (`transform: translateX(-100%)`)
  - Klik hamburger → sidebar slide-in + overlay muncul
  - Klik overlay / klik navigasi menu → sidebar tertutup otomatis
  - Transisi smooth 300ms
- **Aksesibilitas**: `aria-label="Toggle menu"`, `aria-expanded` di-toggle oleh JS

### 3.2 Breakpoint Strategy
| Breakpoint | Target Device | Viewport |
|------------|---------------|----------|
| ≤768px (Tablet) | iPad Mini, Samsung Galaxy Tab, Foldable terbuka | 601–768px |
| ≤480px (Mobile) | iPhone 16 Pro Max (430px), Samsung S25 Ultra (412px), Pixel 9 Pro (412px) | ≤480px |

> Tidak menggunakan breakpoint >768px karena desktop layout sudah optimal di base CSS.

---

## 4. Komponen dari `dashboard.js` yang Terpengaruh

| Fungsi Render JS | Class HTML yang dihasilkan | Responsive? |
|------------------|---------------------------|-------------|
| `renderMangaGrid()` | `.manga-grid`, `.manga-card`, `.manga-card-cover`, `.manga-card-copy`, `.button-row` | ✅ |
| `renderEditMangaGallery()` | `.thumb-gallery`, `.thumb-card`, `.thumb-image`, `.thumb-copy` | ✅ |
| `renderChapterPageSlots()` | `.page-slot-grid`, `.page-slot-card`, `.page-slot-preview`, `.page-slot-meta` | ✅ |
| `renderDatabaseList()` | `.database-list`, `.database-card`, `.database-cover`, `.database-copy` | ✅ |
| `renderUserRoleList()` | `.user-card`, `.user-copy`, `.user-actions`, `.button-row` | ✅ |
| `renderActivityLogs()` | `.log-table`, `.log-head`, `.log-row` | ✅ |
| `renderEditChapterList()` | `.chapter-card`, `.chapter-copy`, `.button-row` | ✅ |
| `renderGenrePicker()` | `.genre-picker`, `.genre-option` | ✅ |
| `renderEditFormFromSelectedBook()` | `.editor-layout`, `.field-grid.two-col`, `.form-actions` | ✅ |
| `renderFavoritesGrid()` | Reuses `renderMangaGrid` | ✅ |

---

## 5. Ringkasan

- ✅ **Login** — Fully responsive (mobile card lebih compact, input & button menyesuaikan)
- ✅ **Register** — Fully responsive (identik dengan login)
- ✅ **Home/Dashboard** — Fully responsive termasuk:
  - Sidebar off-canvas dengan hamburger toggle
  - Grid manga & thumbnail menyesuaikan kolom
  - Form 2-kolom → 1 kolom di layar kecil
  - Log table → stacked cards di mobile
  - User card → stacked layout di tablet/mobile
  - Chapter card → stacked layout
  - Genre picker → 1 kolom di mobile
- ✅ **Reader** — Responsive (header, image sizing, tap zones)
- ✅ Semua komponen JS-rendered sudah ter-cover oleh media query CSS