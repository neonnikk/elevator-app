import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.get('/', authMiddleware, (req, res) => {
  const { userId, status, search, buildingId } = req.query;
  // Пункт 19: пагинация
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  let where = 'WHERE 1=1';
  const params = [];
  if (!user.perm_view_all && user.role !== 'admin') { where += ' AND wr.user_id = ?'; params.push(req.user.id); }
  if (userId)     { where += ' AND wr.user_id = ?';    params.push(userId); }
  if (status)     { where += ' AND wr.status = ?';     params.push(status); }
  if (buildingId) { where += ' AND wr.building_id = ?'; params.push(buildingId); }
  if (search)     { where += ' AND (wr.title LIKE ? OR wr.description LIKE ? OR b.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  const total = db.prepare(
    `SELECT COUNT(*) as cnt FROM work_records wr LEFT JOIN buildings b ON b.id = wr.building_id ${where}`
  ).get(...params).cnt;

  const items = db.prepare(
    `SELECT wr.*, u.display_name as user_name, u.color as user_color, b.name as building_name
     FROM work_records wr
     LEFT JOIN users u ON u.id = wr.user_id
     LEFT JOIN buildings b ON b.id = wr.building_id
     ${where} ORDER BY wr.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
});

router.post('/', authMiddleware,
  validateBody({ title: { required: true, type: 'string', minLength: 1, maxLength: 500 } }),
  (req, res) => {
    const { title, description, building_id, status } = req.body;
    if (status && !['in_progress', 'completed', 'cancelled'].includes(status))
      return res.status(400).json({ error: 'Недопустимый статус' });
    const result = db.prepare(
      'INSERT INTO work_records (title, description, building_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(title.trim(), description || null, building_id || null, req.user.id, status || 'in_progress', new Date().toISOString(), new Date().toISOString());
    res.json(db.prepare(
      `SELECT wr.*, u.display_name as user_name, u.color as user_color, b.name as building_name
       FROM work_records wr LEFT JOIN users u ON u.id = wr.user_id LEFT JOIN buildings b ON b.id = wr.building_id
       WHERE wr.id = ?`
    ).get(result.lastInsertRowid));
  }
);

router.put('/:id', authMiddleware,
  validateBody({ title: { required: true, type: 'string', minLength: 1, maxLength: 500 } }),
  (req, res) => {
    const record = db.prepare('SELECT * FROM work_records WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Не найдено' });
    // Пункт 3: редактировать может только владелец или admin
    const currentUser = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    if (record.user_id !== req.user.id && currentUser.role !== 'admin')
      return res.status(403).json({ error: 'Нет прав редактировать чужую заявку' });
    const { title, description, status } = req.body;
    if (status && !['in_progress', 'completed', 'cancelled'].includes(status))
      return res.status(400).json({ error: 'Недопустимый статус' });
    db.prepare('UPDATE work_records SET title = ?, description = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(title.trim(), description || null, status || record.status, new Date().toISOString(), req.params.id);
    res.json(db.prepare(
      `SELECT wr.*, u.display_name as user_name, u.color as user_color, b.name as building_name
       FROM work_records wr LEFT JOIN users u ON u.id = wr.user_id LEFT JOIN buildings b ON b.id = wr.building_id
       WHERE wr.id = ?`
    ).get(req.params.id));
  }
);

router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  const existing = db.prepare('SELECT id FROM work_records WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Не найдено' });
  db.prepare('DELETE FROM work_records WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
