/**
 * server.js — точка входа бэкенда.
 *
 * Поднимает Express-приложение поверх HTTP-сервера (нужно для Socket.IO),
 * регистрирует middleware и роутеры, настраивает cron-задачу уведомлений.
 *
 * Порт берётся из PORT (внутри Docker = 3015).
 * Внешний порт (APP_PORT) определяется в docker-compose.yml.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import { setIO } from './socket.js';
import db from './db.js';
import { requestLogger, errorHandler } from './middleware/logger.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import buildingsRouter from './routes/buildings.js';
import tasksRouter from './routes/tasks.js';
import recordsRouter from './routes/records.js';
import settingsRouter from './routes/settings.js';
import districtsRouter from './routes/districts.js';
import commRouter from './routes/comm.js';
import to2JournalRouter from './routes/to2journal.js';
import maskRouter from './routes/mask.js';

const app = express();

// HTTP-сервер создаётся вручную — Socket.IO должен слушать тот же порт что и Express.
// Если создать io отдельно, WebSocket-хендшейк не попадёт в Express middleware.
const httpServer = createServer(app);

// ── Socket.IO ────────────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: { origin: '*' },
  // Увеличенные таймауты для стабильной работы через Nginx Proxy Manager.
  // NPM иногда держит соединение дольше обычного — стандартные 5с/20с не хватает.
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Регистрируем singleton чтобы другие модули (notifyTO.js) могли рассылать события
// без прямого импорта сервера.
setIO(io);

const WS_JWT_SECRET = process.env.JWT_SECRET || 'elevator-maintenance-secret-2024';

// Middleware аутентификации WebSocket-соединений.
// Выполняется один раз при подключении, до события 'connection'.
io.use((socket, next) => {
  // Пробуем токен из httpOnly cookie (браузер отправляет автоматически),
  // иначе берём из socket.handshake.auth (fallback для случаев без cookie).
  const cookieHeader = socket.handshake.headers.cookie || '';
  const cookieToken = cookieHeader.split(';').map(s => s.trim())
    .find(s => s.startsWith('token='))?.slice(6);
  const authToken = socket.handshake.auth?.token;
  const token = cookieToken || authToken;

  if (!token) return next(new Error('Не авторизован'));
  try {
    const decoded = jwt.verify(token, WS_JWT_SECRET);
    // Дополнительная проверка — пользователь может быть заблокирован уже после выдачи токена.
    const user = db.prepare('SELECT id, is_blocked FROM users WHERE id = ?').get(decoded.id);
    if (!user || user.is_blocked) return next(new Error('Доступ запрещён'));
    socket.data.userId = decoded.id;
    next();
  } catch {
    next(new Error('Недействительный токен'));
  }
});

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id} user:${socket.data.userId}`);
  socket.on('disconnect', () => console.log(`[WS] Disconnected: ${socket.id}`));
});

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: true,      // зеркалим Origin — работает с любым доменом без явного списка
  credentials: true, // разрешаем cookie в CORS-запросах (нужно для httpOnly token)
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// ── Routes ───────────────────────────────────────────────────────────────────

app.use('/api', authRouter);           // /login, /logout, /me, /setup — аутентификация
app.use('/api/users', usersRouter);
app.use('/api/buildings', buildingsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/records', recordsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/districts', districtsRouter);
app.use('/api/comm', commRouter);
app.use('/api/to2journal', to2JournalRouter);
app.use('/api/mask', maskRouter);

// ── Health check ─────────────────────────────────────────────────────────────
// Используется docker-compose healthcheck — backend считается готовым только
// когда этот endpoint возвращает 200. Frontend-контейнер ждёт healthy-статуса.

app.get('/health', (_req, res) => {
  try {
    const buildings = db.prepare('SELECT COUNT(*) as cnt FROM buildings').get().cnt;
    const users     = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    const tasks     = db.prepare('SELECT COUNT(*) as cnt FROM monthly_tasks').get().cnt;
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()),
      time: new Date().toISOString(), buildings, users, tasks, version: '6.0.0' });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

// ── 404 / Error ──────────────────────────────────────────────────────────────

app.use((_req, res) => res.status(404).json({ error: 'Маршрут не найден' }));
app.use(errorHandler);

// ── Cron: ежедневная проверка сроков ТО в 09:00 по TZ ────────────────────────
// node-cron использует системный TZ контейнера (задаётся через env TZ в docker-compose).

cron.schedule('0 9 * * *', async () => {
  console.log('[CRON] Checking upcoming ТО deadlines...');
  try {
    const { checkUpcomingTO } = await import('./jobs/notifyTO.js');
    await checkUpcomingTO(io);
  } catch (e) {
    console.error('[CRON] Error:', e.message);
  }
});

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3015;
httpServer.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  // Если контейнер перезапустился после 09:00 (например после обновления),
  // немедленно запускаем проверку — иначе уведомления за сегодня пропадут.
  const now = new Date();
  if (now.getHours() >= 9) {
    console.log('[STARTUP] After 09:00 — running ТО check...');
    try {
      const { checkUpcomingTO } = await import('./jobs/notifyTO.js');
      await checkUpcomingTO(io);
    } catch (e) {
      console.error('[STARTUP] Notify error:', e.message);
    }
  }
});
