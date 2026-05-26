/**
 * logger.js — утилита записи событий в app_log.
 * Используется из роутеров auth.js, tasks.js, to2journal.js, buildings.js
 */

import db from './db.js';

/**
 * Типы событий:
 *   login_ok       — успешный вход
 *   login_fail     — неудачная попытка (подбор пароля)
 *   logout         — выход
 *   to_check       — отметка ТО (галочка)
 *   to_uncheck     — снятие отметки ТО
 *   to2_set        — установка ТО2
 *   to2_unset      — снятие ТО2
 *   journal_set    — установка Журнал
 *   journal_unset  — снятие Журнал
 *   building_edit  — изменение здания
 */

export function writeLog({ event_type, user_id = null, user_name = null, ip = null, description, meta = null }) {
  try {
    db.prepare(
      'INSERT INTO app_log (event_type, user_id, user_name, ip, description, meta) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      event_type,
      user_id || null,
      user_name || null,
      ip || null,
      description,
      meta ? JSON.stringify(meta) : null
    );
  } catch (e) {
    // Логирование не должно ломать основной поток
    console.error('[logger] ошибка записи:', e.message);
  }
}

// Получить IP из запроса (учитывая reverse proxy)
export function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null;
}
