const BOOKS_ENDPOINT = "/api/books";
const USERS_ENDPOINT = "/api/auth/users";
const LOGS_ENDPOINT = "/api/auth/logs";
const BOOKS_THUMBNAIL_ENDPOINT = `${BOOKS_ENDPOINT}/upload-thumbnail`;
const MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;
const MAX_PAGE_FILE_SIZE = 8 * 1024 * 1024;
const MAX_CHAPTER_PAGES = 200;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// HARUS tetap sinkron dengan `BOOK_GENRES` di `src/routes/books-validation.js`.
const GENRE_OPTIONS = [
  { value: "action", label: "Action" },
  { value: "adventure", label: "Adventure" },
  { value: "comedy", label: "Comedy" },
  { value: "demons", label: "Demons" },
  { value: "drama", label: "Drama" },
  { value: "fantasy", label: "Fantasy" },
  { value: "game", label: "Game" },
  { value: "gore", label: "Gore" },
  { value: "harem", label: "Harem" },
  { value: "historical", label: "Historical" },
  { value: "horror", label: "Horror" },
  { value: "isekai", label: "Isekai" },
  { value: "josei", label: "Josei" },
  { value: "magic", label: "Magic" },
  { value: "martial_arts", label: "Martial Arts" },
  { value: "mature", label: "Mature" },
  { value: "mecha", label: "Mecha" },
  { value: "military", label: "Military" },
  { value: "music", label: "Music" },
  { value: "mystery", label: "Mystery" },
  { value: "parody", label: "Parody" },
  { value: "psychological", label: "Psychological" },
  { value: "romance", label: "Romance" },
  { value: "school", label: "School" },
  { value: "sci_fi", label: "Sci-Fi" },
  { value: "seinen", label: "Seinen" },
  { value: "shoujo", label: "Shoujo" },
  { value: "shounen", label: "Shounen" },
  { value: "slice_of_life", label: "Slice of Life" },
  { value: "sports", label: "Sports" },
  { value: "supernatural", label: "Supernatural" },
  { value: "thriller", label: "Thriller" },
  { value: "vampire", label: "Vampire" },
];

const STATUS_LABELS = {
  to_read: "Segera",
  reading: "Berjalan",
  completed: "Selesai",
};

const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

const state = {
  currentUser: null,
  books: [],
  users: [],
  logs: [],
  activeTab: "overview",
  selectedBookId: null,
  selectedBookDetail: null,
  chapterPageSlots: [],
  thumbnailPreviewUrls: {
    add: null,
    edit: null,
  },
};

// Session helpers live in `session.js` as `window.MangakuSession`.
// Use `window.MangakuSession` directly instead of duplicating wrappers here.

function isSuperAdminUser(user = state.currentUser) {
  return String(user?.role || "user") === "super_admin";
}

function isAdminUser(user = state.currentUser) {
  return String(user?.role || "user") === "admin";
}

function isRegularUser(user = state.currentUser) {
  return String(user?.role || "user") === "user";
}

function canManageCatalog(user = state.currentUser) {
  return isAdminUser(user) || isSuperAdminUser(user);
}

function canManageUsers(user = state.currentUser) {
  return isSuperAdminUser(user);
}

function canViewLogs(user = state.currentUser) {
  // Samakan dengan backend: GET/DELETE /api/auth/logs butuh role admin+ (bukan super-only).
  return canManageCatalog(user);
}

function getRoleLabel(role) {
  return ROLE_LABELS[String(role || "user")] || "User";
}

function getAllowedTabs() {
  if (isSuperAdminUser()) {
    return ["overview", "add-manga", "edit-manga", "database", "users", "logs"];
  }

  if (isAdminUser()) {
    return ["overview", "add-manga", "edit-manga", "database"];
  }

  return ["overview", "favorites"];
}

function getDefaultTab() {
  return "overview";
}

function redirectToLogin() {
  window.MangakuSession.clearCurrentUserSession();
  window.location.replace("/login.html");
}

function escapeHtml(value) {
  return window.MangakuCore.escapeHtml(value);
}

function renderImageWithFallback(src, alt, fallbackLabel) {
  return window.MangakuCore.renderImageWithFallback(src, alt, fallbackLabel, {
    fallbackClass: "cover-fallback",
  });
}

function formatDate(value) {
  return window.MangakuCore.formatDate(value, {
    emptyLabel: "Belum diatur",
  });
}

function formatDateTime(value) {
  return window.MangakuCore.formatDateTime(value, {
    emptyLabel: "Belum ada",
  });
}

function formatDuration(seconds) {
  return window.MangakuCore.formatDuration(seconds);
}

function parsePositiveInteger(value) {
  return window.MangakuCore.parsePositiveInteger(value);
}

function normalizePositiveInteger(value) {
  return window.MangakuCore.normalizePositiveInteger(value);
}

async function parseJsonResponse(response) {
  return window.MangakuCore.parseJsonResponse(response);
}

function getAuthHeaders(baseHeaders = {}) {
  return window.MangakuCore.buildAuthHeaders(state.currentUser, baseHeaders);
}

async function requestJson(method, url, payload) {
  const response = await fetch(url, {
    method,
    headers: getAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const result = await parseJsonResponse(response);

  if (response.status === 401) {
    redirectToLogin();
    throw new Error(result.message || "Session berakhir. Silakan login ulang.");
  }

  if (!response.ok) {
    throw new Error(result.message || "Permintaan ke server gagal.");
  }

  return result;
}

async function requestForm(method, url, formData) {
  const response = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: formData,
  });

  const result = await parseJsonResponse(response);

  if (response.status === 401) {
    redirectToLogin();
    throw new Error(result.message || "Session berakhir. Silakan login ulang.");
  }

  if (!response.ok) {
    throw new Error(result.message || "Permintaan form gagal.");
  }

  return result;
}

function showFeedback(message, variant = "info") {
  return window.MangakuCore.showFeedback(message, variant);
}

function setBodyRoleMode() {
  document.body.dataset.userRole = String(state.currentUser?.role || "user");

  document.querySelectorAll("[data-manager-only]").forEach((element) => {
    element.hidden = !canManageCatalog();
  });

  document.querySelectorAll("[data-admin-only]").forEach((element) => {
    element.hidden = !canManageUsers();
  });

  document.querySelectorAll("[data-user-only]").forEach((element) => {
    element.hidden = !isRegularUser();
  });
}

// `hydrateCurrentUserIdentity` is implemented in `auth.js` and called after
// session refresh; dashboard uses that implementation to avoid duplication.

function getActiveTabFromHash() {
  const hash = window.location.hash.slice(1).toLowerCase();
  const validTabs = getAllowedTabs();
  return validTabs.includes(hash) ? hash : getDefaultTab();
}

function setActiveTab(tabId) {
  const allowedTabs = getAllowedTabs();
  const nextTab = allowedTabs.includes(tabId) ? tabId : getDefaultTab();
  state.activeTab = nextTab;

  document.querySelectorAll("[data-nav-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.navTarget === nextTab);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `tab-${nextTab}`);
  });

  if (window.location.hash.slice(1) !== nextTab) {
    history.replaceState(null, "", `#${nextTab}`);
  }
}

function renderGenrePicker(containerId) {
  const container = document.getElementById(containerId);

  if (!container) {
    return;
  }

  container.innerHTML = GENRE_OPTIONS.map(
    (genre) => `
      <label class="genre-option">
        <input type="checkbox" value="${genre.value}" />
        <span>${genre.label}</span>
      </label>
    `,
  ).join("");
}

function getSelectedGenres(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map(
    (input) => input.value,
  );
}

function setSelectedGenres(containerId, values = []) {
  const selectedSet = new Set(values);

  document
    .querySelectorAll(`#${containerId} input[type="checkbox"]`)
    .forEach((input) => {
      input.checked = selectedSet.has(input.value);
    });
}

function clearThumbnailPreviewObject(scope) {
  const currentObjectUrl = state.thumbnailPreviewUrls[scope];

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    state.thumbnailPreviewUrls[scope] = null;
  }
}

function setThumbnailPreview(scope, url, options = {}) {
  const wrap = document.getElementById(`${scope}ThumbnailPreviewWrap`);
  const image = document.getElementById(`${scope}ThumbnailPreview`);
  const { isObjectUrl = false } = options;

  if (!wrap || !image) {
    return;
  }

  clearThumbnailPreviewObject(scope);

  if (!url) {
    wrap.hidden = true;
    image.removeAttribute("src");
    return;
  }

  wrap.hidden = false;
  image.src = url;

  if (isObjectUrl) {
    state.thumbnailPreviewUrls[scope] = url;
  }
}

function validateThumbnailFile(file) {
  if (!file) {
    return null;
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Format thumbnail manga harus JPG, PNG, WEBP, atau GIF.";
  }

  if (file.size > MAX_THUMBNAIL_SIZE) {
    return "Ukuran thumbnail maksimal 10MB.";
  }

  return null;
}

function validatePageFile(file) {
  if (!file) {
    return "File gambar belum dipilih.";
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Format panel harus JPG, PNG, WEBP, atau GIF.";
  }

  if (file.size > MAX_PAGE_FILE_SIZE) {
    return "Ukuran panel maksimal 8MB per file.";
  }

  return null;
}

async function uploadThumbnail(file, mangaTitle) {
  const formData = new FormData();
  formData.append("thumbnail", file);

  const endpoint = mangaTitle
    ? `${BOOKS_THUMBNAIL_ENDPOINT}?title=${encodeURIComponent(mangaTitle)}`
    : BOOKS_THUMBNAIL_ENDPOINT;

  const result = await requestForm("POST", endpoint, formData);
  return result.data.thumbnailUrl;
}

function collectBookPayload(scope) {
  return {
    title: String(document.getElementById(`${scope}Title`)?.value || "").trim(),
    author: String(
      document.getElementById(`${scope}Author`)?.value || "",
    ).trim(),
    genres: getSelectedGenres(`${scope}GenreOptions`),
    thumbnailUrl: String(
      document.getElementById(`${scope}ThumbnailUrl`)?.value || "",
    ).trim(),
    description: String(
      document.getElementById(`${scope}Description`)?.value || "",
    ).trim(),
    publishedOn: String(
      document.getElementById(`${scope}PublishedOn`)?.value || "",
    ).trim(),
    status: String(
      document.getElementById(`${scope}Status`)?.value || "",
    ).trim(),
  };
}

function validateBookPayload(payload) {
  if (!payload.title) {
    return "Judul manga wajib diisi.";
  }

  if (!payload.author) {
    return "Nama author wajib diisi.";
  }

  if (!Array.isArray(payload.genres) || payload.genres.length === 0) {
    return "Pilih minimal satu genre manga.";
  }

  if (!STATUS_LABELS[payload.status]) {
    return "Status manga tidak valid.";
  }

  return null;
}

function createPageSlot(pageNumber, options = {}) {
  return {
    pageNumber,
    existingImageUrl: options.existingImageUrl || "",
    file: options.file || null,
    previewUrl: options.previewUrl || null,
  };
}

function revokePageSlotPreview(slot) {
  if (slot?.previewUrl) {
    URL.revokeObjectURL(slot.previewUrl);
  }
}

function replaceChapterPageSlots(nextSlots) {
  const preservedSlots = new Set(nextSlots);

  state.chapterPageSlots.forEach((slot) => {
    if (!preservedSlots.has(slot)) {
      revokePageSlotPreview(slot);
    }
  });

  state.chapterPageSlots = nextSlots;
  renderChapterPageSlots();
}

function syncChapterPageSlots(pageCount) {
  const safePageCount = Math.min(
    MAX_CHAPTER_PAGES,
    Math.max(1, Number(pageCount || 1)),
  );
  const existingSlots = new Map(
    state.chapterPageSlots.map((slot) => [slot.pageNumber, slot]),
  );
  const nextSlots = [];

  for (let pageNumber = 1; pageNumber <= safePageCount; pageNumber += 1) {
    nextSlots.push(existingSlots.get(pageNumber) || createPageSlot(pageNumber));
  }

  replaceChapterPageSlots(nextSlots);
}

function buildSlotsFromPages(pages = [], pageCount = 1) {
  const pageMap = new Map(
    pages.map((page) => [Number(page.pageNumber), page.imageUrl]),
  );
  const totalPages = Math.min(
    MAX_CHAPTER_PAGES,
    Math.max(1, Number(pageCount || pages.length || 1)),
  );
  const slots = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    slots.push(
      createPageSlot(pageNumber, {
        existingImageUrl: pageMap.get(pageNumber) || "",
      }),
    );
  }

  return slots;
}

function getPageSlot(pageNumber) {
  return (
    state.chapterPageSlots.find((slot) => slot.pageNumber === pageNumber) ||
    null
  );
}

function renderChapterPageSlots() {
  const container = document.getElementById("chapterPageSlots");

  if (!container) {
    return;
  }

  container.innerHTML = state.chapterPageSlots
    .map((slot) => {
      const previewUrl = slot.previewUrl || slot.existingImageUrl;
      const statusText = slot.previewUrl
        ? "Preview aktif"
        : slot.existingImageUrl
          ? "Tersimpan"
          : "Belum ada";
      const fileName = slot.file
        ? `<p class="slot-file">${escapeHtml(slot.file.name)}</p>`
        : "";

      return `
        <div class="page-slot-card">
          <div class="page-slot-preview">
            ${
              previewUrl
                ? `<img src="${previewUrl}" alt="Preview panel ${slot.pageNumber}" />`
                : `<div class="cover-fallback">Panel ${slot.pageNumber}</div>`
            }
          </div>
          <div class="page-slot-meta">
            <p>${statusText}</p>
            ${fileName}
            <label class="secondary-button upload-button">
              <span>${previewUrl ? "Ganti Gambar" : "Upload Gambar"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                data-slot-page="${slot.pageNumber}" />
            </label>
          </div>
        </div>
      `;
    })
    .join("");
}

function getReaderUrl(book, chapterNumber, pageNumber = 1) {
  if (!book?.slug || !chapterNumber || !pageNumber) {
    return null;
  }

  return `/read/manga/${encodeURIComponent(book.slug)}/${chapterNumber}/${pageNumber}/`;
}

function getFirstReadableUrl(book) {
  return book?.firstChapterNumber
    ? getReaderUrl(book, book.firstChapterNumber, 1)
    : null;
}

function getSelectedBookSummary() {
  return state.books.find((book) => book.id === state.selectedBookId) || null;
}

function getStatusLabel(status) {
  return STATUS_LABELS[String(status || "reading")] || "Berjalan";
}

function getGenreText(book) {
  return Array.isArray(book?.genres) && book.genres.length > 0
    ? book.genres
        .map(
          (genre) =>
            GENRE_OPTIONS.find((option) => option.value === genre)?.label ||
            genre,
        )
        .join(", ")
    : "General";
}

function getChapterCount(book) {
  return Number(book?.chapterCount || book?.chapters?.length || 0);
}

function renderCatalogCount() {
  const chip = document.getElementById("catalogCount");

  if (chip) {
    chip.textContent = `${state.books.length} manga`;
  }
}

function buildMangaCardActions(book, options = {}) {
  if (!book || !book.id) {
    console.error("buildMangaCardActions: book atau book.id tidak valid", book);
    return "";
  }

  const readUrl = getFirstReadableUrl(book);
  const actions = [
    readUrl
      ? `<a class="primary-button small" href="${readUrl}">Baca</a>`
      : `<button type="button" class="secondary-button small" disabled>Belum Ada Chapter</button>`,
  ];

  if (isRegularUser()) {
    actions.push(
      `<button
        type="button"
        class="secondary-button small"
        data-action="toggle-favorite"
        data-book-id="${book.id}"
        data-next-favorite="${!book.isFavorite}">
        ${book.isFavorite ? "Hapus Favorit" : "Tambah Favorit"}
      </button>`,
    );
  }

  if (options.showManageActions && canManageCatalog()) {
    actions.push(
      `<button
        type="button"
        class="secondary-button small"
        data-action="open-edit-tab"
        data-book-id="${book.id}">
        Edit Manga
      </button>`,
    );
  }

  return actions.join("");
}

function renderMangaGrid(containerId, books, options = {}) {
  const container = document.getElementById(containerId);
  const emptyMessage =
    options.emptyMessage || "Belum ada manga yang bisa ditampilkan.";

  if (!container) {
    return;
  }

  if (!Array.isArray(books) || books.length === 0) {
    container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  container.innerHTML = books
    .map(
      (book) => `
        <article class="manga-card ${
          state.selectedBookId === book.id ? "is-active" : ""
        }">
          <div class="manga-card-cover">
            ${renderImageWithFallback(
              book.thumbnailUrl,
              `Cover ${book.title}`,
              "Manga",
            )}
          </div>
          <div class="manga-card-copy">
            <h3>${escapeHtml(book.title)}</h3>
            <p>${escapeHtml(book.author)}</p>
            <span>${escapeHtml(getGenreText(book))}</span>
            <small>${getChapterCount(book)} chapter ${getStatusLabel(
              book.status,
            )}</small>
          </div>
          <div class="button-row">
            ${buildMangaCardActions(book, options)}
          </div>
        </article>
      `,
    )
    .join("");
}

function buildChapterRow(chapter, options = {}) {
  const book = state.selectedBookDetail;
  const readUrl = book ? getReaderUrl(book, chapter.chapterNumber, 1) : null;
  const actions = [
    readUrl
      ? `<a class="primary-button small chapter-read-link" href="${readUrl}" data-book-id="${book?.id || ""}" data-chapter-number="${chapter.chapterNumber}">Baca</a>`
      : '<button type="button" class="secondary-button small" disabled>Belum Bisa Dibaca</button>',
  ];

  if (options.manage && canManageCatalog()) {
    actions.push(
      `<button
        type="button"
        class="secondary-button small"
        data-action="edit-chapter"
        data-book-id="${book.id}"
        data-chapter-id="${chapter.id}">
        Edit
      </button>`,
    );
    actions.push(
      `<button
        type="button"
        class="danger-button small"
        data-action="delete-chapter"
        data-book-id="${book.id}"
        data-chapter-id="${chapter.id}">
        Hapus
      </button>`,
    );
  }

  return `
    <article class="chapter-card">
      <div class="chapter-copy">
        <strong>Chapter ${chapter.chapterNumber}</strong>
        <span>${escapeHtml(formatDate(chapter.releaseDate))}</span>
      </div>
      <div class="button-row">
        ${actions.join("")}
      </div>
    </article>
  `;
}

function renderEditChapterList() {
  const container = document.getElementById("editChapterList");
  const chapters = state.selectedBookDetail?.chapters || [];

  if (!container) {
    return;
  }

  if (chapters.length === 0) {
    container.innerHTML =
      '<p class="empty-state">Belum ada chapter untuk manga aktif.</p>';
    return;
  }

  container.innerHTML = chapters
    .map((chapter) => buildChapterRow(chapter, { manage: true }))
    .join("");
}

function renderFavoritesGrid() {
  const favoriteBooks = state.books.filter((book) => book.isFavorite);
  renderMangaGrid("favoritesGrid", favoriteBooks, {
    emptyMessage: "Kamu belum punya manga favorit.",
    showManageActions: true,
  });
}

function renderEditMangaGallery() {
  const container = document.getElementById("editMangaGallery");

  if (!container) {
    return;
  }

  if (state.books.length === 0) {
    container.innerHTML =
      '<p class="empty-state">Belum ada manga untuk diedit.</p>';
    return;
  }

  container.innerHTML = state.books
    .map(
      (book) => `
        <button
          type="button"
          class="thumb-card ${state.selectedBookId === book.id ? "is-active" : ""}"
          data-action="select-book"
          data-book-id="${book.id}">
          <div class="thumb-image">
            ${renderImageWithFallback(book.thumbnailUrl, `Cover ${book.title}`, "Manga")}
          </div>
          <div class="thumb-copy">
            <strong>${escapeHtml(book.title)}</strong>
            <span>${getChapterCount(book)} chapter</span>
          </div>
        </button>
      `,
    )
    .join("");
}

function renderDatabaseList() {
  const container = document.getElementById("databaseList");

  if (!container) {
    return;
  }

  if (state.books.length === 0) {
    container.innerHTML =
      '<p class="empty-state">Database manga masih kosong.</p>';
    return;
  }

  container.innerHTML = state.books
    .map(
      (book) => `
        <article class="database-card">
          <div class="database-cover">
            ${renderImageWithFallback(book.thumbnailUrl, `Cover ${book.title}`, "Manga")}
          </div>
          <div class="database-copy">
            <strong>${escapeHtml(book.title)}</strong>
            <p>${escapeHtml(book.author)}</p>
            <span>${getChapterCount(book)} chapter • ${escapeHtml(
              getGenreText(book),
            )}</span>
          </div>
          <div class="button-row">
            <button
              type="button"
              class="secondary-button small"
              data-action="open-edit-tab"
              data-book-id="${book.id}">
              Edit
            </button>
            <button
              type="button"
              class="danger-button small"
              data-action="delete-book"
              data-book-id="${book.id}">
              Hapus Manga
            </button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderUserRoleList() {
  const container = document.getElementById("userRoleList");

  if (!container) {
    return;
  }

  if (state.users.length === 0) {
    container.innerHTML =
      '<p class="empty-state">Belum ada akun user yang bisa dikelola.</p>';
    return;
  }

  container.innerHTML = state.users
    .map((user) => {
      const isCurrentUser = user.id === state.currentUser.id;

      return `
        <article class="user-card ${isCurrentUser ? "is-active" : ""}">
          <div class="user-copy">
            <strong>${escapeHtml(user.email)}</strong>
            <p>${getRoleLabel(user.role)}${isCurrentUser ? " akun aktif" : ""}</p>
            <span>Diperbarui ${escapeHtml(formatDateTime(user.updatedAt))}</span>
          </div>
          <div class="user-actions">
            <select id="roleSelect-${user.id}" ${isCurrentUser ? "disabled" : ""}>
              <option value="super_admin" ${
                user.role === "super_admin" ? "selected" : ""
              }>Super Admin</option>
              <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
              <option value="user" ${user.role === "user" ? "selected" : ""}>User</option>
            </select>
            <div class="button-row">
              <button
                type="button"
                class="secondary-button small"
                data-action="save-user-role"
                data-user-id="${user.id}"
                ${isCurrentUser ? "disabled" : ""}>
                Simpan
              </button>
              <button
                type="button"
                class="danger-button small"
                data-action="delete-user"
                data-user-id="${user.id}"
                ${isCurrentUser ? "disabled" : ""}>
                Hapus
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function formatActionLabel(action) {
  return String(action || "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderActivityLogs() {
  const container = document.getElementById("activityLogList");

  if (!container) {
    return;
  }

  if (state.logs.length === 0) {
    container.innerHTML =
      '<p class="empty-state">Belum ada aktivitas yang tercatat.</p>';
    return;
  }

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
      <h3 style="margin:0">Activity Logs</h3>
      <div class="button-row">
        <button type="button" id="deleteAllLogsTop" class="danger-button small">Hapus Semua</button>
      </div>
    </div>
    <div class="log-table">
      <div class="log-head">
        <span>User</span>
        <span>Action</span>
        <span>Waktu</span>
      </div>
      ${state.logs
        .map(
          (log) => `
            <article class="log-row">
              <div>
                <strong>${escapeHtml(log.userEmail || "-")}</strong>
                <p>${escapeHtml(getRoleLabel(log.userRole))}</p>
              </div>
              <div>
                <strong>${escapeHtml(formatActionLabel(log.action))}</strong>
                <p>${escapeHtml(log.description || "-")}</p>
              </div>
              <div>
                <strong>${escapeHtml(formatDateTime(log.createdAt))}</strong>
                <p>${escapeHtml(log.targetType || "-")}</p>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;

  // Attach top delete button
  const deleteTop = document.getElementById("deleteAllLogsTop");
  if (deleteTop) {
    deleteTop.addEventListener("click", async () => {
      const ok = window.confirm(
        "Yakin hapus semua activity logs? Tindakan ini tidak bisa dibatalkan.",
      );
      if (!ok) return;

      try {
        await deleteAllLogs();
        showFeedback("Semua activity logs telah dihapus.", "success");
        await refreshDashboard();
      } catch (err) {
        showFeedback(err.message || "Gagal menghapus logs.", "error");
      }
    });
  }
}

async function deleteAllLogs() {
  try {
    await requestJson("DELETE", LOGS_ENDPOINT);
  } catch (error) {
    throw error;
  }
}

function renderEditFormFromSelectedBook() {
  const meta = document.getElementById("editSelectedMeta");
  const form = document.getElementById("editMangaForm");
  const book = state.selectedBookDetail;

  if (!meta || !form) {
    return;
  }

  if (!book) {
    meta.textContent = "Belum dipilih";
    form.reset();
    document.getElementById("editBookId").value = "";
    document.getElementById("editThumbnailUrl").value = "";
    setSelectedGenres("editGenreOptions", []);
    setThumbnailPreview("edit", "");
    return;
  }

  meta.textContent = `${book.title} ${getChapterCount(book)} chapter`;
  document.getElementById("editBookId").value = String(book.id);
  document.getElementById("editTitle").value = book.title || "";
  document.getElementById("editAuthor").value = book.author || "";
  document.getElementById("editStatus").value = book.status || "reading";
  document.getElementById("editPublishedOn").value = book.publishedOn || "";
  document.getElementById("editDescription").value = book.description || "";
  document.getElementById("editThumbnailUrl").value = book.thumbnailUrl || "";
  setSelectedGenres("editGenreOptions", book.genres || []);
  setThumbnailPreview("edit", book.thumbnailUrl || "");
}

function resetAddMangaForm() {
  const form = document.getElementById("addMangaForm");

  if (!form) {
    return;
  }

  form.reset();
  document.getElementById("addThumbnailUrl").value = "";
  setSelectedGenres("addGenreOptions", []);
  setThumbnailPreview("add", "");
}

function getNextChapterNumber(book) {
  const chapters = book?.chapters || [];

  if (chapters.length === 0) {
    return 1;
  }

  return (
    Math.max(
      ...chapters.map((chapter) => Number(chapter.chapterNumber || 0)),
      0,
    ) + 1
  );
}

function prepareChapterForm(book = state.selectedBookDetail) {
  const bookLabel = document.getElementById("chapterBookLabel");
  const bookIdInput = document.getElementById("chapterBookId");
  const chapterIdInput = document.getElementById("chapterId");
  const chapterNumber = document.getElementById("chapterNumber");
  const chapterReleaseDate = document.getElementById("chapterReleaseDate");
  const chapterPageCount = document.getElementById("chapterPageCount");
  const title = document.getElementById("chapterFormTitle");

  if (
    !bookLabel ||
    !bookIdInput ||
    !chapterIdInput ||
    !chapterNumber ||
    !chapterReleaseDate ||
    !chapterPageCount ||
    !title
  ) {
    return;
  }

  chapterIdInput.value = "";
  chapterReleaseDate.value = "";
  title.textContent = "Kelola Chapter Manga";

  if (!book) {
    bookLabel.textContent = "Pilih manga dari galeri di kiri.";
    bookIdInput.value = "";
    chapterNumber.value = "";
    chapterPageCount.value = "";
    replaceChapterPageSlots([]);
    return;
  }

  bookLabel.textContent = `${book.title} ${getChapterCount(book)} chapter`;
  bookIdInput.value = String(book.id);
  chapterNumber.value = String(getNextChapterNumber(book));
  chapterPageCount.value = "1";
  replaceChapterPageSlots(buildSlotsFromPages([], 1));
}

function applyChapterToForm(chapter) {
  const title = document.getElementById("chapterFormTitle");
  const chapterIdInput = document.getElementById("chapterId");
  const chapterNumber = document.getElementById("chapterNumber");
  const chapterReleaseDate = document.getElementById("chapterReleaseDate");
  const chapterPageCount = document.getElementById("chapterPageCount");

  if (
    !title ||
    !chapterIdInput ||
    !chapterNumber ||
    !chapterReleaseDate ||
    !chapterPageCount
  ) {
    return;
  }

  title.textContent = `Edit Chapter ${chapter.chapterNumber}`;
  chapterIdInput.value = String(chapter.id);
  chapterNumber.value = String(chapter.chapterNumber);
  chapterReleaseDate.value = chapter.releaseDate || "";
  chapterPageCount.value = String(chapter.pageCount || 1);
  replaceChapterPageSlots(
    buildSlotsFromPages(chapter.pages, chapter.pageCount),
  );
}

function validateChapterPayload(payload, options = {}) {
  const { isEditMode = false } = options;

  if (!payload.bookId) {
    return "Pilih manga aktif terlebih dulu.";
  }

  if (Number.isNaN(payload.chapterNumber)) {
    return "Nomor chapter wajib berupa angka bulat positif.";
  }

  if (Number.isNaN(payload.pageCount)) {
    return "Jumlah panel wajib berupa angka bulat positif.";
  }

  if (payload.pageCount > MAX_CHAPTER_PAGES) {
    return `Jumlah panel maksimal ${MAX_CHAPTER_PAGES}.`;
  }

  if (state.chapterPageSlots.length !== payload.pageCount) {
    return "Jumlah slot panel belum sinkron.";
  }

  for (let pageNumber = 1; pageNumber <= payload.pageCount; pageNumber += 1) {
    const slot = getPageSlot(pageNumber);

    if (!slot) {
      return `Slot panel ${pageNumber} belum tersedia.`;
    }

    if (slot.file) {
      const pageError = validatePageFile(slot.file);

      if (pageError) {
        return `Panel ${pageNumber}: ${pageError}`;
      }
    }

    if (!isEditMode && !slot.file) {
      return `Gambar untuk panel ${pageNumber} wajib diunggah.`;
    }

    if (isEditMode && !slot.file && !slot.existingImageUrl) {
      return `Gambar untuk panel ${pageNumber} wajib diunggah.`;
    }
  }

  return null;
}

function collectChapterPayload(form) {
  return {
    bookId: parsePositiveInteger(form.chapterBookId.value),
    chapterNumber: normalizePositiveInteger(form.chapterNumber.value),
    releaseDate: String(form.releaseDate.value || "").trim(),
    pageCount: normalizePositiveInteger(form.pageCount.value),
  };
}

function buildChapterFormData(payload) {
  const formData = new FormData();
  formData.append("chapterNumber", String(payload.chapterNumber));
  formData.append("releaseDate", payload.releaseDate);
  formData.append("pageCount", String(payload.pageCount));

  state.chapterPageSlots.forEach((slot) => {
    if (slot.file) {
      formData.append(`page-${slot.pageNumber}`, slot.file);
    }
  });

  return formData;
}

async function loadSelectedBook(bookId, options = {}) {
  const result = await requestJson("GET", `${BOOKS_ENDPOINT}/${bookId}`);
  state.selectedBookId = bookId;
  state.selectedBookDetail = result.data;

  if (!options.skipRender) {
    renderAll();
  }
}

async function refreshDashboard(options = {}) {
  const preferredBookId = options.preferredBookId || state.selectedBookId;
  const requests = [requestJson("GET", BOOKS_ENDPOINT)];

  if (canManageUsers()) {
    requests.push(requestJson("GET", USERS_ENDPOINT));
  }

  if (canViewLogs()) {
    requests.push(requestJson("GET", LOGS_ENDPOINT));
  }

  const responses = await Promise.all(requests);
  const booksResult = responses[0];
  let responseIndex = 1;

  state.books = Array.isArray(booksResult.data) ? booksResult.data : [];

  if (canManageUsers()) {
    const usersResult = responses[responseIndex];
    responseIndex += 1;
    state.users = Array.isArray(usersResult.data?.users)
      ? usersResult.data.users
      : [];
  } else {
    state.users = [];
  }

  if (canViewLogs()) {
    const logsResult = responses[responseIndex];
    state.logs = Array.isArray(logsResult.data) ? logsResult.data : [];
  } else {
    state.logs = [];
  }

  if (state.books.length === 0) {
    state.selectedBookId = null;
    state.selectedBookDetail = null;
    renderAll();
    prepareChapterForm(null);
    return;
  }

  const nextBookId = state.books.some((book) => book.id === preferredBookId)
    ? preferredBookId
    : state.books[0].id;

  await loadSelectedBook(nextBookId, { skipRender: true });
  renderAll();
}

function renderAll() {
  renderCatalogCount();
  renderMangaGrid("libraryGrid", state.books, { showManageActions: true });
  renderFavoritesGrid();
  renderEditMangaGallery();
  renderEditFormFromSelectedBook();
  renderEditChapterList();
  renderDatabaseList();
  renderUserRoleList();
  renderActivityLogs();
  prepareChapterForm(state.selectedBookDetail);
}

async function selectBook(bookId) {
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return;
  }

  try {
    await loadSelectedBook(bookId);
  } catch (error) {
    showFeedback(error.message || "Gagal memuat detail manga.", "error");
  }
}

async function handleAddMangaSubmit(event) {
  event.preventDefault();

  const payload = collectBookPayload("add");
  const validationError = validateBookPayload(payload);
  const thumbnailInput = document.getElementById("addThumbnail");
  const thumbnailFile = thumbnailInput?.files?.[0];
  const thumbnailError = validateThumbnailFile(thumbnailFile);

  if (validationError) {
    showFeedback(validationError, "error");
    return;
  }

  if (thumbnailError) {
    showFeedback(thumbnailError, "error");
    return;
  }

  try {
    if (thumbnailFile) {
      payload.thumbnailUrl = await uploadThumbnail(
        thumbnailFile,
        payload.title,
      );
      document.getElementById("addThumbnailUrl").value = payload.thumbnailUrl;
    }

    const result = await requestJson("POST", BOOKS_ENDPOINT, payload);
    resetAddMangaForm();
    await refreshDashboard({ preferredBookId: result.data.id });
    setActiveTab("edit-manga");
    showFeedback("Manga berhasil ditambahkan.", "success");
  } catch (error) {
    showFeedback(error.message || "Gagal menyimpan manga.", "error");
  }
}

async function handleEditMangaSubmit(event) {
  event.preventDefault();

  const bookId = parsePositiveInteger(
    document.getElementById("editBookId")?.value,
  );

  if (!bookId) {
    showFeedback("Pilih manga yang ingin diedit terlebih dulu.", "error");
    return;
  }

  const payload = collectBookPayload("edit");
  const validationError = validateBookPayload(payload);
  const thumbnailInput = document.getElementById("editThumbnail");
  const thumbnailFile = thumbnailInput?.files?.[0];
  const thumbnailError = validateThumbnailFile(thumbnailFile);

  if (validationError) {
    showFeedback(validationError, "error");
    return;
  }

  if (thumbnailError) {
    showFeedback(thumbnailError, "error");
    return;
  }

  try {
    if (thumbnailFile) {
      // Upload thumbnail using the current (old) title so the file lands
      // in the existing folder. The server will rename the folder afterwards.
      const currentBook = state.selectedBookDetail;
      const folderTitle = currentBook?.title || payload.title;
      payload.thumbnailUrl = await uploadThumbnail(
        thumbnailFile,
        folderTitle,
      );
      document.getElementById("editThumbnailUrl").value = payload.thumbnailUrl;
    }

    await requestJson("PUT", `${BOOKS_ENDPOINT}/${bookId}`, payload);
    await refreshDashboard({ preferredBookId: bookId });
    showFeedback("Manga berhasil diperbarui.", "success");
  } catch (error) {
    showFeedback(error.message || "Gagal memperbarui manga.", "error");
  }
}

async function handleChapterSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const payload = collectChapterPayload(form);
  const isEditMode = Boolean(form.chapterId.value);
  const validationError = validateChapterPayload(payload, { isEditMode });

  if (validationError) {
    showFeedback(validationError, "error");
    return;
  }

  try {
    const formData = buildChapterFormData(payload);

    await requestForm(
      isEditMode ? "PUT" : "POST",
      isEditMode
        ? `${BOOKS_ENDPOINT}/${payload.bookId}/chapters/${form.chapterId.value}`
        : `${BOOKS_ENDPOINT}/${payload.bookId}/chapters`,
      formData,
    );

    await refreshDashboard({ preferredBookId: payload.bookId });
    showFeedback(
      isEditMode
        ? "Chapter berhasil diperbarui."
        : "Chapter berhasil ditambahkan.",
      "success",
    );
  } catch (error) {
    showFeedback(error.message || "Gagal menyimpan chapter.", "error");
  }
}

async function beginChapterEdit(bookId, chapterId) {
  try {
    if (state.selectedBookId !== bookId) {
      await loadSelectedBook(bookId, { skipRender: true });
    }

    const result = await requestJson(
      "GET",
      `${BOOKS_ENDPOINT}/${bookId}/chapters/${chapterId}`,
    );

    renderAll();
    applyChapterToForm(result.data);
    setActiveTab("edit-manga");
    document.getElementById("chapterForm")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } catch (error) {
    showFeedback(error.message || "Gagal memuat detail chapter.", "error");
  }
}

async function deleteBook(bookId) {
  const confirmed = window.confirm(
    "Yakin ingin menghapus manga ini beserta semua chapter dan panelnya?",
  );

  if (!confirmed) {
    return;
  }

  try {
    await requestJson("DELETE", `${BOOKS_ENDPOINT}/${bookId}`);
    await refreshDashboard();
    showFeedback("Manga berhasil dihapus.", "success");
  } catch (error) {
    showFeedback(error.message || "Gagal menghapus manga.", "error");
  }
}

async function deleteChapter(bookId, chapterId) {
  const confirmed = window.confirm("Yakin ingin menghapus chapter ini?");

  if (!confirmed) {
    return;
  }

  try {
    await requestJson(
      "DELETE",
      `${BOOKS_ENDPOINT}/${bookId}/chapters/${chapterId}`,
    );
    await refreshDashboard({ preferredBookId: bookId });
    showFeedback("Chapter berhasil dihapus.", "success");
  } catch (error) {
    showFeedback(error.message || "Gagal menghapus chapter.", "error");
  }
}

async function toggleFavorite(bookId, nextFavorite) {
  try {
    await requestJson("POST", `${BOOKS_ENDPOINT}/${bookId}/favorite`, {
      isFavorite: nextFavorite,
    });
    await refreshDashboard({ preferredBookId: bookId });
    showFeedback(
      nextFavorite
        ? "Manga ditambahkan ke favorit."
        : "Manga dihapus dari favorit.",
      "success",
    );
  } catch (error) {
    showFeedback(error.message || "Gagal mengubah favorit.", "error");
  }
}

async function updateUserRole(userId, nextRole) {
  try {
    await requestJson("PATCH", `${USERS_ENDPOINT}/${userId}/role`, {
      role: nextRole,
    });
    await refreshDashboard({ preferredBookId: state.selectedBookId });
    showFeedback("Role user berhasil diperbarui.", "success");
  } catch (error) {
    showFeedback(error.message || "Gagal memperbarui role user.", "error");
  }
}

async function deleteUser(userId) {
  const confirmed = window.confirm(
    "Yakin ingin menghapus user ini? Data favorit dan histori baca akan ikut terhapus.",
  );

  if (!confirmed) {
    return;
  }

  try {
    await requestJson("DELETE", `${USERS_ENDPOINT}/${userId}`);
    await refreshDashboard({ preferredBookId: state.selectedBookId });
    showFeedback("User berhasil dihapus.", "success");
  } catch (error) {
    showFeedback(error.message || "Gagal menghapus user.", "error");
  }
}

function handleThumbnailInputChange(scope) {
  const input = document.getElementById(`${scope}Thumbnail`);
  const hiddenInput = document.getElementById(`${scope}ThumbnailUrl`);
  const file = input?.files?.[0];

  if (!input || !hiddenInput) {
    return;
  }

  if (!file) {
    setThumbnailPreview(scope, hiddenInput.value || "");
    return;
  }

  const error = validateThumbnailFile(file);

  if (error) {
    input.value = "";
    showFeedback(error, "error");
    setThumbnailPreview(scope, hiddenInput.value || "");
    return;
  }

  setThumbnailPreview(scope, URL.createObjectURL(file), {
    isObjectUrl: true,
  });
}

function handlePageSlotFileChange(input) {
  const pageNumber = parsePositiveInteger(input.dataset.slotPage);
  const file = input.files?.[0];

  if (!pageNumber || !file) {
    return;
  }

  const error = validatePageFile(file);

  if (error) {
    input.value = "";
    showFeedback(`Panel ${pageNumber}: ${error}`, "error");
    return;
  }

  const slot = getPageSlot(pageNumber);

  if (!slot) {
    return;
  }

  revokePageSlotPreview(slot);
  slot.file = file;
  slot.previewUrl = URL.createObjectURL(file);
  renderChapterPageSlots();
}

function attachNavigation() {
  document.querySelectorAll("[data-nav-target]").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.navTarget);
    });
  });

  window.addEventListener("hashchange", () => {
    setActiveTab(getActiveTabFromHash());
  });
}

function attachGlobalActions() {
  document.body.addEventListener("click", async (event) => {
    const actionElement = event.target.closest("[data-action]");

    if (!actionElement) {
      return;
    }

    const action = actionElement.dataset.action;
    const bookId = parsePositiveInteger(actionElement.dataset.bookId);
    const chapterId = parsePositiveInteger(actionElement.dataset.chapterId);
    const userId = parsePositiveInteger(actionElement.dataset.userId);

    if (action === "select-book" && bookId) {
      await selectBook(bookId);
      return;
    }

    if (action === "open-edit-tab" && bookId) {
      await selectBook(bookId);
      setActiveTab("edit-manga");
      return;
    }

    if (action === "toggle-favorite" && bookId) {
      await toggleFavorite(
        bookId,
        actionElement.dataset.nextFavorite === "true",
      );
      return;
    }

    if (action === "edit-chapter" && bookId && chapterId) {
      await beginChapterEdit(bookId, chapterId);
      return;
    }

    if (action === "delete-book" && bookId) {
      await deleteBook(bookId);
      return;
    }

    if (action === "delete-chapter" && bookId && chapterId) {
      await deleteChapter(bookId, chapterId);
      return;
    }

    if (action === "save-user-role" && userId) {
      const select = document.getElementById(`roleSelect-${userId}`);
      const nextRole = String(select?.value || "")
        .trim()
        .toLowerCase();

      if (!nextRole) {
        return;
      }

      await updateUserRole(userId, nextRole);
      return;
    }

    if (action === "delete-user" && userId) {
      await deleteUser(userId);
    }
  });

  document.body.addEventListener("change", (event) => {
    const target = event.target;

    if (target.id === "addThumbnail") {
      handleThumbnailInputChange("add");
      return;
    }

    if (target.id === "editThumbnail") {
      handleThumbnailInputChange("edit");
      return;
    }

    if (target.id === "chapterPageCount") {
      const pageCount = normalizePositiveInteger(target.value);

      if (!Number.isNaN(pageCount)) {
        syncChapterPageSlots(pageCount);
      }
      return;
    }

    if (target.matches("[data-slot-page]")) {
      handlePageSlotFileChange(target);
    }
  });
}

function attachForms() {
  document
    .getElementById("addMangaForm")
    ?.addEventListener("submit", handleAddMangaSubmit);
  document
    .getElementById("editMangaForm")
    ?.addEventListener("submit", handleEditMangaSubmit);
  document
    .getElementById("chapterForm")
    ?.addEventListener("submit", handleChapterSubmit);

  document
    .getElementById("resetAddMangaButton")
    ?.addEventListener("click", resetAddMangaForm);
  document
    .getElementById("resetEditMangaButton")
    ?.addEventListener("click", () => {
      renderEditFormFromSelectedBook();
      showFeedback("Form edit manga dikembalikan ke data terbaru.", "info");
    });
  document
    .getElementById("cancelChapterEditButton")
    ?.addEventListener("click", () => {
      prepareChapterForm(state.selectedBookDetail);
      showFeedback("Edit chapter dibatalkan.", "info");
    });
}

async function initDashboardPage() {
  const pageMarker = document.getElementById("dashboardSidebar");

  if (!pageMarker) {
    return;
  }

  try {
    // Session sudah di-refresh oleh auth.js (DOMContentLoaded).
    // Tidak perlu refresh lagi di sini — menghindari API /api/auth/me dipanggil 2x.
  } catch (error) {
    console.warn("Dashboard session refresh warning:", error.message);
  }

  state.currentUser = window.MangakuSession.getCurrentUserSession();

  if (!state.currentUser) {
    redirectToLogin();
    return;
  }

  window.MangakuSession.setCurrentUserSession(state.currentUser);
  setBodyRoleMode();
  hydrateCurrentUserIdentity();
  renderGenrePicker("addGenreOptions");
  renderGenrePicker("editGenreOptions");
  attachNavigation();
  attachGlobalActions();
  attachForms();
  setActiveTab(getActiveTabFromHash());
  resetAddMangaForm();
  prepareChapterForm(null);

  try {
    await refreshDashboard();
  } catch (error) {
    showFeedback(error.message || "Gagal memuat dashboard manga.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initDashboardPage();
});
