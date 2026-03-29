/**
 * rateLimit.js — простой rate limiter без внешних зависимостей.
 *
 * Хранит счётчики запросов по IP в Map (in-memory).
 * При превышении лимита возвращает 429 с заголовком Retry-After.
 *
 * Ограничения: счётчики сбрасываются при перезапуске сервера.
 * Для production с несколькими инстансами нужен Redis-based limiter.
 * Для текущего однопроцессного Docker-деплоя — достаточно.
 *
 * Используется на эндпоинтах авторизации (/login, /setup) для защиты от брутфорса.
 */

const store = new Map(); // ip → { count, resetAt }

/**
 * @param {number} windowMs  - Окно в миллисекундах (default: 15 минут)
 * @param {number} max       - Максимум запросов за окно (default: 10)
 * @param {string} message   - Сообщение при превышении
 */
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Слишком много запросов' } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = store.get(ip);

    // Первый запрос от этого IP или окно истекло — начинаем новый отсчёт
    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({ error: message, retryAfter });
    }
    next();
  };
}

// Очищаем истёкшие записи каждые 5 минут чтобы не копить память.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(ip);
  }
}, 5 * 60 * 1000);
