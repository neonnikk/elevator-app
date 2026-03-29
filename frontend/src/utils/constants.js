/**
 * constants.js — общие константы и утилиты для работы с данными.
 *
 * Импортируется во многих компонентах — здесь только чистые данные,
 * без зависимостей от React или API.
 */

// Полные названия месяцев для отображения в заголовках и пикерах
export const MONTHS_RU = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
];

// Сокращённые названия для компактных таблиц и графиков
export const MONTHS_SHORT = [
  'Янв','Фев','Мар','Апр','Май','Июн',
  'Июл','Авг','Сен','Окт','Ноя','Дек'
];

// Человекочитаемые метки статусов задач ТО
export const STATUS_LABELS = {
  pending:     'Ожидает',
  in_progress: 'В процессе',
  completed:   'Выполнено',
  overdue:     'Просрочено',
};

// CSS-переменные цветов для каждого статуса
export const STATUS_COLORS = {
  pending:     'var(--text3)',
  in_progress: 'var(--yellow)',
  completed:   'var(--green)',
  overdue:     'var(--red)',
};

/**
 * Парсит дату из БД корректно.
 *
 * Проблема: SQLite хранит даты как строку '2024-03-15T09:00:00' без Z-суффикса.
 * new Date('2024-03-15T09:00:00') браузер интерпретирует как LOCAL time → +3 часа смещения.
 * new Date('2024-03-15T09:00:00Z') — правильно, UTC.
 *
 * Решение: добавляем Z если суффикс отсутствует.
 * Функция идемпотентна — на строках с Z или +offset ничего не меняет.
 *
 * @param {string|null} s — строка даты из БД
 * @returns {Date|null}
 */
export const parseDate = (s) =>
  s ? new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z') : null;

/**
 * Возвращает скорректированную дату ТО — если due_day попадает на выходной,
 * сдвигает на ближайший рабочий день (суббота→пятница, воскресенье→понедельник).
 */
export function getAdjustedDueDate(dueDay, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const day = Math.min(dueDay, daysInMonth);
  const date = new Date(year, month - 1, day);
  const dow = date.getDay(); // 0=вс, 6=сб
  if (dow !== 0 && dow !== 6) return date;
  const daysBack    = dow === 6 ? 1 : 2; // до пятницы
  const daysForward = dow === 6 ? 2 : 1; // до понедельника
  if (daysBack < daysForward) return new Date(year, month - 1, day - daysBack);
  return new Date(year, month - 1, day + daysForward);
}

export const MONTHS_SHORT_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

export function formatDueDate(date) {
  return `${date.getDate()} ${MONTHS_SHORT_RU[date.getMonth()]}`;
}

/**
 * Возвращает дату ТОСВ — следующий рабочий день после скорректированной даты ТО.
 *
 * Гарантирует что ТОСВ != ТО при любых условиях:
 * - Если ТО пятница → ТОСВ понедельник (не суббота которая вернулась бы к пятнице)
 * - Если ТО конец месяца → ТОСВ первый рабочий день следующего месяца
 */
export function getTosvDate(dueDay, year, month) {
  const toDate = getAdjustedDueDate(dueDay, year, month);
  // Следующий рабочий день: +1 день, пропускаем выходные
  let d = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return d;
}
