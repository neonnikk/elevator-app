/**
 * comm.js — API для системы диспетчерской связи лифтов.
 *
 * Иерархия: Пульт → Линия/VPN → Концентратор → Блок → Лифт
 *
 * Права:
 *   perm_comm — видеть и редактировать данные связи
 *   admin — полный доступ
 */

import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../auth.js';

const router = Router();

// Middleware: проверка прав на связь
function canComm(req, res, next) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.role === 'admin' || user.perm_comm) return next();
  return res.status(403).json({ error: 'Нет доступа к разделу Связь' });
}

// ── Список зданий с признаком наличия данных связи ──────────────────────────

router.get('/buildings', authMiddleware, canComm, (req, res) => {
  const buildings = db.prepare(`
    SELECT b.*,
      COUNT(DISTINCT cb.id) as comm_count
    FROM buildings b
    LEFT JOIN comm_blocks cb ON cb.building_id = b.id
    GROUP BY b.id
    ORDER BY b.sort_order, b.name
  `).all();

  // Числовая сортировка по имени
  buildings.sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true, sensitivity: 'base' })
  );
  res.json(buildings);
});

// ── Полная информация по зданию (иерархия для модалки) ───────────────────────

router.get('/buildings/:id', authMiddleware, canComm, (req, res) => {
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
  if (!building) return res.status(404).json({ error: 'Здание не найдено' });

  // Все подъезды и лифты здания
  const entrances = db.prepare('SELECT * FROM entrances WHERE building_id = ? ORDER BY sort_order').all(building.id);
  for (const ent of entrances) {
    ent.elevators = db.prepare('SELECT * FROM elevators WHERE entrance_id = ? ORDER BY sort_order').all(ent.id);
  }

  // Все блоки связи здания с полной иерархией вверх
  const blocks = db.prepare(`
    SELECT
      cb.*,
      con.ip as concentrator_ip,
      con.address as concentrator_address,
      vl.id as vpn_line_id,
      vl.name as vpn_line_name,
      dc.id as dispatch_center_id,
      dc.name as dispatch_center_name,
      e.name as elevator_name,
      ent.name as entrance_name
    FROM comm_blocks cb
    JOIN concentrators con ON con.id = cb.concentrator_id
    JOIN vpn_lines vl ON vl.id = con.vpn_line_id
    JOIN dispatch_centers dc ON dc.id = vl.dispatch_center_id
    LEFT JOIN elevators e ON e.id = cb.elevator_id
    LEFT JOIN entrances ent ON ent.id = cb.entrance_id
    WHERE cb.building_id = ?
    ORDER BY dc.name, vl.name, cb.block_number
  `).all(building.id);

  res.json({ ...building, entrances, blocks });
});

// ── Пульты ───────────────────────────────────────────────────────────────────

router.get('/dispatch-centers', authMiddleware, canComm, (req, res) => {
  const centers = db.prepare('SELECT * FROM dispatch_centers ORDER BY name').all();
  for (const dc of centers) {
    dc.lines = db.prepare('SELECT * FROM vpn_lines WHERE dispatch_center_id = ? ORDER BY name').all(dc.id);
    for (const line of dc.lines) {
      line.concentrators = db.prepare('SELECT * FROM concentrators WHERE vpn_line_id = ? ORDER BY ip').all(line.id);
    }
  }
  res.json(centers);
});

router.post('/dispatch-centers', authMiddleware, canComm, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  const exists = db.prepare('SELECT id FROM dispatch_centers WHERE name = ?').get(name.trim());
  if (exists) return res.status(400).json({ error: 'Пульт с таким названием уже существует' });
  const result = db.prepare('INSERT INTO dispatch_centers (name) VALUES (?)').run(name.trim());
  res.json(db.prepare('SELECT * FROM dispatch_centers WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/dispatch-centers/:id', authMiddleware, canComm, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  const dc = db.prepare('SELECT * FROM dispatch_centers WHERE id = ?').get(req.params.id);
  if (!dc) return res.status(404).json({ error: 'Пульт не найден' });
  db.prepare('UPDATE dispatch_centers SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ ...dc, name: name.trim() });
});

router.delete('/dispatch-centers/:id', authMiddleware, adminOnly, (req, res) => {
  db.prepare('DELETE FROM dispatch_centers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Линии/VPN ─────────────────────────────────────────────────────────────────

router.post('/lines', authMiddleware, canComm, (req, res) => {
  const { name, dispatch_center_id } = req.body;
  if (!name?.trim() || !dispatch_center_id) return res.status(400).json({ error: 'Название и пульт обязательны' });
  const result = db.prepare('INSERT INTO vpn_lines (name, dispatch_center_id) VALUES (?, ?)').run(name.trim(), dispatch_center_id);
  res.json(db.prepare('SELECT * FROM vpn_lines WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/lines/:id', authMiddleware, canComm, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  const line = db.prepare('SELECT * FROM vpn_lines WHERE id = ?').get(req.params.id);
  if (!line) return res.status(404).json({ error: 'Линия не найдена' });
  db.prepare('UPDATE vpn_lines SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ ...line, name: name.trim() });
});

router.delete('/lines/:id', authMiddleware, adminOnly, (req, res) => {
  db.prepare('DELETE FROM vpn_lines WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Концентраторы ─────────────────────────────────────────────────────────────

router.post('/concentrators', authMiddleware, canComm, (req, res) => {
  const { ip, address, vpn_line_id } = req.body;
  if (!ip?.trim() || !vpn_line_id) return res.status(400).json({ error: 'IP и линия обязательны' });
  const result = db.prepare('INSERT INTO concentrators (ip, address, vpn_line_id) VALUES (?, ?, ?)').run(ip.trim(), address?.trim() || null, vpn_line_id);
  res.json(db.prepare('SELECT * FROM concentrators WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/concentrators/:id', authMiddleware, canComm, (req, res) => {
  const { ip, address } = req.body;
  if (!ip?.trim()) return res.status(400).json({ error: 'IP обязателен' });
  const con = db.prepare('SELECT * FROM concentrators WHERE id = ?').get(req.params.id);
  if (!con) return res.status(404).json({ error: 'Концентратор не найден' });
  db.prepare('UPDATE concentrators SET ip = ?, address = ? WHERE id = ?').run(ip.trim(), address?.trim() || null, req.params.id);
  res.json({ ...con, ip: ip.trim(), address: address?.trim() || null });
});

router.delete('/concentrators/:id', authMiddleware, adminOnly, (req, res) => {
  db.prepare('DELETE FROM concentrators WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Блоки связи ───────────────────────────────────────────────────────────────

router.post('/blocks', authMiddleware, canComm, (req, res) => {
  const { block_number, concentrator_id, elevator_id, entrance_id, building_id,
    lift_type, block_type, registrar, camera, notes } = req.body;

  if (block_number === undefined || block_number === null || !concentrator_id || !building_id)
    return res.status(400).json({ error: 'Номер блока, концентратор и здание обязательны' });

  const num = parseInt(block_number);
  if (isNaN(num) || num < 0 || num > 64)
    return res.status(400).json({ error: 'Номер блока должен быть от 0 до 64' });

  // Проверка уникальности в рамках концентратора
  const dupCon = db.prepare('SELECT id FROM comm_blocks WHERE block_number = ? AND concentrator_id = ?').get(num, concentrator_id);
  if (dupCon) return res.status(400).json({ error: `Блок №${num} уже существует в этом концентраторе` });

  // Проверка уникальности в рамках линии
  const con = db.prepare('SELECT vpn_line_id FROM concentrators WHERE id = ?').get(concentrator_id);
  const dupLine = db.prepare(`
    SELECT cb.id FROM comm_blocks cb
    JOIN concentrators c ON c.id = cb.concentrator_id
    WHERE cb.block_number = ? AND c.vpn_line_id = ?
  `).get(num, con.vpn_line_id);
  if (dupLine) return res.status(400).json({ error: `Блок №${num} уже существует в этой линии` });

  const result = db.prepare(`
    INSERT INTO comm_blocks (block_number, concentrator_id, elevator_id, entrance_id, building_id,
      lift_type, block_type, registrar, camera, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(num, concentrator_id, elevator_id || null, entrance_id || null, building_id,
    lift_type || null, block_type || null, registrar || null, camera || null, notes || null);

  res.json(db.prepare('SELECT * FROM comm_blocks WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/blocks/:id', authMiddleware, canComm, (req, res) => {
  const block = db.prepare('SELECT * FROM comm_blocks WHERE id = ?').get(req.params.id);
  if (!block) return res.status(404).json({ error: 'Блок не найден' });

  const { block_number, concentrator_id, elevator_id, entrance_id,
    lift_type, block_type, registrar, camera, notes } = req.body;

  const num = parseInt(block_number);
  if (isNaN(num) || num < 0 || num > 64)
    return res.status(400).json({ error: 'Номер блока должен быть от 0 до 64' });

  const conId = concentrator_id || block.concentrator_id;

  // Проверка уникальности в рамках концентратора (исключаем текущий блок)
  const dupCon = db.prepare('SELECT id FROM comm_blocks WHERE block_number = ? AND concentrator_id = ? AND id != ?').get(num, conId, block.id);
  if (dupCon) return res.status(400).json({ error: `Блок №${num} уже существует в этом концентраторе` });

  // Проверка уникальности в рамках линии
  const con = db.prepare('SELECT vpn_line_id FROM concentrators WHERE id = ?').get(conId);
  const dupLine = db.prepare(`
    SELECT cb.id FROM comm_blocks cb
    JOIN concentrators c ON c.id = cb.concentrator_id
    WHERE cb.block_number = ? AND c.vpn_line_id = ? AND cb.id != ?
  `).get(num, con.vpn_line_id, block.id);
  if (dupLine) return res.status(400).json({ error: `Блок №${num} уже существует в этой линии` });

  db.prepare(`
    UPDATE comm_blocks SET block_number = ?, concentrator_id = ?,
      elevator_id = ?, entrance_id = ?,
      lift_type = ?, block_type = ?, registrar = ?, camera = ?, notes = ?
    WHERE id = ?
  `).run(num, conId, elevator_id || null, entrance_id || null,
    lift_type || null, block_type || null, registrar || null, camera || null, notes || null,
    block.id);

  res.json(db.prepare('SELECT * FROM comm_blocks WHERE id = ?').get(block.id));
});

router.delete('/blocks/:id', authMiddleware, canComm, (req, res) => {
  db.prepare('DELETE FROM comm_blocks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Автодополнение — уникальные значения поля для быстрого ввода ─────────────

const AUTOCOMPLETE_FIELDS = ['lift_type', 'block_type', 'registrar', 'camera'];

router.get('/autocomplete/:field', authMiddleware, canComm, (req, res) => {
  const field = req.params.field;
  if (!AUTOCOMPLETE_FIELDS.includes(field))
    return res.status(400).json({ error: 'Недопустимое поле' });
  const rows = db.prepare(
    `SELECT DISTINCT ${field} as value FROM comm_blocks WHERE ${field} IS NOT NULL AND ${field} != '' ORDER BY ${field}`
  ).all().map(r => r.value);
  res.json(rows);
});

export default router;
