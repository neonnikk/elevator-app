// Режим отображения: 'auto' | 'mobile' | 'desktop'
// Хранится в localStorage отдельно для каждого пользователя

const KEY = (userId) => `view_mode_${userId}`;

export function getViewMode(userId) {
  try { return localStorage.getItem(KEY(userId)) || 'auto'; } catch { return 'auto'; }
}

export function setViewMode(userId, mode) {
  try { localStorage.setItem(KEY(userId), mode); } catch {}
}

// Возвращает true если нужно показывать мобильный интерфейс
export function isMobileLayout(userId) {
  const mode = getViewMode(userId);
  if (mode === 'mobile') return true;
  if (mode === 'desktop') return false;
  // auto — detect by screen width
  return window.innerWidth <= 768;
}

// ── Тема оформления: 'auto' | 'dark' | 'light' ──────────────────────────────
// Хранится в localStorage отдельно для каждого пользователя

const THEME_KEY = (userId) => `theme_${userId}`;

export function getTheme(userId) {
  try { return localStorage.getItem(THEME_KEY(userId)) || 'auto'; } catch { return 'auto'; }
}

export function setTheme(userId, theme) {
  try { localStorage.setItem(THEME_KEY(userId), theme); } catch {}
}

export function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'dark')  { html.setAttribute('data-theme', 'dark'); }
  else if (theme === 'light') { html.setAttribute('data-theme', 'light'); }
  else { html.removeAttribute('data-theme'); } // auto = следовать системной
}
