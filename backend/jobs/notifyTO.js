/**
 * notifyTO.js — проверка сроков ТО и отправка уведомлений.
 *
 * Вызывается двумя способами:
 *   1. Cron: ежедневно в 09:00 (из server.js)
 *   2. Startup: если сервер запустился после 09:00 (перезапуск контейнера)
 *
 * Логика:
 *   Для каждого здания проверяет задачу ТО на текущий месяц.
 *   Если задача не выполнена и срок истёк (daysLeft < 0) или скоро (daysLeft <= 3) —
 *   добавляет здание в список для уведомления.
 *
 * Два канала уведомлений:
 *   - Telegram глобальный чат (TELEGRAM_CHAT_ID из .env) — сводка по всем зданиям
 *   - Telegram персональный (telegram_chat_id пользователя) — только его здания
 *   - WebSocket push (io.emit) — всем онлайн-клиентам
 *
 * Временная зона:
 *   Intl.DateTimeFormat используется вместо new Date() методов — гарантирует
 *   корректный локальный день независимо от системного TZ Docker-хоста.
 */

import db from '../db.js';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT  = process.env.TELEGRAM_CHAT_ID;

/**
 * Отправляет HTML-сообщение в Telegram.
 * @param {string} text   — текст с HTML-разметкой (<b>, <i>, и т.п.)
 * @param {string} chatId — ID чата (по умолчанию глобальный из .env)
 */
async function sendTelegram(text, chatId = TELEGRAM_CHAT) {
  if (!TELEGRAM_TOKEN || !chatId) return; // Telegram не настроен — тихо пропускаем
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!resp.ok) console.error('[TG] Send error:', await resp.text());
  } catch (e) {
    console.error('[TG] Fetch error:', e.message);
  }
}

/**
 * Основная функция — проверяет все здания и рассылает уведомления.
 * @param {import('socket.io').Server} io — Socket.IO сервер для WebSocket push
 */
export async function checkUpcomingTO(io) {
  // Используем Intl вместо getDate()/getMonth() — они зависят от системного TZ.
  // TZ берётся из process.env.TZ который задаётся в docker-compose через environment.
  const tz = process.env.TZ || 'Europe/Moscow';
  const nowStr = new Intl.DateTimeFormat('ru', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const p = Object.fromEntries(nowStr.map(x => [x.type, parseInt(x.value)]));
  const { year, month, day: today } = p;

  const buildings = db.prepare('SELECT * FROM buildings').all();
  const overdueList = []; // здания с просроченным ТО
  const soonList = [];    // здания у которых срок через 1-3 дня

  for (const b of buildings) {
    // Корректируем дату ТО — если выходной, сдвигаем на ближайший рабочий
    const _rawDay = Math.min(b.due_day, new Date(year, month, 0).getDate());
    const _dow = new Date(year, month - 1, _rawDay).getDay();
    const _adjustedDay = _dow === 6 ? _rawDay - 1 : _dow === 0 ? _rawDay + 1 : _rawDay;
    const daysLeft = _adjustedDay - today;

    // Ищем задачу ТО на текущий месяц
    const task = db.prepare(
      'SELECT * FROM monthly_tasks WHERE building_id = ? AND year = ? AND month = ?'
    ).get(b.id, year, month);

    // Нет задачи или уже выполнена — уведомлять не нужно
    if (!task || task.status === 'completed') continue;

    // Участники всех звеньев района здания — для персональных уведомлений
    const assignedUsers = b.district_id ? db.prepare(`
      SELECT DISTINCT u.id, u.telegram_chat_id
      FROM users u
      JOIN team_members tm ON tm.user_id = u.id
      JOIN teams t ON t.id = tm.team_id
      WHERE t.district_id = ?
    `).all(b.district_id) : [];

    if (daysLeft < 0) {
      overdueList.push({ building: b, daysOverdue: Math.abs(daysLeft), assignedUsers });
    } else if (daysLeft <= 3) {
      soonList.push({ building: b, daysLeft, assignedUsers });
    }
  }

  /**
   * Формирует массив строк сообщения из списков просроченных и скоро истекающих.
   * Ограничивает вывод до 15 зданий каждого типа чтобы не спамить огромными сообщениями.
   */
  const buildLines = (overdue, soon) => {
    const lines = [];
    if (overdue.length) {
      lines.push(`🔴 <b>Просроченное ТО (${overdue.length}):</b>`);
      overdue.slice(0, 15).forEach(({ building, daysOverdue }) =>
        lines.push(`  • ${building.name} — просрочено на ${daysOverdue} дн.`));
      if (overdue.length > 15) lines.push(`  ... и ещё ${overdue.length - 15}`);
    }
    if (soon.length) {
      lines.push(`⚠️ <b>ТО в ближайшие 3 дня (${soon.length}):</b>`);
      soon.slice(0, 15).forEach(({ building, daysLeft }) =>
        lines.push(`  • ${building.name} — через ${daysLeft} дн. (${building.due_day} числа)`));
      if (soon.length > 15) lines.push(`  ... и ещё ${soon.length - 15}`);
    }
    return lines;
  };

  // ── Глобальное уведомление ──────────────────────────────────────────────────
  const globalLines = buildLines(overdueList, soonList);
  if (globalLines.length) {
    const msg = `🔧 <b>ТО Лифтов — ежедневный отчёт</b>\n\n${globalLines.join('\n')}`;
    await sendTelegram(msg);
    console.log(`[NOTIFY] Global: ${overdueList.length} overdue, ${soonList.length} soon`);
  } else {
    console.log('[NOTIFY] All ТО on schedule');
  }

  // ── Персональные уведомления ────────────────────────────────────────────────
  // Каждому исполнителю — только его здания, не дублируем глобальный чат.
  const userChatMap = new Map(); // chatId → { overdue: [], soon: [] }

  const collect = (items, key) => items.forEach(item =>
    item.assignedUsers.forEach(u => {
      if (!u.telegram_chat_id) return;
      if (!userChatMap.has(u.telegram_chat_id))
        userChatMap.set(u.telegram_chat_id, { overdue: [], soon: [] });
      userChatMap.get(u.telegram_chat_id)[key].push(item);
    })
  );
  collect(overdueList, 'overdue');
  collect(soonList, 'soon');

  for (const [chatId, { overdue, soon }] of userChatMap) {
    if (chatId === TELEGRAM_CHAT) continue; // глобальный чат уже получил сводку
    const lines = buildLines(overdue, soon);
    if (!lines.length) continue;
    const msg = `🔧 <b>ТО Лифтов — ваши объекты</b>\n\n${lines.join('\n')}`;
    await sendTelegram(msg, chatId);
  }

  // ── WebSocket push всем онлайн-клиентам ────────────────────────────────────
  // Клиент (TasksPage) показывает всплывающее уведомление при получении этого события.
  if (io && (overdueList.length || soonList.length)) {
    io.emit('to:reminder', {
      overdue: overdueList.length,
      soon:    soonList.length,
      message: `Просрочено: ${overdueList.length}, подходит срок: ${soonList.length}`,
    });
  }
}
