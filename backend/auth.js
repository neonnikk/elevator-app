/**
 * auth.js — JWT-аутентификация.
 *
 * Содержит три экспорта:
 *   - generateToken()   — создаёт подписанный JWT для пользователя
 *   - authMiddleware()  — Express middleware, проверяет токен на каждом запросе
 *   - adminOnly()       — дополнительный middleware для admin-only эндпоинтов
 *   - invalidateTokens() — инкрементирует token_version (выбивает все сессии)
 *
 * Механизм инвалидации:
 *   В JWT записывается поле `tv` (token_version) на момент выдачи токена.
 *   При каждом запросе tv из токена сравнивается с актуальным значением в БД.
 *   Если version изменилась (смена пароля, блокировка) — токен отклоняется.
 *   Это позволяет мгновенно инвалидировать все сессии без хранения blacklist.
 */

import jwt from 'jsonwebtoken';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'elevator-maintenance-secret-2024';

/**
 * Создаёт JWT-токен для пользователя. Срок действия — 7 дней.
 * В payload записываем минимум: id, role (нужен для adminOnly), tv (для инвалидации).
 */
export function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, tv: user.token_version ?? 0 },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Express middleware — проверяет JWT на каждом защищённом запросе.
 *
 * Порядок поиска токена:
 *   1. httpOnly cookie `token` (основной способ — браузер отправляет автоматически)
 *   2. Authorization: Bearer <token> (fallback для legacy клиентов и API-вызовов)
 *
 * После успешной проверки добавляет `req.user = decoded` (id, role, tv).
 */
export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const tokenFromCookie = req.cookies?.token;
  const token = tokenFromCookie || (auth?.startsWith('Bearer ') ? auth.slice(7) : null);

  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Проверяем актуальные данные из БД — токен мог быть выдан до блокировки.
    const user = db.prepare('SELECT id, is_blocked, token_version FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    if (user.is_blocked) return res.status(403).json({ error: 'Аккаунт заблокирован' });

    // Если token_version в БД больше чем в токене — токен устарел.
    // Это происходит при смене пароля или явной инвалидации.
    if ((decoded.tv ?? 0) !== (user.token_version ?? 0)) {
      return res.status(401).json({ error: 'Сессия устарела, войдите снова' });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

/**
 * Middleware для эндпоинтов только для администраторов.
 * Всегда использовать ПОСЛЕ authMiddleware — req.user должен быть установлен.
 */
export function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Только для администраторов' });
  }
  next();
}

/**
 * Инкрементирует token_version пользователя — инвалидирует все его активные сессии.
 * Вызывается при смене пароля или блокировке пользователя.
 */
export function invalidateTokens(userId) {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
}
