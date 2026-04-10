import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { generateToken, authMiddleware, invalidateTokens } from '../auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

// Cookie настройки.
// sameSite: 'lax' работает и по HTTP и по HTTPS через reverse proxy.
// secure включается только когда запрос пришёл по HTTPS (заголовок X-Forwarded-Proto от NPM).
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
};

function cookieOpts(req) {
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  return { ...COOKIE_OPTS, secure: isHttps };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Слишком много попыток входа. Подождите 15 минут.',
});

function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

router.get('/setup-needed', (req, res) => {
  const adminCount = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE role = ?').get('admin');
  res.json({ needed: adminCount.cnt === 0 });
});

router.post('/setup',
  validateBody({
    username:    { required: true, type: 'string', minLength: 2, maxLength: 50 },
    password:    { required: true, type: 'string', minLength: 4 },
    displayName: { required: true, type: 'string', minLength: 1, maxLength: 100 },
  }),
  (req, res) => {
    const adminCount = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE role = ?').get('admin');
    if (adminCount.cnt > 0) return res.status(400).json({ error: 'Администратор уже создан' });
    const { username, password, displayName } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      `INSERT INTO users (username, password_hash, display_name, color, role,
        perm_create_tasks, perm_edit_tasks, perm_delete_tasks, perm_assign_users,
        perm_complete_others, perm_view_all, perm_manage_users)
       VALUES (?, ?, ?, ?, 'admin', 1, 1, 1, 1, 1, 1, 1)`
    ).run(username.trim(), hash, displayName.trim(), '#6366F1');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user);
    res.cookie('token', token, cookieOpts(req));
    res.json({ token, user: safeUser(user) });
  }
);

router.post('/login',
  loginLimiter,
  validateBody({
    username: { required: true, type: 'string' },
    password: { required: true, type: 'string' },
  }),
  (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    if (user.is_blocked) return res.status(403).json({ error: 'Аккаунт заблокирован' });
    const token = generateToken(user);
    res.cookie('token', token, cookieOpts(req));
    res.json({ token, user: safeUser(user) });
  }
);

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(safeUser(user));
});

router.put('/me', authMiddleware,
  validateBody({
    displayName:    { required: true, type: 'string', minLength: 1, maxLength: 100 },
    color:          { type: 'string', maxLength: 20 },
    telegramChatId: { type: 'string', maxLength: 50 },
  }),
  (req, res) => {
    const { displayName, color, telegramChatId, prefShowElevatorInfo, prefShowRecords, prefInfoFontSize, prefInfoColor } = req.body;
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    db.prepare(
      'UPDATE users SET display_name = ?, color = ?, telegram_chat_id = ?, pref_show_elevator_info = ?, pref_show_records = ?, pref_info_font_size = ?, pref_info_color = ? WHERE id = ?'
    ).run(
      displayName.trim(),
      color || '#6366F1',
      telegramChatId !== undefined ? (telegramChatId.trim() || null) : existing.telegram_chat_id,
      prefShowElevatorInfo !== undefined ? (prefShowElevatorInfo ? 1 : 0) : (existing.pref_show_elevator_info || 0),
      prefShowRecords !== undefined ? (prefShowRecords ? 1 : 0) : (existing.pref_show_records || 0),
      prefInfoFontSize !== undefined ? Math.min(18, Math.max(9, parseInt(prefInfoFontSize) || 11)) : (existing.pref_info_font_size || 11),
      prefInfoColor !== undefined ? (prefInfoColor.trim() || "var(--text2)") : (existing.pref_info_color || "var(--text2)"),
      req.user.id
    );
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(safeUser(user));
  }
);

router.put('/me/password', authMiddleware,
  validateBody({
    oldPassword: { required: true, type: 'string' },
    newPassword: { required: true, type: 'string', minLength: 4 },
  }),
  (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Неверный текущий пароль' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(newPassword, 10), req.user.id);
    // Инвалидируем старые токены — требуем повторный вход
    invalidateTokens(req.user.id);
    res.clearCookie('token');
    res.json({ ok: true, relogin: true });
  }
);

router.get('/me/menu', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT menu_key, visible FROM user_menu_visibility WHERE user_id = ?').all(req.user.id);
  const vis = {};
  rows.forEach(r => { vis[r.menu_key] = !!r.visible; });
  res.json(vis);
});

export default router;
export { safeUser };
