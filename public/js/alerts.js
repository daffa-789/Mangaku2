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

  window.MangakuAlerts = {
    showFeedback,
  };
})();
