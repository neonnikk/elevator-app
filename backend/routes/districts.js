import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../auth.js';

const router = Router();

// Middleware: администратор ИЛИ право управления районами
function canManageDistricts(req, res, next) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.role === 'admin' || user.perm_manage_districts) return next();
  return res.status(403).json({ error: 'Нет прав управлять районами' });
}

// ── Районы ──────────────────────────────────────────────────────────────────

// GET /api/districts — список районов (админ — все, пользователь — только свои)
router.get('/', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  let districts;
  if (user.role === 'admin') {
    districts = db.prepare(`
      SELECT d.*,
        COUNT(DISTINCT b.id) as building_count,
        COUNT(DISTINCT t.id) as team_count
      FROM districts d
      LEFT JOIN buildings b ON b.district_id = d.id
      LEFT JOIN teams t ON t.district_id = d.id
      GROUP BY d.id
      ORDER BY d.id
    `).all();
  } else {
    // Пользователь видит только районы где он состоит в звене
    districts = db.prepare(`
      SELECT d.*,
        COUNT(DISTINCT b.id) as building_count,
        COUNT(DISTINCT t.id) as team_count
      FROM districts d
      LEFT JOIN buildings b ON b.district_id = d.id
      LEFT JOIN teams t ON t.district_id = d.id
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ?
      GROUP BY d.id
      ORDER BY d.id
    `).all(req.user.id);
  }
  // Числовая сортировка районов по имени ("Район 2" < "Район 10")
  districts.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true, sensitivity: 'base' }));
  res.json(districts);
});

// POST /api/districts — создать район (только админ)
router.post('/', authMiddleware, canManageDistricts, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  const result = db.prepare(
    'INSERT INTO districts (name, created_at) VALUES (?, ?)'
  ).run(name.trim(), new Date().toISOString());
  res.json(db.prepare('SELECT * FROM districts WHERE id = ?').get(result.lastInsertRowid));
});

// ── Назначение зданий в районы ───────────────────────────────────────────────

// PUT /api/districts/buildings/assign — массовое назначение зданий в район
// Статический маршрут — должен быть ДО динамических /:id
router.put('/buildings/assign', authMiddleware, canManageDistricts, (req, res) => {
  const { buildingIds, districtId } = req.body;
  if (!Array.isArray(buildingIds)) return res.status(400).json({ error: 'buildingIds должен быть массивом' });
  if (districtId && !db.prepare('SELECT id FROM districts WHERE id = ?').get(districtId))
    return res.status(404).json({ error: 'Район не найден' });

  db.transaction(() => {
    for (const bid of buildingIds) {
      db.prepare('UPDATE buildings SET district_id = ? WHERE id = ?').run(districtId || null, bid);
    }
  })();
  res.json({ ok: true, updated: buildingIds.length });
});

// PUT /api/districts/:id — переименовать район
router.put('/:id', authMiddleware, canManageDistricts, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  const d = db.prepare('SELECT * FROM districts WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Район не найден' });
  db.prepare('UPDATE districts SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ ...d, name: name.trim() });
});

// DELETE /api/districts/:id — удалить район
router.delete('/:id', authMiddleware, adminOnly, (req, res) => {
  const d = db.prepare('SELECT * FROM districts WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Район не найден' });
  // Обнуляем district_id у зданий
  db.prepare('UPDATE buildings SET district_id = NULL WHERE district_id = ?').run(req.params.id);
  db.prepare('DELETE FROM districts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});


// ── Звенья ───────────────────────────────────────────────────────────────────

// GET /api/districts/:id/teams — звенья района с участниками
router.get('/:id/teams', authMiddleware, (req, res) => {
  const teams = db.prepare(`
    SELECT t.*, COUNT(tm.user_id) as member_count
    FROM teams t
    LEFT JOIN team_members tm ON tm.team_id = t.id
    WHERE t.district_id = ?
    GROUP BY t.id
    ORDER BY t.id
  `).all(req.params.id);

  const result = teams.map(team => {
    const members = db.prepare(`
      SELECT u.id, u.display_name, u.color, u.is_blocked
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
      ORDER BY u.id
    `).all(team.id);
    // Числовая сортировка участников по имени
    members.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '', 'ru', { numeric: true, sensitivity: 'base' }));
    return { ...team, members };
  });
  // Числовая сортировка звеньев по имени ("Звено 2" < "Звено 10")
  result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true, sensitivity: 'base' }));
  res.json(result);
});

// POST /api/districts/:id/teams — создать звено в районе
router.post('/:id/teams', authMiddleware, canManageDistricts, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  const d = db.prepare('SELECT id FROM districts WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Район не найден' });
  const result = db.prepare(
    'INSERT INTO teams (name, district_id, created_at) VALUES (?, ?, ?)'
  ).run(name.trim(), req.params.id, new Date().toISOString());
  res.json(db.prepare('SELECT * FROM teams WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/districts/teams/:teamId — переименовать звено
router.put('/teams/:teamId', authMiddleware, canManageDistricts, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Название обязательно' });
  const t = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!t) return res.status(404).json({ error: 'Звено не найдено' });
  db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(name.trim(), req.params.teamId);
  res.json({ ...t, name: name.trim() });
});

// DELETE /api/districts/teams/:teamId — удалить звено
router.delete('/teams/:teamId', authMiddleware, adminOnly, (req, res) => {
  const t = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!t) return res.status(404).json({ error: 'Звено не найдено' });
  db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.teamId);
  res.json({ ok: true });
});

// PUT /api/districts/teams/:teamId/members — задать состав звена
router.put('/teams/:teamId/members', authMiddleware, canManageDistricts, (req, res) => {
  const { userIds } = req.body; // массив id
  if (!Array.isArray(userIds)) return res.status(400).json({ error: 'userIds должен быть массивом' });
  const t = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!t) return res.status(404).json({ error: 'Звено не найдено' });

  db.transaction(() => {
    db.prepare('DELETE FROM team_members WHERE team_id = ?').run(req.params.teamId);
    for (const uid of userIds) {
      db.prepare('INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)').run(req.params.teamId, uid);
    }
  })();

  const members = db.prepare(`
    SELECT u.id, u.display_name, u.color, u.is_blocked
    FROM team_members tm JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ? ORDER BY u.id
  `).all(req.params.teamId);
  res.json({ ...t, members });
});

// ── Статистика ───────────────────────────────────────────────────────────────

// GET /api/districts/:id/stats?year=&month=&period=month|year — статистика звена за период
router.get('/:id/stats', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const districtId = parseInt(req.params.id);

  // Проверка доступа: админ и perm_view_stats видят все районы,
  // остальные — только свои (где состоят в звене)
  if (user.role !== 'admin') {
    const memberOf = db.prepare(`
      SELECT d.id FROM districts d
      JOIN teams t ON t.district_id = d.id
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ? AND d.id = ?
    `).get(req.user.id, districtId);
    if (!memberOf) return res.status(403).json({ error: 'Нет доступа' });
  }

  const period = req.query.period || 'month';
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;

  // Звенья района с участниками
  const teams = db.prepare(`
    SELECT t.id, t.name FROM teams t WHERE t.district_id = ? ORDER BY t.id
  `).all(districtId);

  const result = teams.map(team => {
    const members = db.prepare(`
      SELECT u.id, u.display_name, u.color
      FROM team_members tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
    `).all(team.id);

    // Считаем подъезды закрытые каждым участником звена
    // Берём task_completions с completion_type='entrance' is_completed=1
    // из зданий этого района за нужный период
    // periodFilter применяется и к monthly_tasks И к completion_history.timestamp
    // чтобы не учитывать старые checked из прошлых месяцев
    let periodFilter, periodParams;
    if (period === 'year') {
      periodFilter = `AND mt.year = ?
          AND strftime('%Y', ch.timestamp) = ?`;
      periodParams = [year, String(year)];
    } else {
      periodFilter = `AND mt.year = ? AND mt.month = ?
          AND strftime('%Y-%m', ch.timestamp) = ?`;
      periodParams = [year, month, `${year}-${String(month).padStart(2,'0')}`];
    }

    const memberStats = members.map(member => {
      // Считаем через completion_history (action='checked') — учитываем всех кто
      // ставил галочку в данном периоде (не только последнего completed_by).
      // periodFilter по mt.year/month — считаем выполнение задач нужного периода.
      // Фильтруем также по timestamp события чтобы не включать старые checked-события
      // которые были потом сняты и снова поставлены в другом месяце.
      // tc.is_completed = 1 гарантирует что отметка сейчас активна.
      const rows = db.prepare(`
        SELECT COUNT(DISTINCT tc.id) as cnt
        FROM completion_history ch
        JOIN task_completions tc ON tc.id = ch.task_completion_id
        JOIN monthly_tasks mt ON mt.id = tc.monthly_task_id
        JOIN buildings b ON b.id = mt.building_id
        WHERE ch.action = 'checked'
          AND ch.user_id = ?
          AND tc.completion_type = 'entrance'
          AND tc.is_completed = 1
          AND b.district_id = ?
          ${periodFilter}
          AND ch.id = (
            SELECT ch2.id FROM completion_history ch2
            WHERE ch2.task_completion_id = tc.id AND ch2.action = 'checked'
            ORDER BY ch2.timestamp DESC LIMIT 1
          )
      `).get(member.id, districtId, ...periodParams);
      return { ...member, entrances_done: rows.cnt };
    });

    // Итого по звену
    const teamTotal = memberStats.reduce((s, m) => s + m.entrances_done, 0);

    // Процент каждого от общего звена (сумма = 100%)
    const withPct = memberStats.map(m => ({
      ...m,
      pct: teamTotal > 0 ? Math.round(m.entrances_done / teamTotal * 100) : 0,
    }));
    // Корректируем округление чтобы сумма = 100
    if (teamTotal > 0 && withPct.length > 0) {
      const sum = withPct.reduce((s, m) => s + m.pct, 0);
      if (sum !== 100) withPct[0].pct += (100 - sum);
    }

    return { ...team, members: withPct, total_entrances: teamTotal };
  });

  res.json({ district_id: districtId, period, year, month, teams: result });
});

export default router;
