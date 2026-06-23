(() => {
  async function showFeedback(options = {}) {
    const {
      icon = "info",
      title = "Pemberitahuan",
      text,
      confirmButtonText = "OK",
      timer = 0,
      timerProgressBar = false,
    } = options;

    if (!text) {
      return null;
    }

    return Swal.fire({
      icon,
      title,
      text,
      confirmButtonText,
      ...(timer > 0 ? { timer, timerProgressBar } : {}),
    });
  }

  function showSuccess(text, title = "Berhasil") {
    return showFeedback({
      icon: "success",
      title,
      text,
      timer: 3000,
      timerProgressBar: true,
    });
  }

  function showError(text, title = "Gagal") {
    return showFeedback({
      icon: "error",
      title,
      text,
    });
  }

  window.MangakuAlerts = {
    showFeedback,
    showSuccess,
    showError,
  };
})();
