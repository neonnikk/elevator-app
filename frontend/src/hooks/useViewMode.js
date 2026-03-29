const STORAGE_KEY = 'viewMode';

export function getViewMode() {
  try { return localStorage.getItem(STORAGE_KEY) || 'auto'; } catch { return 'auto'; }
}

export function setViewMode(mode) {
  try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  applyViewMode(mode);
}

export function applyViewMode(mode) {
  const root = document.documentElement;
  root.classList.remove('view-mobile', 'view-desktop');
  if (mode === 'mobile') root.classList.add('view-mobile');
  if (mode === 'desktop') root.classList.add('view-desktop');
}

export function initViewMode() {
  applyViewMode(getViewMode());
}
