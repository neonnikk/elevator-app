import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

function auditLog(buildingId, userId, action, field = null, oldVal = null, newVal = null) {
  try {
    db.prepare(
      'INSERT INTO building_audit_log (building_id, user_id, action, field, old_value, new_value, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(buildingId, userId, action, field,
      oldVal !== null ? String(oldVal) : null,
      newVal !== null ? String(newVal) : null,
      new Date().toISOString());
  } catch (e) { console.error('[AUDIT]', e.message); }
}

function buildingWithDetails(b) {
  const entrances = db.prepare('SELECT * FROM entrances WHERE building_id = ? ORDER BY sort_order').all(b.id);
  // Участники всех звеньев района здания (если район назначен)
  const assignedUsers = b.district_id
    ? db.prepare(`
        SELECT DISTINCT u.id, u.display_name, u.color
        FROM users u
        JOIN team_members tm ON tm.user_id = u.id
        JOIN teams t ON t.id = tm.team_id
        WHERE t.district_id = ?
        ORDER BY u.id
      `).all(b.district_id)
    : [];
  // Звенья района здания (для фильтра на странице ТО)
  const teams = b.district_id
    ? db.prepare('SELECT id, name FROM teams WHERE district_id = ? ORDER BY id').all(b.district_id)
    : [];
  // Название района
  const districtRow = b.district_id
    ? db.prepare('SELECT name FROM districts WHERE id = ?').get(b.district_id)
    : null;
  return {
    ...b,
    entrances: entrances.map(e => ({
      ...e,
      elevators: db.prepare('SELECT * FROM elevators WHERE entrance_id = ? ORDER BY sort_order').all(e.id),
    })),
    assignedUsers,
    teams,
    districtName: districtRow?.name || null,
  };
}

// Middleware: администратор ИЛИ право perm_edit_buildings
function canEditBuildings(req, res, next) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.role === 'admin' || user.perm_edit_buildings) return next();
  return res.status(403).json({ error: 'Нет доступа' });
}


// Middleware: администратор ИЛИ право perm_delete_tasks (удаление зданий)
function canDeleteBuildings(req, res, next) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.role === 'admin' || user.perm_delete_tasks) return next();
  return res.status(403).json({ error: 'Нет прав удалять объекты' });
}

router.get('/', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const raw = (user.role === 'admin' || user.perm_view_all)
    ? db.prepare('SELECT * FROM buildings').all()
    : db.prepare(
        `SELECT DISTINCT b.* FROM buildings b
         JOIN teams t ON t.district_id = b.district_id
         JOIN team_members tm ON tm.team_id = t.id
         WHERE tm.user_id = ? AND b.district_id IS NOT NULL`
      ).all(req.user.id);
  // Сортируем в JS: сначала по sort_order, затем по имени с numeric:true
  // (SQLite сортирует строки лексикографически — "ул. 10" < "ул. 2")
  const buildings = raw.sort((a, b) => {
    const od = (a.sort_order || 0) - (b.sort_order || 0);
    if (od !== 0) return od;
    return (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true, sensitivity: 'base' });
  });
  res.json(buildings.map(buildingWithDetails));
});

router.post('/', authMiddleware, canEditBuildings,
  validateBody({
    name:    { required: true, type: 'string', minLength: 1, maxLength: 200 },
    address: { required: true, type: 'string', minLength: 1, maxLength: 300 },
    due_day: { type: 'number', min: 1, max: 31 },
  }),
  (req, res) => {
    const { name, address, description, due_day, entrances } = req.body;
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM buildings').get().m || 0;
    const result = db.prepare(
      'INSERT INTO buildings (name, address, description, due_day, sort_order) VALUES (?, ?, ?, ?, ?)'
    ).run(name.trim(), address.trim(), description || null, due_day || 15, maxOrder + 1);
    const buildingId = result.lastInsertRowid;
    if (Array.isArray(entrances)) {
      entrances.forEach((ent, ei) => {
        const entResult = db.prepare('INSERT INTO entrances (building_id, name, sort_order) VALUES (?, ?, ?)')
          .run(buildingId, ent.name, ei);
        if (ent.elevators?.length > 1) {
          ent.elevators.forEach((elev, li) => {
            db.prepare('INSERT INTO elevators (entrance_id, name, sort_order) VALUES (?, ?, ?)')
              .run(entResult.lastInsertRowid, elev.name, li);
          });
        }
      });
    }
    const newBuilding = buildingWithDetails(db.prepare('SELECT * FROM buildings WHERE id = ?').get(buildingId));
    auditLog(buildingId, req.user.id, 'create', 'building', null, name.trim());
    res.json(newBuilding);
  }
);

router.put('/:id', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
  if (!building) return res.status(404).json({ error: 'Не найдено' });

  // Полное редактирование: администратор или perm_edit_buildings
  if (user.role === 'admin' || user.perm_edit_buildings) {
    const { name, address, description, due_day } = req.body;
    if (due_day !== undefined && (parseInt(due_day) < 1 || parseInt(due_day) > 31))
      return res.status(400).json({ error: 'День ТО должен быть от 1 до 31' });
    for (const [f, oldV, newV] of [
      ['name', building.name, name], ['address', building.address, address],
      ['due_day', building.due_day, due_day],
    ]) {
      if (newV !== undefined && String(newV) !== String(oldV))
        auditLog(req.params.id, req.user.id, 'update', f, oldV, newV);
    }
    db.prepare('UPDATE buildings SET name = ?, address = ?, description = ?, due_day = ? WHERE id = ?').run(
      name ?? building.name, address ?? building.address,
      description ?? building.description, due_day ?? building.due_day, req.params.id
    );
    return res.json(db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id));
  }

  // Только день ТО: право perm_edit_due_day
  if (user.perm_edit_due_day) {
    const due_day = parseInt(req.body.due_day);
    if (isNaN(due_day) || due_day < 1 || due_day > 31)
      return res.status(400).json({ error: 'День ТО должен быть от 1 до 31' });
    auditLog(req.params.id, req.user.id, 'update', 'due_day', building.due_day, due_day);
    db.prepare('UPDATE buildings SET due_day = ? WHERE id = ?').run(due_day, req.params.id);
    return res.json(db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id));
  }

  return res.status(403).json({ error: 'Нет доступа' });
});

router.delete('/:id', authMiddleware, canDeleteBuildings, (req, res) => {
  const existing = db.prepare('SELECT id, name FROM buildings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Не найдено' });
  auditLog(req.params.id, req.user.id, 'delete', 'building', existing.name, null);
  db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Подъезды
router.post('/:id/entrances', authMiddleware, canEditBuildings,
  validateBody({ name: { required: true, type: 'string', maxLength: 100 } }),
  (req, res) => {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM entrances WHERE building_id = ?').get(req.params.id).m || 0;
    const result = db.prepare('INSERT INTO entrances (building_id, name, sort_order) VALUES (?, ?, ?)')
      .run(req.params.id, req.body.name, maxOrder + 1);
    res.json(db.prepare('SELECT * FROM entrances WHERE id = ?').get(result.lastInsertRowid));
  }
);

router.put('/entrances/:id', authMiddleware, canEditBuildings, (req, res) => {
  const existing = db.prepare('SELECT id FROM entrances WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Не найдено' });
  db.prepare('UPDATE entrances SET name = ? WHERE id = ?').run(req.body.name, req.params.id);
  res.json(db.prepare('SELECT * FROM entrances WHERE id = ?').get(req.params.id));
});

router.delete('/entrances/:id', authMiddleware, canEditBuildings, (req, res) => {
  db.prepare('DELETE FROM entrances WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Лифты
router.post('/entrances/:id/elevators', authMiddleware, canEditBuildings,
  validateBody({ name: { required: true, type: 'string', maxLength: 100 } }),
  (req, res) => {
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM elevators WHERE entrance_id = ?').get(req.params.id).m || 0;
    const result = db.prepare('INSERT INTO elevators (entrance_id, name, sort_order) VALUES (?, ?, ?)')
      .run(req.params.id, req.body.name, maxOrder + 1);
    res.json(db.prepare('SELECT * FROM elevators WHERE id = ?').get(result.lastInsertRowid));
  }
);

router.put('/elevators/:id', authMiddleware, canEditBuildings, (req, res) => {
  db.prepare('UPDATE elevators SET name = ? WHERE id = ?').run(req.body.name, req.params.id);
  res.json(db.prepare('SELECT * FROM elevators WHERE id = ?').get(req.params.id));
});

router.delete('/elevators/:id', authMiddleware, canEditBuildings, (req, res) => {
  db.prepare('DELETE FROM elevators WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Назначения исполнителей
router.get('/:id/audit', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.role !== 'admin' && !user.perm_edit_buildings) return res.status(403).json({ error: 'Нет доступа' });
  const log = db.prepare(
    `SELECT al.*, u.display_name as user_name FROM building_audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.building_id = ? ORDER BY al.ts DESC LIMIT 100`
  ).all(req.params.id);
  res.json(log);
});


// Информация по лифтам
router.get('/:id/info', authMiddleware, (req, res) => {
  const rows = db.prepare(
    `SELECT ei.*, u.display_name as updated_by_name FROM elevator_info ei
     LEFT JOIN users u ON u.id = ei.updated_by WHERE ei.building_id = ?`
  ).all(req.params.id);
  res.json(rows);
});

router.put('/:id/info', authMiddleware, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Ожидается массив' });
  const stmt = db.prepare(
    `INSERT INTO elevator_info (building_id, entrance_id, elevator_id, info_text, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(building_id, entrance_id, elevator_id) DO UPDATE SET
       info_text = excluded.info_text, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  );
  db.transaction(() => {
    req.body.forEach(item => stmt.run(req.params.id, item.entrance_id || null, item.elevator_id || null, item.info_text || '', req.user.id));
  })();
  const rows = db.prepare(
    `SELECT ei.*, u.display_name as updated_by_name FROM elevator_info ei
     LEFT JOIN users u ON u.id = ei.updated_by WHERE ei.building_id = ?`
  ).all(req.params.id);
  res.json(rows);
});

export default router;
