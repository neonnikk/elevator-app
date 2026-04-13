/**
 * mask.js — API для маски пользователя.
 * Маска определяет какие лифты/подъезды видит пользователь на вкладке ТО.
 * По умолчанию всё видимо (записи в таблице только для скрытых).
 */

import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../auth.js';

const router = Router();

// Получить все лифты/подъезды из районов пользователя с флагом visible
router.get('/:userId', authMiddleware, adminOnly, (req, res) => {
  const { userId } = req.params;

  // Все здания из районов пользователя
  const buildings = db.prepare(`
    SELECT DISTINCT b.id, b.name, b.address, b.sort_order
    FROM buildings b
    JOIN teams t ON t.district_id = b.district_id
    JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = ? AND b.district_id IS NOT NULL
    ORDER BY b.sort_order, b.name
  `).all(userId);

  // Скрытые элементы для этого пользователя
  const hidden = db.prepare(
    'SELECT elevator_id, entrance_id, building_id FROM user_elevator_mask WHERE user_id = ? AND visible = 0'
  ).all(userId);
  const hiddenElevators = new Set(hidden.filter(r => r.elevator_id).map(r => r.elevator_id));
  const hiddenEntrances = new Set(hidden.filter(r => r.entrance_id && !r.elevator_id).map(r => r.entrance_id));

  const result = buildings.map(b => {
    const entrances = db.prepare(
      'SELECT * FROM entrances WHERE building_id = ? ORDER BY sort_order'
    ).all(b.id);

    const entrancesWithElevators = entrances.map(ent => {
      const elevators = db.prepare(
        'SELECT * FROM elevators WHERE entrance_id = ? ORDER BY sort_order'
      ).all(ent.id);

      if (elevators.length > 0) {
        return {
          ...ent,
          type: 'entrance_with_elevators',
          elevators: elevators.map(el => ({
            ...el,
            visible: !hiddenElevators.has(el.id),
          })),
        };
      } else {
        // Подъезд без лифтов — маскируется на уровне подъезда
        return {
          ...ent,
          type: 'entrance_only',
          elevators: [],
          visible: !hiddenEntrances.has(ent.id),
        };
      }
    });

    return { ...b, entrances: entrancesWithElevators };
  }).sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true, sensitivity: 'base' })
  );

  res.json(result);
});

// Сохранить маску — принимает список скрытых элементов
router.put('/:userId', authMiddleware, adminOnly, (req, res) => {
  const { userId } = req.params;
  // hidden: [{ type: 'elevator'|'entrance', id, building_id }]
  const { hidden = [] } = req.body;

  db.transaction(() => {
    // Удаляем старую маску пользователя
    db.prepare('DELETE FROM user_elevator_mask WHERE user_id = ?').run(userId);

    // Записываем скрытые элементы
    for (const item of hidden) {
      if (item.type === 'elevator' && item.id) {
        db.prepare(
          'INSERT OR IGNORE INTO user_elevator_mask (user_id, elevator_id, building_id, visible) VALUES (?, ?, ?, 0)'
        ).run(userId, item.id, item.building_id);
      } else if (item.type === 'entrance' && item.id) {
        db.prepare(
          'INSERT OR IGNORE INTO user_elevator_mask (user_id, entrance_id, building_id, visible) VALUES (?, ?, ?, 0)'
        ).run(userId, item.id, item.building_id);
      }
    }
  })();

  res.json({ ok: true, hidden: hidden.length });
});

export default router;
