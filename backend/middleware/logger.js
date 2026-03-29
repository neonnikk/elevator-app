/**
 * logger.js — middleware логирования запросов и ошибок.
 *
 * requestLogger: цветной вывод метода, пути, статуса и времени в консоль.
 * errorHandler:  перехватывает необработанные ошибки Express, пишет в консоль
 *                и в файл LOG_PATH (по умолчанию /data/error.log в volume).
 *
 * Использование:
 *   app.use(requestLogger);  // до роутеров
 *   app.use(errorHandler);   // после всех роутеров и 404-обработчика
 */

// ANSI-коды цветов для разных HTTP-методов
const colors = { GET: '\x1b[36m', POST: '\x1b[32m', PUT: '\x1b[33m', DELETE: '\x1b[31m' };
const reset = '\x1b[0m';

export function requestLogger(req, res, next) {
  const start = Date.now();
  // Слушаем 'finish' — это момент когда ответ полностью отправлен клиенту.
  // Нельзя логировать в начале запроса — статус ещё не известен.
  res.on('finish', () => {
    const color = colors[req.method] || '';
    const ms = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
    console.log(`${color}${req.method}${reset} ${req.path} ${statusColor}${res.statusCode}${reset} ${ms}ms`);
  });
  next();
}

import { appendFileSync } from 'fs';
import { join } from 'path';

const LOG_PATH = process.env.LOG_PATH || '/data/error.log';

function writeErrorLog(entry) {
  try {
    // Пишем одну строку JSON на запись — удобно для парсинга (grep, jq).
    appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  } catch {
    // Если /data недоступна (например при запуске вне Docker) — только консоль.
  }
}

/**
 * Express error handler — четырёхаргументный middleware (обязательно!).
 * Express определяет error handler именно по четырём параметрам (err, req, res, next).
 * Если убрать `next` — Express не будет вызывать этот middleware для ошибок.
 */
export function errorHandler(err, req, res, next) {  // eslint-disable-line no-unused-vars
  const entry = {
    ts:     new Date().toISOString(),
    method: req.method,
    path:   req.path,
    error:  err.message,
    stack:  err.stack,
  };
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  writeErrorLog(entry);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}
