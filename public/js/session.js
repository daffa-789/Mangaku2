(() => {
  const SESSION_KEY = "manga.currentUser";
  const REDIRECT_AFTER_LOGIN_KEY = "manga.redirectAfterLogin";

  function getCurrentUserSession() {
    return window.MangakuCore.getSession(SESSION_KEY);
  }

  function setCurrentUserSession(userData) {
    window.MangakuCore.setSession(SESSION_KEY, userData);
  }

  function clearCurrentUserSession() {
    window.MangakuCore.clearSession(SESSION_KEY, [REDIRECT_AFTER_LOGIN_KEY]);
  }

  function storeRedirectAfterLogin(pathname) {
    if (!pathname) {
      return;
    }

    sessionStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, pathname);
  }

  function consumeRedirectAfterLogin() {
    const pathname = sessionStorage.getItem(REDIRECT_AFTER_LOGIN_KEY);
    sessionStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
    return pathname || "/home.html";
  }

  async function refreshCurrentUserSession() {
    const currentUser = getCurrentUserSession();

    if (!currentUser) {
      return null;
    }

    const headers = {
      "x-user-id": String(currentUser.id),
    };

    if (currentUser.token) {
      headers.Authorization = `Bearer ${currentUser.token}`;
    }

    const response = await fetch("/api/auth/me", { headers });
    const result = await window.MangakuCore.parseJsonResponse(response);

    if (!response.ok) {
      clearCurrentUserSession();
      return null;
    }

    setCurrentUserSession(result.data);
    return result.data;
  }

  window.MangakuSession = {
    getCurrentUserSession,
    setCurrentUserSession,
    clearCurrentUserSession,
    storeRedirectAfterLogin,
    consumeRedirectAfterLogin,
    refreshCurrentUserSession,
  };
})();
