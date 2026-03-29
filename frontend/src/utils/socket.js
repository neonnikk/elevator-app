/**
 * socket.js — Socket.IO клиент с автоматическим переподключением.
 *
 * Singleton: импортируется один раз, переиспользуется во всём приложении.
 * Компоненты подписываются на события через socket.on() и отписываются в cleanup.
 *
 * Аутентификация:
 *   1. withCredentials: true — браузер отправит httpOnly cookie при WS-хендшейке
 *   2. auth.token — fallback для случаев когда cookie недоступен (редко)
 *
 * Переподключение:
 *   - reconnectionAttempts: Infinity — переподключаемся бесконечно
 *   - При выходе телефона из фона (visibilitychange) — явный reconnect
 *   - При восстановлении сети (online event) — явный reconnect
 */

import { io } from 'socket.io-client';

const token = localStorage.getItem('token');

const socket = io({
  // Не указываем path явно — Socket.IO использует /socket.io/ по умолчанию.
  // nginx проксирует /socket.io/ → backend. Явная передача path иногда
  // добавляет двойной слэш и конфликтует с nginx upstream.
  transports: ['websocket', 'polling'], // WebSocket предпочтительнее, polling — fallback
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,        // первый retry через 1с
  reconnectionDelayMax: 10000,    // максимальная пауза между retry — 10с
  timeout: 20000,
  forceNew: false,
  autoConnect: true,
  withCredentials: true,          // отправить cookie при хендшейке
  auth: token ? { token } : {},   // fallback токен
});

socket.on('connect',       () => console.log('[WS] Connected:', socket.id));
socket.on('disconnect',    (r) => console.log('[WS] Disconnected:', r));
socket.on('connect_error', (e) => console.warn('[WS] Error:', e.message));

// Телефоны замораживают вкладки в фоне — WebSocket соединение рвётся.
// При возврате в активный таб явно инициируем переподключение.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket.connected) {
    console.log('[WS] Tab visible — reconnecting');
    socket.connect();
  }
});

// При восстановлении сети (WiFi → LTE, выход из тоннеля и т.п.)
window.addEventListener('online', () => {
  if (!socket.connected) {
    console.log('[WS] Network online — reconnecting');
    socket.connect();
  }
});

export default socket;
