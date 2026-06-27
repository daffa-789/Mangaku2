const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

function setCurrentUserSession(userData) {
  window.MangakuSession.setCurrentUserSession(userData);
}

function getCurrentUserSession() {
  return window.MangakuSession.getCurrentUserSession();
}

function clearCurrentUserSession() {
  window.MangakuSession.clearCurrentUserSession();
}

function isAuthPage(pathname) {
  return (
    pathname.endsWith("/login.html") || pathname.endsWith("/register.html")
  );
}

function isHomePage(pathname) {
  return pathname === "/" || pathname.endsWith("/home.html");
}

function isReaderPage(pathname) {
  return pathname.startsWith("/read/manga/");
}

function isProtectedPage(pathname) {
  return isHomePage(pathname) || isReaderPage(pathname);
}

function storeRedirectAfterLogin(pathname) {
  if (!pathname || isAuthPage(pathname)) {
    return;
  }

  window.MangakuSession.storeRedirectAfterLogin(pathname);
}

function consumeRedirectAfterLogin() {
  return window.MangakuSession.consumeRedirectAfterLogin();
}

function guardPageAccess() {
  const pathname = window.location.pathname.toLowerCase();
  const targetPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const currentUser = getCurrentUserSession();

  if (isProtectedPage(pathname) && !currentUser) {
    storeRedirectAfterLogin(targetPath);
    window.location.replace("/login.html");
    return false;
  }

  if (isAuthPage(pathname) && currentUser) {
    window.location.replace(consumeRedirectAfterLogin());
    return false;
  }

  return true;
}

async function setFeedback(message, variant = "info") {
  return window.MangakuCore.showFeedback(message, variant);
}

function validateCredentials(email, password) {
  if (!email) {
    return "Email wajib diisi.";
  }

  if (!EMAIL_REGEX.test(email)) {
    return "Format email tidak valid.";
  }

  if (!password) {
    return "Password wajib diisi.";
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  }

  return null;
}

function setButtonState(button, busyText, isBusy) {
  if (isBusy) {
    button.disabled = true;
    button.textContent = busyText;
    return;
  }

  button.disabled = false;
  button.textContent = button.dataset.defaultText || button.textContent;
}

async function postAuth(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await window.MangakuCore.parseJsonResponse(response);

  return {
    ok: response.ok,
    status: response.status,
    result,
  };
}

function attachRegisterForm() {
  const form = document.getElementById("registerForm");

  if (!form) {
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = window.MangakuCore.normalizeEmail(form.email.value);
    const password = String(form.password.value || "");
    const validationError = validateCredentials(email, password);

    if (validationError) {
      await setFeedback(validationError, "error");
      return;
    }

    setButtonState(submitButton, "Memproses...", true);

    try {
      const { ok, result } = await postAuth("/api/auth/register", {
        email,
        password,
      });

      if (!ok) {
        await setFeedback(result.message || "Registrasi gagal.", "error");
        return;
      }

      await setFeedback(
        `Registrasi berhasil sebagai ${result.data.email}.`,
        "success",
      );
      setCurrentUserSession(result.data);
      form.reset();
      window.location.assign(consumeRedirectAfterLogin());
    } catch (error) {
      await setFeedback("Tidak dapat terhubung ke server.", "error");
    } finally {
      setButtonState(submitButton, "", false);
    }
  });
}

function attachLoginForm() {
  const form = document.getElementById("loginForm");

  if (!form) {
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = window.MangakuCore.normalizeEmail(form.email.value);
    const password = String(form.password.value || "");
    const validationError = validateCredentials(email, password);

    if (validationError) {
      await setFeedback(validationError, "error");
      return;
    }

    setButtonState(submitButton, "Memproses...", true);

    try {
      const { ok, result } = await postAuth("/api/auth/login", {
        email,
        password,
      });

      if (!ok) {
        await setFeedback(result.message || "Login gagal.", "error");
        return;
      }

      await setFeedback(
        `Login berhasil sebagai ${result.data.email}.`,
        "success",
      );

      setCurrentUserSession(result.data);
      window.location.assign(consumeRedirectAfterLogin());
    } catch (error) {
      await setFeedback("Tidak dapat terhubung ke server.", "error");
    } finally {
      setButtonState(submitButton, "", false);
    }
  });
}

function attachLogoutButton() {
  const logoutButton = document.getElementById("logoutButton");

  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener("click", () => {
    clearCurrentUserSession();
    window.location.assign("/login.html");
  });
}

function hydrateCurrentUserIdentity() {
  const userIdentity = document.getElementById("currentUserEmail");
  const userRole = document.getElementById("currentUserRole");

  if (!userIdentity) {
    return;
  }

  const currentUser = getCurrentUserSession();
  userIdentity.textContent = currentUser ? currentUser.email : "-";

  if (userRole) {
    userRole.textContent = currentUser ? currentUser.role || "user" : "-";
  }
}

function attachPasswordToggles() {
  const toggleButtons = document.querySelectorAll("[data-toggle-password]");

  if (!toggleButtons.length) {
    return;
  }

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.target;
      const input = document.getElementById(targetId);

      if (!input) {
        return;
      }

      const nextType = input.type === "password" ? "text" : "password";
      const eyeOpen = button.querySelector("[data-eye-open]");
      const eyeOff = button.querySelector("[data-eye-off]");
      const isVisible = nextType === "text";

      input.type = nextType;
      button.setAttribute(
        "aria-label",
        isVisible ? "Sembunyikan password" : "Tampilkan password",
      );

      if (eyeOpen && eyeOff) {
        eyeOpen.classList.toggle("hidden", isVisible);
        eyeOff.classList.toggle("hidden", !isVisible);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await window.MangakuSession.refreshCurrentUserSession();
  } catch (error) {
    console.warn("Auth session refresh warning:", error.message);
  }

  const canAccessPage = guardPageAccess();

  if (!canAccessPage) {
    return;
  }

  attachRegisterForm();
  attachLoginForm();
  attachLogoutButton();
  attachPasswordToggles();
  hydrateCurrentUserIdentity();
});
