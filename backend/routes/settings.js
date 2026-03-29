import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, adminOnly } from '../auth.js';

const router = Router();

router.get('/', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// Пункт 5: разрешённые ключи настроек — предотвращаем мусор в таблице
const ALLOWED_SETTINGS_PREFIXES = ['menu_label_'];
const ALLOWED_SETTINGS_KEYS = ['telegram_bot_token', 'telegram_chat_id', 'district_label'];

function isAllowedKey(key) {
  return ALLOWED_SETTINGS_KEYS.includes(key) ||
    ALLOWED_SETTINGS_PREFIXES.some(p => key.startsWith(p));
}

router.put('/', authMiddleware, adminOnly, (req, res) => {
  if (typeof req.body !== 'object' || Array.isArray(req.body))
    return res.status(400).json({ error: 'Ожидается объект' });
  const invalidKeys = Object.keys(req.body).filter(k => !isAllowedKey(k));
  if (invalidKeys.length)
    return res.status(400).json({ error: `Недопустимые ключи: ${invalidKeys.join(', ')}` });
  const stmt = db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
  db.transaction(() => Object.entries(req.body).forEach(([k, v]) => stmt.run(k, String(v))))();
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// Тест Telegram-уведомления (только для администратора)
router.post('/test-telegram', authMiddleware, adminOnly, async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat  = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID не заданы в .env' });
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: '✅ Тест уведомлений ТО Лифтов — всё работает!' }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(400).json({ error: data.description || 'Ошибка Telegram' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ручной запуск проверки ТО прямо сейчас (только для администратора)
router.post('/notify-now', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { getIO } = await import('../socket.js');
    const { checkUpcomingTO } = await import('../jobs/notifyTO.js');
    await checkUpcomingTO(getIO());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
