function addCacheBuster(url, version) {
  if (!url) return url;
  const separator = String(url).includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(version || '0'))}`;
}

export { addCacheBuster };
