/**
 * to2journal.js — API для ТО2 и Журнал.
 * Поддерживает журналы на: Лифт, Подъезд (если нет лифтов), Здание (если нет подъездов).
 */

import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

// ── ТО2 (без изменений) ─────────────────────────────────────────────────────

router.get('/to2/:buildingId/:year/:month', authMiddleware, (req, res) => {
  const { buildingId, year, month } = req.params;
  const row = db.prepare(
    'SELECT t.*, u.display_name as user_name FROM task_to2 t LEFT JOIN users u ON u.id = t.set_by WHERE t.building_id = ? AND t.year = ? AND t.month = ?'
  ).get(buildingId, year, month);
  res.json({ active: !!row, data: row || null });
});

router.post('/to2/:buildingId/:year/:month', authMiddleware, (req, res) => {
  const { buildingId, year, month } = req.params;
  const now = new Date().toISOString();
  try {
    // Ставим ТО2 на здание
    const result = db.prepare(
      'INSERT OR IGNORE INTO task_to2 (building_id, year, month, set_by, set_at) VALUES (?, ?, ?, ?, ?)'
    ).run(buildingId, year, month, req.user.id, now);
    if (result.changes > 0) {
      db.prepare(
        'INSERT INTO to2_journal_history (entity_type, entity_id, action, user_id, timestamp, building_id, year, month) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('to2', result.lastInsertRowid, 'set', req.user.id, now, buildingId, year, month);
    }

    // Автоматически ставим ТО2 на все лифты/подъезды здания
    const entrances = db.prepare('SELECT * FROM entrances WHERE building_id = ?').all(buildingId);
    for (const ent of entrances) {
      const elevators = db.prepare('SELECT * FROM elevators WHERE entrance_id = ?').all(ent.id);
      if (elevators.length > 0) {
        for (const el of elevators) {
          db.prepare('INSERT OR IGNORE INTO elevator_to2 (elevator_id, building_id, year, month, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(el.id, buildingId, year, month, req.user.id, now);
        }
      } else {
        db.prepare('INSERT OR IGNORE INTO elevator_to2 (entrance_id, building_id, year, month, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(ent.id, buildingId, year, month, req.user.id, now);
      }
    }
    // Простое здание (без подъездов) — нет подэлементов
    const row = db.prepare('SELECT t.*, u.display_name as user_name FROM task_to2 t LEFT JOIN users u ON u.id = t.set_by WHERE t.building_id = ? AND t.year = ? AND t.month = ?')
      .get(buildingId, year, month);
    res.json({ active: true, data: row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ТО2 на лифт ──────────────────────────────────────────────────────────────

router.post('/to2/elevator/:elevatorId/:year/:month', authMiddleware, (req, res) => {
  const { elevatorId, year, month } = req.params;
  const now = new Date().toISOString();
  const el = db.prepare('SELECT e.*, ent.building_id FROM elevators e JOIN entrances ent ON ent.id = e.entrance_id WHERE e.id = ?').get(elevatorId);
  if (!el) return res.status(404).json({ error: 'Лифт не найден' });
  db.prepare('INSERT OR IGNORE INTO elevator_to2 (elevator_id, building_id, year, month, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(elevatorId, el.building_id, year, month, req.user.id, now);
  res.json({ active: true });
});

router.delete('/to2/elevator/:elevatorId/:year/:month', authMiddleware, (req, res) => {
  const { elevatorId, year, month } = req.params;
  db.prepare('DELETE FROM elevator_to2 WHERE elevator_id = ? AND year = ? AND month = ?').run(elevatorId, year, month);
  res.json({ active: false });
});

// ── ТО2 на подъезд ───────────────────────────────────────────────────────────

router.post('/to2/entrance/:entranceId/:year/:month', authMiddleware, (req, res) => {
  const { entranceId, year, month } = req.params;
  const now = new Date().toISOString();
  const ent = db.prepare('SELECT * FROM entrances WHERE id = ?').get(entranceId);
  if (!ent) return res.status(404).json({ error: 'Подъезд не найден' });
  db.prepare('INSERT OR IGNORE INTO elevator_to2 (entrance_id, building_id, year, month, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(entranceId, ent.building_id, year, month, req.user.id, now);
  res.json({ active: true });
});

router.delete('/to2/entrance/:entranceId/:year/:month', authMiddleware, (req, res) => {
  const { entranceId, year, month } = req.params;
  db.prepare('DELETE FROM elevator_to2 WHERE entrance_id = ? AND year = ? AND month = ?').run(entranceId, year, month);
  res.json({ active: false });
});

router.delete('/to2/:buildingId/:year/:month', authMiddleware, (req, res) => {
  const { buildingId, year, month } = req.params;
  const existing = db.prepare('SELECT * FROM task_to2 WHERE building_id = ? AND year = ? AND month = ?').get(buildingId, year, month);
  if (!existing) return res.json({ active: false });
  db.prepare('DELETE FROM task_to2 WHERE building_id = ? AND year = ? AND month = ?').run(buildingId, year, month);
  db.prepare(
    'INSERT INTO to2_journal_history (entity_type, entity_id, action, user_id, timestamp, building_id, year, month) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('to2', existing.id, 'unset', req.user.id, new Date().toISOString(), buildingId, year, month);
  res.json({ active: false });
});

// ── Журнал (Лифты) ────────────────────────────────────────────────────────────

router.get('/journal/:elevatorId', authMiddleware, (req, res) => {
  const row = db.prepare(
    'SELECT j.*, u.display_name as user_name FROM elevator_journal j LEFT JOIN users u ON u.id = j.set_by WHERE j.elevator_id = ? AND j.active = 1'
  ).get(req.params.elevatorId);
  res.json({ active: !!row, data: row || null });
});

router.post('/journal/:elevatorId', authMiddleware, (req, res) => {
  const { elevatorId } = req.params;
  const now = new Date().toISOString();
  const elevator = db.prepare('SELECT e.*, ent.building_id FROM elevators e JOIN entrances ent ON ent.id = e.entrance_id WHERE e.id = ?').get(elevatorId);
  if (!elevator) return res.status(404).json({ error: 'Лифт не найден' });

  db.prepare(
    'INSERT INTO elevator_journal (elevator_id, active, set_by, set_at) VALUES (?, 1, ?, ?) ON CONFLICT(elevator_id) DO UPDATE SET active = 1, set_by = ?, set_at = ?, unset_by = NULL, unset_at = NULL'
  ).run(elevatorId, req.user.id, now, req.user.id, now);

  const row = db.prepare('SELECT * FROM elevator_journal WHERE elevator_id = ?').get(elevatorId);
  db.prepare(
    'INSERT INTO to2_journal_history (entity_type, entity_id, action, user_id, timestamp, elevator_id, building_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('journal', row.id, 'set', req.user.id, now, elevatorId, elevator.building_id);

  res.json({ active: true, data: row });
});

router.delete('/journal/:elevatorId', authMiddleware, (req, res) => {
  const { elevatorId } = req.params;
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM elevator_journal WHERE elevator_id = ? AND active = 1').get(elevatorId);
  if (!existing) return res.json({ active: false });

  const elevator = db.prepare('SELECT e.*, ent.building_id FROM elevators e JOIN entrances ent ON ent.id = e.entrance_id WHERE e.id = ?').get(elevatorId);

  db.prepare(
    'UPDATE elevator_journal SET active = 0, unset_by = ?, unset_at = ? WHERE elevator_id = ?'
  ).run(req.user.id, now, elevatorId);

  db.prepare(
    'INSERT INTO to2_journal_history (entity_type, entity_id, action, user_id, timestamp, elevator_id, building_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('journal', existing.id, 'unset', req.user.id, now, elevatorId, elevator?.building_id || null);

  res.json({ active: false });
});

// ── Журнал (Подъезды) — НОВОЕ ────────────────────────────────────────────────

router.post('/journal/entrance/:entranceId', authMiddleware, (req, res) => {
  const { entranceId } = req.params;
  const now = new Date().toISOString();
  const entrance = db.prepare('SELECT *, building_id FROM entrances WHERE id = ?').get(entranceId);
  if (!entrance) return res.status(404).json({ error: 'Подъезд не найден' });

  db.prepare(
    `INSERT INTO entrance_journal (entrance_id, active, set_by, set_at) VALUES (?, 1, ?, ?)
     ON CONFLICT(entrance_id) DO UPDATE SET active = 1, set_by = ?, set_at = ?, unset_by = NULL, unset_at = NULL`
  ).run(entranceId, req.user.id, now, req.user.id, now);

  const row = db.prepare('SELECT * FROM entrance_journal WHERE entrance_id = ?').get(entranceId);
  db.prepare(
    'INSERT INTO to2_journal_history (entity_type, entity_id, action, user_id, timestamp, building_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('entrance_journal', row.id, 'set', req.user.id, now, entrance.building_id);

  res.json({ active: true, data: row });
});

router.delete('/journal/entrance/:entranceId', authMiddleware, (req, res) => {
  const { entranceId } = req.params;
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM entrance_journal WHERE entrance_id = ? AND active = 1').get(entranceId);
  
  if (!existing) return res.json({ active: false });

  const entrance = db.prepare('SELECT building_id FROM entrances WHERE id = ?').get(entranceId);

  db.prepare('UPDATE entrance_journal SET active = 0, unset_by = ?, unset_at = ? WHERE entrance_id = ?')
    .run(req.user.id, now, entranceId);

  db.prepare(
    'INSERT INTO to2_journal_history (entity_type, entity_id, action, user_id, timestamp, building_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('entrance_journal', existing.id, 'unset', req.user.id, now, entrance?.building_id || null);

  res.json({ active: false });
});

// ── Журнал (Здание) ──────────────────────────────────────────────────────────

router.post('/journal/building/:buildingId', authMiddleware, (req, res) => {
  const { buildingId } = req.params;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO building_journal (building_id, active, set_by, set_at) VALUES (?, 1, ?, ?)
     ON CONFLICT(building_id) DO UPDATE SET active = 1, set_by = ?, set_at = ?, unset_by = NULL, unset_at = NULL`
  ).run(buildingId, req.user.id, now, req.user.id, now);

  const row = db.prepare('SELECT * FROM building_journal WHERE building_id = ?').get(buildingId);
  db.prepare(
    'INSERT INTO to2_journal_history (entity_type, entity_id, action, user_id, timestamp, building_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('building_journal', row.id, 'set', req.user.id, now, buildingId);

  res.json({ active: true, data: row });
});

router.delete('/journal/building/:buildingId', authMiddleware, (req, res) => {
  const { buildingId } = req.params;
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM building_journal WHERE building_id = ? AND active = 1').get(buildingId);
  
  if (!existing) return res.json({ active: false });

  db.prepare('UPDATE building_journal SET active = 0, unset_by = ?, unset_at = ? WHERE building_id = ?')
    .run(req.user.id, now, buildingId);

  db.prepare(
    'INSERT INTO to2_journal_history (entity_type, entity_id, action, user_id, timestamp, building_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run('building_journal', existing.id, 'unset', req.user.id, now, buildingId);

  res.json({ active: false });
});

// ── Получить все статусы для здания ──────────────────────────────────────────

router.get('/building/:buildingId/:year/:month', authMiddleware, (req, res) => {
  const { buildingId, year, month } = req.params;

  // ТО2 на здание
  const to2 = db.prepare('SELECT t.*, u.display_name as user_name FROM task_to2 t LEFT JOIN users u ON u.id = t.set_by WHERE t.building_id = ? AND t.year = ? AND t.month = ?')
    .get(buildingId, year, month);

  // ТО2 на лифты
  const elevTo2 = db.prepare('SELECT elevator_id FROM elevator_to2 WHERE building_id = ? AND year = ? AND month = ? AND elevator_id IS NOT NULL')
    .all(buildingId, year, month);
  // ТО2 на подъезды
  const entTo2 = db.prepare('SELECT entrance_id FROM elevator_to2 WHERE building_id = ? AND year = ? AND month = ? AND entrance_id IS NOT NULL')
    .all(buildingId, year, month);

  // Журналы лифтов
  const elevJournals = db.prepare(`
    SELECT j.elevator_id, j.active
    FROM elevator_journal j
    JOIN elevators el ON el.id = j.elevator_id
    JOIN entrances ent ON ent.id = el.entrance_id
    WHERE ent.building_id = ? AND j.active = 1
  `).all(buildingId);

  // Журналы подъездов
  const entJournals = db.prepare(`
    SELECT j.entrance_id, j.active
    FROM entrance_journal j
    JOIN entrances ent ON ent.id = j.entrance_id
    WHERE ent.building_id = ? AND j.active = 1
  `).all(buildingId);

  // Журнал здания
  const buildingJournalRow = db.prepare('SELECT * FROM building_journal WHERE building_id = ? AND active = 1').get(buildingId);

  res.json({
    to2: to2 ? { active: true, set_by: to2.user_name, set_at: to2.set_at } : { active: false },
    elevatorTo2: elevTo2.reduce((acc, r) => { acc[r.elevator_id] = true; return acc; }, {}),
    entranceTo2: entTo2.reduce((acc, r) => { acc[r.entrance_id] = true; return acc; }, {}),
    journals: elevJournals.reduce((acc, j) => { acc[j.elevator_id] = true; return acc; }, {}),
    entranceJournals: entJournals.reduce((acc, j) => { acc[j.entrance_id] = true; return acc; }, {}),
    buildingJournal: !!buildingJournalRow,
  });
});

// ── История ──────────────────────────────────────────────────────────────────

router.get('/history/:buildingId/:year/:month', authMiddleware, (req, res) => {
  const { buildingId, year, month } = req.params;
  const history = db.prepare(`
    SELECT h.*, u.display_name as user_name, u.color as user_color,
      el.name as elevator_name, ent.name as entrance_name
    FROM to2_journal_history h
    LEFT JOIN users u ON u.id = h.user_id
    LEFT JOIN elevators el ON el.id = h.elevator_id
    LEFT JOIN entrances ent ON ent.id = h.entrance_id
    WHERE h.building_id = ? AND (
      (h.entity_type = 'to2' AND h.year = ? AND h.month = ?) OR
      h.entity_type = 'journal' OR
      h.entity_type = 'entrance_journal' OR
      h.entity_type = 'building_journal'
    )
    ORDER BY h.timestamp DESC
    LIMIT 100
  `).all(buildingId, year, month);
  res.json(history);
});

export default router;