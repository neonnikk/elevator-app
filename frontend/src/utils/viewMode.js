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
