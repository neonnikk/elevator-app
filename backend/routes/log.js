/**
 * log.js — API для просмотра лога событий (только для администратора).
 */

import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../auth.js';

const router = Router();

// Типы событий с читаемыми названиями
export const EVENT_LABELS = {
  login_ok:      'Вход в систему',
  login_fail:    'Неудачная попытка входа',
  logout:        'Выход из системы',
  to_check:      'Отметка ТО ✓',
  to_uncheck:    'Снятие отметки ТО',
  to2_set:       'Установка ТО2',
  to2_unset:     'Снятие ТО2',
  journal_set:   'Установка Журнал',
  journal_unset: 'Снятие Журнал',
  building_edit: 'Изменение здания',
};

// GET /api/log?type=...&from=...&to=...&page=...&limit=...
router.get('/', authMiddleware, adminOnly, (req, res) => {
  const { type, from, to, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const conditions = [];
  const params = [];

  if (type) { conditions.push('event_type = ?'); params.push(type); }
  if (from) { conditions.push('created_at >= ?'); params.push(from); }
  if (to)   { conditions.push('created_at <= ?'); params.push(to + 'T23:59:59Z'); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM app_log ${where}`).get(...params).cnt;
  const rows  = db.prepare(
    `SELECT * FROM app_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, parseInt(limit), offset);

  res.json({ total, page: parseInt(page), limit: parseInt(limit), rows });
});

// GET /api/log/event-types — список типов для фильтра
router.get('/event-types', authMiddleware, adminOnly, (req, res) => {
  res.json(EVENT_LABELS);
});

export default router;
