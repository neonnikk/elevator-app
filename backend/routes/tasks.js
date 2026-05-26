import { Router } from 'express';
import { writeLog, getIp } from '../logger.js';
import db from '../db.js';
import { authMiddleware } from '../auth.js';
import { getIO } from '../socket.js';

const router = Router();

/**
 * Возвращает скорректированный день ТО — если попадает на выходной,
 * сдвигает на ближайший рабочий (суббота→пятница, воскресенье→понедельник).
 */
function getAdjustedDueDay(dueDay, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = Math.min(dueDay, daysInMonth);
  const dow = new Date(year, month - 1, day).getDay(); // 0=вс, 6=сб
  if (dow !== 0 && dow !== 6) return day;
  const daysBack    = dow === 6 ? 1 : 2;
  const daysForward = dow === 6 ? 2 : 1;
  return daysBack < daysForward ? day - daysBack : day + daysForward;
}

function getDueDay(buildingId) {
  const b = db.prepare('SELECT due_day FROM buildings WHERE id = ?').get(buildingId);
  return b?.due_day || 15;
}

export function ensureMonthlyTask(buildingId, year, month) {
  const existing = db.prepare(
    'SELECT * FROM monthly_tasks WHERE building_id = ? AND year = ? AND month = ?'
  ).get(buildingId, year, month);
  if (existing) return existing;
  const dueDay = getDueDay(buildingId);
  const adjustedDay = getAdjustedDueDay(dueDay, year, month);
  const dueDate = new Date(year, month - 1, adjustedDay, 23, 59, 59);
  const initialStatus = new Date() > dueDate ? 'overdue' : 'pending';
  const result = db.prepare(
    'INSERT INTO monthly_tasks (building_id, year, month, status) VALUES (?, ?, ?, ?)'
  ).run(buildingId, year, month, initialStatus);
  return db.prepare('SELECT * FROM monthly_tasks WHERE id = ?').get(result.lastInsertRowid);
}

// Вычисляет статус задачи из уже загруженных данных (без доп. запросов к БД)
export function calcStatus(task, completions, entrances, elevatorsByEntrance, dueDay) {
  const adjustedDay = getAdjustedDueDay(dueDay, task.year, task.month);
  const dueDate = new Date(task.year, task.month - 1, adjustedDay, 23, 59, 59);
  const isOverdue = new Date() > dueDate;

  let expectedCount;
  if (!entrances.length) {
    expectedCount = 1;
  } else {
    expectedCount = 0;
    for (const e of entrances) {
      const elvs = elevatorsByEntrance[e.id] || [];
      expectedCount += elvs.length > 1 ? elvs.length : 1;
    }
  }

  const doneCount = completions.filter(c => c.is_completed).length;
  let status = 'pending';
  if (doneCount >= expectedCount) status = 'completed';
  else if (isOverdue) status = 'overdue';
  else if (doneCount > 0) status = 'in_progress';
  return status;
}

// Полный updateTaskStatus для использования из /complete — запрашивает БД сам
export function updateTaskStatus(taskId) {
  const task = db.prepare('SELECT * FROM monthly_tasks WHERE id = ?').get(taskId);
  const completions = db.prepare('SELECT * FROM task_completions WHERE monthly_task_id = ?').all(taskId);
  const dueDay = getDueDay(task.building_id);
  const entrances = db.prepare('SELECT * FROM entrances WHERE building_id = ?').all(task.building_id);
  const elevatorsByEntrance = {};
  for (const e of entrances) {
    elevatorsByEntrance[e.id] = db.prepare('SELECT id FROM elevators WHERE entrance_id = ?').all(e.id);
  }
  const status = calcStatus(task, completions, entrances, elevatorsByEntrance, dueDay);
  db.prepare('UPDATE monthly_tasks SET status = ? WHERE id = ?').run(status, taskId);
  return { ...task, status };
}

router.get('/', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const y = parseInt(req.query.year) || new Date().getFullYear();
  const m = parseInt(req.query.month) || new Date().getMonth() + 1;

  // ИСПРАВЛЕНО: Добавлен LEFT JOIN districts и выборка d.name as districtName
  const buildings = (user.role === 'admin' || user.perm_view_all)
    ? db.prepare(`
        SELECT b.*, d.name as districtName 
        FROM buildings b 
        LEFT JOIN districts d ON b.district_id = d.id
      `).all()
    : db.prepare(`
        SELECT DISTINCT b.*, d.name as districtName 
        FROM buildings b
        JOIN teams t ON t.district_id = b.district_id
        JOIN team_members tm ON tm.team_id = t.id
        LEFT JOIN districts d ON b.district_id = d.id
        WHERE tm.user_id = ? AND b.district_id IS NOT NULL
      `).all(req.user.id);

  // Сортируем в JS с numeric:true — SQLite не умеет числовую сортировку строк
  buildings.sort((a, b) => {
    const od = (a.sort_order || 0) - (b.sort_order || 0);
    if (od !== 0) return od;
    return (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true, sensitivity: 'base' });
  });
  // Пакетная загрузка — избегаем N+1 запросов
  const buildingIds = buildings.map(b => b.id);
  if (!buildingIds.length) return res.json([]);

  const placeholders = buildingIds.map(() => '?').join(',');

  // Загружаем маску пользователя (скрытые лифты/подъезды)
  const maskRows = (user.role !== 'admin' && !user.perm_view_all)
    ? db.prepare('SELECT elevator_id, entrance_id, building_id FROM user_elevator_mask WHERE user_id = ? AND visible = 0').all(req.user.id)
    : [];
  const maskedElevators = new Set(maskRows.filter(r => r.elevator_id).map(r => r.elevator_id));
  const maskedEntrances  = new Set(maskRows.filter(r => r.entrance_id && !r.elevator_id).map(r => r.entrance_id));

  // Создаём задачи для всех зданий если ещё не существуют
  buildings.forEach(b => ensureMonthlyTask(b.id, y, m));

  const tasks = db.prepare(
    `SELECT * FROM monthly_tasks WHERE building_id IN (${placeholders}) AND year = ? AND month = ?`
  ).all(...buildingIds, y, m);

  // Пакетная загрузка отметок выполнения
  const taskIds = tasks.map(t => t.id);
  const taskPlaceholders = taskIds.map(() => '?').join(',');
  const allCompletions = taskIds.length
    ? db.prepare(
        `SELECT tc.*, u.display_name as user_name, u.color as user_color
         FROM task_completions tc LEFT JOIN users u ON u.id = tc.completed_by
         WHERE tc.monthly_task_id IN (${taskPlaceholders})`
      ).all(...taskIds)
    : [];

  // Пакетная загрузка подъездов и лифтов
  const allEntrances = db.prepare(
    `SELECT * FROM entrances WHERE building_id IN (${placeholders}) ORDER BY sort_order`
  ).all(...buildingIds);
  const entranceIds = allEntrances.map(e => e.id);
  const allElevators = entranceIds.length
    ? db.prepare(
        `SELECT * FROM elevators WHERE entrance_id IN (${entranceIds.map(() => '?').join(',')}) ORDER BY sort_order`
      ).all(...entranceIds)
    : [];

  // Загружаем ТО2 для текущего месяца (уровень здания)
  const to2Set = new Set(
    db.prepare(`SELECT building_id FROM task_to2 WHERE year = ? AND month = ? AND building_id IN (${placeholders})`).all(y, m, ...buildingIds).map(r => r.building_id)
  );

  // Загружаем ТО2 на лифты
  const elevTo2Set = new Set(
    db.prepare(`SELECT elevator_id FROM elevator_to2 WHERE year = ? AND month = ? AND building_id IN (${placeholders}) AND elevator_id IS NOT NULL`).all(y, m, ...buildingIds).map(r => r.elevator_id)
  );
  // Загружаем ТО2 на подъезды
  const entTo2Set = new Set(
    db.prepare(`SELECT entrance_id FROM elevator_to2 WHERE year = ? AND month = ? AND building_id IN (${placeholders}) AND entrance_id IS NOT NULL`).all(y, m, ...buildingIds).map(r => r.entrance_id)
  );

  // Загружаем активные журналы для всех лифтов зданий
  const journalSet = entranceIds.length ? new Set(
    db.prepare(`
      SELECT el.id FROM elevator_journal ej
      JOIN elevators el ON el.id = ej.elevator_id
      JOIN entrances ent ON ent.id = el.entrance_id
      WHERE ej.active = 1 AND ent.building_id IN (${placeholders})
    `).all(...buildingIds).map(r => r.id)
  ) : new Set();

  // Загружаем активные журналы подъездов
  const entranceJournalSet = entranceIds.length ? new Set(
    db.prepare(`
      SELECT entrance_id FROM entrance_journal
      WHERE active = 1 AND entrance_id IN (${entranceIds.map(() => '?').join(',')})
    `).all(...entranceIds).map(r => r.entrance_id)
  ) : new Set();

  // Загружаем активные журналы зданий
  const buildingJournalSet = buildingIds.length ? new Set(
    db.prepare(`
      SELECT building_id FROM building_journal
      WHERE active = 1 AND building_id IN (${placeholders})
    `).all(...buildingIds).map(r => r.building_id)
  ) : new Set();

  // Пакетная загрузка участников звеньев районов зданий (вместо building_assignments)
  const allAssignments = buildingIds.length ? db.prepare(
    `SELECT DISTINCT b.id as building_id, u.id, u.display_name, u.color
     FROM buildings b
     JOIN teams t ON t.district_id = b.district_id
     JOIN team_members tm ON tm.team_id = t.id
     JOIN users u ON u.id = tm.user_id
     WHERE b.id IN (${placeholders}) AND b.district_id IS NOT NULL`
  ).all(...buildingIds) : [];

  // Пункт 2: вычисляем статусы батчем без доп. запросов к БД
  // Строим index elevator по entrance_id для быстрого доступа
  const elevatorsByEntrance = {};
  for (const el of allElevators) {
    if (!elevatorsByEntrance[el.entrance_id]) elevatorsByEntrance[el.entrance_id] = [];
    elevatorsByEntrance[el.entrance_id].push(el);
  }

  const result = buildings.map(b => {
    const task = tasks.find(t => t.building_id === b.id);
    if (!task) return null;
    const completions = allCompletions.filter(c => c.monthly_task_id === task.id);
    const entrances = allEntrances.filter(e => e.building_id === b.id);
    const entrancesWithElevators = entrances.map(e => ({ ...e, elevators: elevatorsByEntrance[e.id] || [] }));
    const assignedUsers = allAssignments.filter(a => a.building_id === b.id);

    // Вычисляем и сохраняем статус если изменился (без лишних SELECT)
    const dueDay = b.due_day || 15;
    const newStatus = calcStatus(task, completions, entrances, elevatorsByEntrance, dueDay);
    if (newStatus !== task.status) {
      db.prepare('UPDATE monthly_tasks SET status = ? WHERE id = ?').run(newStatus, task.id);
    }

    // Применяем маску — убираем скрытые лифты/подъезды
    const entrancesFiltered = entrancesWithElevators.map(ent => ({
      ...ent,
      _masked: maskedEntrances.has(ent.id) && (elevatorsByEntrance[ent.id] || []).length === 0,
      elevators: (elevatorsByEntrance[ent.id] || []).filter(el => !maskedElevators.has(el.id)),
    })).filter(ent => {
      // Подъезд без лифтов — скрываем если он в маске
      if ((elevatorsByEntrance[ent.id] || []).length === 0) return !maskedEntrances.has(ent.id);
      // Подъезд с лифтами — скрываем если все лифты скрыты
      const visibleElevs = (elevatorsByEntrance[ent.id] || []).filter(el => !maskedElevators.has(el.id));
      return visibleElevs.length > 0;
    });

    // Если все подъезды скрыты — пропускаем здание
    if (entrancesWithElevators.length > 0 && entrancesFiltered.length === 0) return null;

    // Пересчитываем статус только по видимым лифтам/подъездам — только для ответа
    // В БД сохраняется newStatus (немаскированный) — реальное состояние задачи
    // Пользователю возвращается newStatusMasked — то что он видит с учётом маски
    const elevatorsByEntranceFiltered = {};
    for (const ent of entrancesFiltered) {
      elevatorsByEntranceFiltered[ent.id] = ent.elevators || [];
    }
    const newStatusMasked = calcStatus(task, completions, entrancesFiltered, elevatorsByEntranceFiltered, dueDay);
    // НЕ обновляем БД маскированным статусом — только немаскированный newStatus выше

    // Добавляем to2 и journal статусы в каждую запись
    const hasAnyTo2 = to2Set.has(b.id) ||
      entrancesWithElevators.some(e =>
        entTo2Set.has(e.id) || (e.elevators || []).some(el => elevTo2Set.has(el.id))
      );
    const entrancesWithJournals = entrancesFiltered.map(e => ({
      ...e,
      journal: entranceJournalSet.has(e.id),
      to2: entTo2Set.has(e.id),
      elevators: (e.elevators || []).map(el => ({
        ...el,
        journal: journalSet.has(el.id),
        to2: elevTo2Set.has(el.id),
      })),
    }));

    return {
      ...task,
      status: newStatusMasked,
      building: {
        ...b,
        entrances: entrancesWithJournals,
        assignedUsers,
        journal: buildingJournalSet.has(b.id),
      },
      completions,
      to2: to2Set.has(b.id),
      hasAnyTo2,
    };
  }).filter(Boolean);

  res.json(result);
});

// Сводка по месяцам для графика истории — берём сохранённые статусы, не пересчитываем
// Это важно: calcStatus использует new Date() и все прошлые месяцы получили бы overdue
router.get('/history-summary', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const months = parseInt(req.query.months) || 6;

  // Получаем здания доступные пользователю (через районы/звенья, как в основном GET /)
  let buildingIds;
  if (user.role === 'admin' || user.perm_view_all) {
    buildingIds = db.prepare('SELECT id FROM buildings').all().map(b => b.id);
  } else {
    buildingIds = db.prepare(
      `SELECT DISTINCT b.id FROM buildings b
       JOIN teams t ON t.district_id = b.district_id
       JOIN team_members tm ON tm.team_id = t.id
       WHERE tm.user_id = ? AND b.district_id IS NOT NULL`
    ).all(req.user.id).map(r => r.id);
  }
  if (!buildingIds.length) return res.json([]);

  // Считаем сводку за последние N месяцев
  const now = new Date();
  const result = [];
  for (let i = months - 1; i >= 0; i--) {
    let y = now.getFullYear(), m = now.getMonth() + 1 - i;
    while (m <= 0) { m += 12; y--; }

    const placeholders = buildingIds.map(() => '?').join(',');
    const tasks = db.prepare(
      `SELECT mt.id, mt.status FROM monthly_tasks mt
       WHERE mt.building_id IN (${placeholders}) AND mt.year = ? AND mt.month = ?`
    ).all(...buildingIds, y, m);

    if (!tasks.length) {
      result.push({ year: y, month: m, total: 0, completed: 0, overdue: 0, inProgress: 0, pct: 0, noData: true });
      continue;
    }

    // Проверяем есть ли реальная активность (хоть одна отметка за этот месяц)
    const taskIds = tasks.map(t => t.id);
    const tidPlaceholders = taskIds.map(() => '?').join(',');
    const activityCount = db.prepare(
      `SELECT COUNT(*) as cnt FROM completion_history ch
       JOIN task_completions tc ON tc.id = ch.task_completion_id
       WHERE tc.monthly_task_id IN (${tidPlaceholders})`
    ).get(...taskIds).cnt;

    // Нет ни одной отметки — месяц без реальных данных (задачи созданы автоматически)
    const noData = activityCount === 0 && tasks.every(t => t.status !== 'completed');

    const total     = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const overdue   = noData ? 0 : tasks.filter(t => t.status === 'overdue').length;
    const inProgress= tasks.filter(t => t.status === 'in_progress').length;
    result.push({ year: y, month: m, total: noData ? 0 : total, completed, overdue, inProgress,
      pct: total ? Math.round(completed / total * 100) : 0, noData });
  }
  res.json(result);
});

router.get('/yearly/:buildingId', authMiddleware, (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  res.json(db.prepare('SELECT * FROM monthly_tasks WHERE building_id = ? AND year = ? ORDER BY month')
    .all(req.params.buildingId, year));
});

router.post('/:taskId/complete', authMiddleware, (req, res) => {
  console.log(`[COMPLETE] taskId=${req.params.taskId} by user=${req.user.id} type=${req.body.completion_type}`);
  const { completion_type, elevator_id, entrance_id, building_id, is_completed } = req.body;
  if (!['building', 'entrance', 'elevator'].includes(completion_type))
    return res.status(400).json({ error: 'Неверный тип завершения' });

  const currentUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const completed = is_completed ? 1 : 0;
  const now = new Date().toISOString();

  let existing;
  if (completion_type === 'elevator' && elevator_id) {
    existing = db.prepare('SELECT * FROM task_completions WHERE monthly_task_id = ? AND elevator_id = ? AND completion_type = ?')
      .get(req.params.taskId, elevator_id, 'elevator');
  } else if (completion_type === 'entrance' && entrance_id) {
    existing = db.prepare('SELECT * FROM task_completions WHERE monthly_task_id = ? AND entrance_id = ? AND completion_type = ?')
      .get(req.params.taskId, entrance_id, 'entrance');
  } else {
    existing = db.prepare('SELECT * FROM task_completions WHERE monthly_task_id = ? AND completion_type = ?')
      .get(req.params.taskId, 'building');
  }

  // Пункт 3: оборачиваем в транзакцию — защита от race condition
  const doComplete = db.transaction(() => {
    if (existing) {
      if (!is_completed && existing.completed_by !== req.user.id &&
          currentUser.role !== 'admin' && !currentUser.perm_complete_others)
        throw Object.assign(new Error('Нет прав снимать отметку чужих задач'), { status: 403 });
      db.prepare('UPDATE task_completions SET is_completed = ?, completed_by = ?, completed_at = ? WHERE id = ?')
        .run(completed, is_completed ? req.user.id : null, is_completed ? now : null, existing.id);
      db.prepare('INSERT INTO completion_history (task_completion_id, action, user_id, timestamp) VALUES (?, ?, ?, ?)')
        .run(existing.id, is_completed ? 'checked' : 'unchecked', req.user.id, new Date().toISOString());
    } else {
      let newId;
      if (completion_type === 'elevator') {
        newId = db.prepare('INSERT INTO task_completions (monthly_task_id, elevator_id, completion_type, is_completed, completed_by, completed_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(req.params.taskId, elevator_id, 'elevator', completed, is_completed ? req.user.id : null, is_completed ? now : null).lastInsertRowid;
      } else if (completion_type === 'entrance') {
        newId = db.prepare('INSERT INTO task_completions (monthly_task_id, entrance_id, completion_type, is_completed, completed_by, completed_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(req.params.taskId, entrance_id, 'entrance', completed, is_completed ? req.user.id : null, is_completed ? now : null).lastInsertRowid;
      } else {
        newId = db.prepare('INSERT INTO task_completions (monthly_task_id, building_id, completion_type, is_completed, completed_by, completed_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(req.params.taskId, building_id, 'building', completed, is_completed ? req.user.id : null, is_completed ? now : null).lastInsertRowid;
      }
      db.prepare('INSERT INTO completion_history (task_completion_id, action, user_id, timestamp) VALUES (?, ?, ?, ?)')
        .run(newId, is_completed ? 'checked' : 'unchecked', req.user.id, new Date().toISOString());
    }
  });

  try {
    doComplete();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  // Логируем отметку ТО
  try {
    const logUser = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
    const task = db.prepare('SELECT mt.*, b.name as building_name FROM monthly_tasks mt JOIN buildings b ON b.id = mt.building_id WHERE mt.id = ?').get(req.params.taskId);
    let subject = task?.building_name || `задача #${req.params.taskId}`;
    if (completion_type === 'elevator' && elevator_id) {
      const el = db.prepare('SELECT e.name as el_name, ent.name as ent_name FROM elevators e JOIN entrances ent ON ent.id = e.entrance_id WHERE e.id = ?').get(elevator_id);
      if (el) subject += ` — ${el.ent_name} — ${el.el_name}`;
    } else if (completion_type === 'entrance' && entrance_id) {
      const ent = db.prepare('SELECT name FROM entrances WHERE id = ?').get(entrance_id);
      if (ent) subject += ` — ${ent.name}`;
    }
    const action = is_completed ? 'поставил галку ✓' : 'снял галку';
    writeLog({
      event_type: is_completed ? 'to_check' : 'to_uncheck',
      user_id: req.user.id,
      user_name: logUser?.display_name,
      ip: getIp(req),
      description: `${logUser?.display_name} ${action}: ${subject}`,
      meta: { task_id: req.params.taskId, completion_type, elevator_id, entrance_id, building_id }
    });
  } catch (e) { /* не ломаем основной поток */ }

  updateTaskStatus(req.params.taskId);
  const task = db.prepare('SELECT * FROM monthly_tasks WHERE id = ?').get(req.params.taskId);
  const completions = db.prepare(
    `SELECT tc.*, u.display_name as user_name, u.color as user_color
     FROM task_completions tc LEFT JOIN users u ON u.id = tc.completed_by
     WHERE tc.monthly_task_id = ?`
  ).all(req.params.taskId);

  // Emit to all connected clients — full data, other devices patch without reload
  const io = getIO();
  const connectedClients = io ? io.engine.clientsCount : 0;
  console.log(`[WS] Emitting task:updated taskId=${task.id} status=${task.status} clients=${connectedClients}`);
  if (io) {
    io.emit('task:updated', {
      taskId: task.id,
      buildingId: task.building_id,
      status: task.status,
      completions,
    });
  }

  res.json({ ...task, completions });
});

router.get('/:taskId/history', authMiddleware, (req, res) => {
  res.json(db.prepare(
    `SELECT ch.*, u.display_name as user_name, u.color as user_color,
      tc.completion_type, tc.elevator_id, tc.entrance_id,
      el.name as elevator_name,
      ent.name as entrance_name
     FROM completion_history ch
     JOIN users u ON u.id = ch.user_id
     JOIN task_completions tc ON tc.id = ch.task_completion_id
     LEFT JOIN elevators el ON el.id = tc.elevator_id
     LEFT JOIN entrances ent ON ent.id = COALESCE(tc.entrance_id, el.entrance_id)
     WHERE tc.monthly_task_id = ? ORDER BY ch.timestamp DESC`
  ).all(req.params.taskId).slice(0, 200));
});

export default router;