# Mangaku - Manga Platform

Mangaku adalah platform aplikasi web untuk membaca dan mengelola katalog manga. Dibangun menggunakan arsitektur monolitik dengan Node.js (Express), MySQL, dan Vanilla HTML/CSS/JS di sisi frontend.

## Fitur Utama

- **Autentikasi Aman:** Sistem Login dan Register menggunakan JWT (JSON Web Token).
- **Role-Based Access Control (RBAC):** Pembatasan akses ke menu dan fitur berdasarkan set role (Super Admin, Admin, User).

## Perubahan Reader (ringkasan)

Perubahan berikut diterapkan pada fitur Reader untuk perbaikan UX, tampilan, dan bugfix:

- **Animasi header:** Perbaikan agar tombol sembunyikan header benar-benar menggeser header ke atas dengan animasi halus dan tombol restore muncul saat collapsed.
- **Sidebar chapter direlokasi:** Daftar chapter sekarang hanya ditampilkan di sidebar kanan (panel "Daftar Chapter"). Sidebar kiri reader dihapus untuk mengurangi duplikasi.
- **Tata letak dan styling sidebar:** Panel kanan mendapatkan styling baru (background blur, shadow, header meta, daftar chapter sebagai card), empty-state lebih rapi, dan tombol tutup diganti menjadi panah.
- **Activity logs dipindah:** Activity logs dihapus dari reader (tidak tampil di panel reader); fitur logs tetap ada di dashboard admin.
- **Perbaikan tombol & ikon:** Tombol "garis 3" (list icon) diganti / dipindahkan agar fungsinya menjadi membuka sidebar kanan; tombol-tombol yang tidak terpakai dihapus.
- **Kontras dan warna teks:** Peningkatan warna teks di reader agar kontras lebih baik terhadap latar gelap.
- **Responsif terpadu:** Breakpoint responsive disederhanakan menjadi dua ukuran utama untuk reader: `768px` (tablet) dan `640px` (mobile) untuk memastikan tata letak yang konsisten.
- **Perbaikan RBAC (frontend):** Bug di dashboard yang menyebabkan daftar user kosong diperbaiki — frontend kini membaca `data.users` dari API sesuai respons backend.

Jika ingin, saya bisa menambahkan catatan changelog lebih detail atau membuat entry versi di root `CHANGELOG.md`.

- **Manga Reader Sederhana:** Tampilan halaman pembaca manga interaktif dengan navigasi chapter dan sidebar terintegrasi.
- **Manajemen Katalog & Chapter:** Upload cover (thumbnail) manga dan gambar halaman chapter secara teratur menggunakan Multer.
- **Manga Favorit:** User dapat menandai dan menyimpan koleksi manga favorit.
- **Activity Logs:** Sistem pencatatan aktivitas khusus yang merekam transaksi manajerial.
- **Frontend Interaktif:** Dibangun murni tanpa framework modern (Vanilla Javascript), mengusung CSS modern, dan modul eksternal standar (SweetAlert2, Bootstrap Icons).

## Rangkuman Sistem Role

Sistem kontrol akses (RBAC) pada aplikasi dienkapsulasi dengan ketat dari frontend hingga validasi API backend. Terdapat 3 role yang diberlakukan:

1. **User**
   - _Role standar_ saat sebuah akun baru mendaftar.
   - **Akses:** Membaca manga, melihat list chapter, menambahkan manga ke daftar "Favorit".
   - **Tampilan Dashboard:** Hanya fitur _Beranda_ dan _Favorit_ yang terbuka (`data-user-only`). Menu manajemen sisanya disembunyikan otomatis di frontend dan ditolak API jika ada akses ilegal.

2. **Admin**
   - _Role pengelola konten/katalog_.
   - **Akses:** Berhak menggunakan fitur-fitur dari role **User**, ditambah akses penuh untuk mengatur katalog materi manga dan chapter, melihat activity logs, dan membuka panel _Manga Database_.
   - **Tampilan Dashboard:** Membuka akses ke _Tambah Manga_, _Edit Manga_, _Manga Database_, dan _Activity Logs_ (`data-manager-only`). Admin tidak bisa mengatur role pengguna lain.

3. **Super Admin**
   - _Role tertinggi_ dengan hak penuh.
   - **Akses:** Cakupan akses **Admin**, ditambah perizinan manajemen akun dan perubahan role pengguna.
   - **Tampilan Dashboard:** Terbuka panel administratif _Akses User_ (`data-admin-only`) dan semua panel admin lainnya.
   - **Khusus Super Admin:** Super admin dapat mempromosikan/menurunkan role milik user ke Admin atau Super Admin.
   - **Catatan:** Email yang terdaftar di konfigurasi `.env` (`BOOTSTRAP_SUPER_ADMIN_EMAILS`, fallback `BOOTSTRAP_ADMIN_EMAILS`) otomatis diangkat sebagai Super Admin saat pertama kali backend dijalankan/login. Akun bawaan umumnya adalah `admin@mangaku.local`.

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** MySQL / MariaDB (via `mysql2`)
- **Keamanan:** `jsonwebtoken` (JWT), `zod` (Validasi Data), bcrypt.
- **Manajemen File:** `multer`, `archiver` (Upload & ekstraksi)
- **Frontend:** Vanilla HTML5, CSS Variables & Grid, ES6 Vanilla JS.

## Instalasi dan Konfigurasi

1. **Clone repository & masuk ke direktori manga:**
   ```bash
   cd "mangkau"
   ```
