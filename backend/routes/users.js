import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { authMiddleware, adminOnly, invalidateTokens } from '../auth.js';
import { validateBody } from '../middleware/validate.js';
import { safeUser } from './auth.js';

const router = Router();

router.get('/', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.role !== 'admin' && !user.perm_manage_users)
    return res.status(403).json({ error: 'Нет доступа' });
  const users = db.prepare('SELECT * FROM users ORDER BY created_at').all().map(safeUser);
  // Числовая сортировка по отображаемому имени ("Иванов 2" < "Иванов 10")
  users.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '', 'ru', { numeric: true, sensitivity: 'base' }));
  res.json(users);
});

router.post('/', authMiddleware, adminOnly,
  validateBody({
    username:    { required: true, type: 'string', minLength: 2, maxLength: 50 },
    password:    { required: true, type: 'string', minLength: 4 },
    displayName: { required: true, type: 'string', minLength: 1, maxLength: 100 },
  }),
  (req, res) => {
    const { username, password, displayName, color, role, permissions } = req.body;
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (exists) return res.status(400).json({ error: 'Логин уже занят' });
    const hash = bcrypt.hashSync(password, 10);
    const p = permissions || {};
    const result = db.prepare(
      `INSERT INTO users (username, password_hash, display_name, color, role,
        perm_create_tasks, perm_edit_tasks, perm_delete_tasks, perm_assign_users,
        perm_complete_others, perm_view_all, perm_manage_users, perm_edit_due_day, perm_edit_buildings,
        perm_view_stats, perm_comm, perm_manage_districts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      username.trim(), hash, displayName.trim(), color || '#6366F1', role || 'user',
      p.create_tasks ? 1 : 0, p.edit_tasks ? 1 : 0, p.delete_tasks ? 1 : 0,
      p.assign_users ? 1 : 0, p.complete_others ? 1 : 0,
      p.view_all !== false ? 1 : 0, p.manage_users ? 1 : 0, p.edit_due_day ? 1 : 0,
      p.edit_buildings ? 1 : 0, p.view_stats ? 1 : 0, p.comm ? 1 : 0,
      p.manage_districts ? 1 : 0
    );
    res.json(safeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid)));
  }
);

router.put('/:id', authMiddleware, adminOnly, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пользователь не найден' });
  const { displayName, color, role, permissions, is_blocked } = req.body;
  const p = permissions || {};
  db.prepare(
    `UPDATE users SET display_name = ?, color = ?, role = ?, is_blocked = ?,
      perm_create_tasks = ?, perm_edit_tasks = ?, perm_delete_tasks = ?,
      perm_assign_users = ?, perm_complete_others = ?, perm_view_all = ?,
      perm_manage_users = ?, perm_edit_due_day = ?, perm_edit_buildings = ?, perm_view_stats = ?, perm_comm = ?, perm_manage_districts = ? WHERE id = ?`
  ).run(
    displayName || existing.display_name, color || existing.color,
    role || existing.role,
    is_blocked !== undefined ? (is_blocked ? 1 : 0) : existing.is_blocked,
    p.create_tasks  !== undefined ? (p.create_tasks  ? 1 : 0) : existing.perm_create_tasks,
    p.edit_tasks    !== undefined ? (p.edit_tasks    ? 1 : 0) : existing.perm_edit_tasks,
    p.delete_tasks  !== undefined ? (p.delete_tasks  ? 1 : 0) : existing.perm_delete_tasks,
    p.assign_users  !== undefined ? (p.assign_users  ? 1 : 0) : existing.perm_assign_users,
    p.complete_others !== undefined ? (p.complete_others ? 1 : 0) : existing.perm_complete_others,
    p.view_all      !== undefined ? (p.view_all      ? 1 : 0) : existing.perm_view_all,
    p.manage_users  !== undefined ? (p.manage_users  ? 1 : 0) : existing.perm_manage_users,
    p.edit_due_day  !== undefined ? (p.edit_due_day  ? 1 : 0) : existing.perm_edit_due_day,
    p.edit_buildings !== undefined ? (p.edit_buildings ? 1 : 0) : existing.perm_edit_buildings,
    p.view_stats     !== undefined ? (p.view_stats     ? 1 : 0) : existing.perm_view_stats,
    p.comm              !== undefined ? (p.comm              ? 1 : 0) : (existing.perm_comm || 0),
    p.manage_districts  !== undefined ? (p.manage_districts  ? 1 : 0) : (existing.perm_manage_districts || 0),
    req.params.id
  );
  res.json(safeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)));
  // Инвалидируем токены если пользователь заблокирован или роль изменилась
  const wasBlocked = is_blocked !== undefined && is_blocked;
  const roleChanged = role && role !== existing.role;
  if (wasBlocked || roleChanged) invalidateTokens(req.params.id);
});

router.put('/:id/password', authMiddleware, adminOnly,
  validateBody({ newPassword: { required: true, type: 'string', minLength: 4 } }),
  (req, res) => {
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Пользователь не найден' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(req.body.newPassword, 10), req.params.id);
    invalidateTokens(req.params.id);
    res.json({ ok: true });
  }
);

router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Нельзя удалить себя' });
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пользователь не найден' });
  // Пункт 10: soft delete — блокируем и анонимизируем вместо удаления
  // Это сохраняет историю заявок и завершённых ТО
  db.prepare("UPDATE users SET is_blocked = 1, username = 'deleted_' || id, display_name = '[Удалён]', password_hash = '' WHERE id = ?")
    .run(req.params.id);
  db.prepare('DELETE FROM building_assignments WHERE user_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Видимость пунктов меню
router.get('/:id/menu', authMiddleware, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT menu_key, visible FROM user_menu_visibility WHERE user_id = ?').all(req.params.id);
  const vis = {};
  rows.forEach(r => { vis[r.menu_key] = !!r.visible; });
  res.json(vis);
});

router.put('/:id/menu', authMiddleware, adminOnly, (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO user_menu_visibility (user_id, menu_key, visible) VALUES (?, ?, ?)');
  db.transaction(() => {
    Object.entries(req.body).forEach(([k, v]) => stmt.run(req.params.id, k, v ? 1 : 0));
  })();
  const rows = db.prepare('SELECT menu_key, visible FROM user_menu_visibility WHERE user_id = ?').all(req.params.id);
  const vis = {};
  rows.forEach(r => { vis[r.menu_key] = !!r.visible; });
  res.json(vis);
});

export default router;
