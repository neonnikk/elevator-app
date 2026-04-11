/**
 * db.js — единственное подключение к SQLite.
 *
 * Экспортирует singleton `db` (better-sqlite3 Database).
 * Все остальные модули импортируют этот объект — соединение открывается один раз.
 *
 * При старте автоматически:
 *   1. Создаёт все таблицы (IF NOT EXISTS — безопасно на существующей БД)
 *   2. Прогоняет ALTER TABLE миграции (ошибки игнорируются если колонка уже есть)
 *   3. Запускает runMigrations() — сложные миграции с проверкой состояния
 *
 * Временны́е метки:
 *   Все поля *_at хранятся в ISO 8601 UTC с Z-суффиксом.
 *   SQLite datetime('now') возвращает UTC без Z — браузер парсит это как локальное время.
 *   Решение: явно передавать new Date().toISOString() из Node.js при INSERT/UPDATE,
 *   а для DEFAULT значений использовать strftime('%Y-%m-%dT%H:%M:%SZ','now').
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DB_PATH || '/data/elevator.db';

// Создаём директорию если не существует (актуально при первом запуске с bind mount).
try { mkdirSync(dirname(DB_PATH), { recursive: true }); } catch {}

const db = new Database(DB_PATH);

// WAL (Write-Ahead Logging) — позволяет читать БД во время записи.
// Критично для производительности при одновременных запросах нескольких пользователей.
db.pragma('journal_mode = WAL');

// Включаем каскадные удаления и проверку ссылочной целостности.
// SQLite по умолчанию игнорирует REFERENCES — нужно явно включать.
db.pragma('foreign_keys = ON');

// ── Схема БД ─────────────────────────────────────────────────────────────────
// Все CREATE TABLE используют IF NOT EXISTS — безопасно запускать повторно.

db.exec(`
  -- Пользователи системы. Роль 'admin' даёт полный доступ.
  -- perm_* флаги позволяют давать частичные права пользователям без роли admin.
  -- token_version используется для мгновенной инвалидации всех сессий пользователя.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    is_blocked INTEGER NOT NULL DEFAULT 0,
    token_version INTEGER NOT NULL DEFAULT 0,
    telegram_chat_id TEXT,
    perm_create_tasks INTEGER NOT NULL DEFAULT 0,
    perm_edit_tasks INTEGER NOT NULL DEFAULT 0,
    perm_delete_tasks INTEGER NOT NULL DEFAULT 0,
    perm_assign_users INTEGER NOT NULL DEFAULT 0,
    perm_complete_others INTEGER NOT NULL DEFAULT 0,
    perm_view_all INTEGER NOT NULL DEFAULT 1,
    perm_manage_users INTEGER NOT NULL DEFAULT 0,
    push_notifications INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Здания (адреса обслуживания). due_day — день месяца до которого нужно сделать ТО.
  -- district_id добавляется через миграцию (ALTER TABLE) — может быть NULL.
  CREATE TABLE IF NOT EXISTS buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    description TEXT,
    due_day INTEGER NOT NULL DEFAULT 15,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Подъезды здания. Каскадное удаление: удаление здания удаляет все подъезды.
  CREATE TABLE IF NOT EXISTS entrances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Подъезд 1',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  -- Лифты подъезда. Каскадное удаление: удаление подъезда удаляет все лифты.
  CREATE TABLE IF NOT EXISTS elevators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrance_id INTEGER NOT NULL REFERENCES entrances(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Лифт 1',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  -- Назначение работников на здания. Определяет кто видит здание при perm_view_all=0.
  CREATE TABLE IF NOT EXISTS building_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(building_id, user_id)
  );

  -- Задача ТО на конкретный месяц для конкретного здания.
  -- UNIQUE(building_id, year, month) — одна задача на здание в месяц.
  -- Статусы: pending → in_progress → completed | overdue
  CREATE TABLE IF NOT EXISTS monthly_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'overdue')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(building_id, year, month)
  );

  -- Отметка выполнения на уровне лифта, подъезда или всего здания.
  -- completion_type определяет гранулярность: 'building' (всё здание), 
  -- 'entrance' (подъезд), 'elevator' (конкретный лифт).
  -- Для записи без лифтов используется entrance-уровень.
  CREATE TABLE IF NOT EXISTS task_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monthly_task_id INTEGER NOT NULL REFERENCES monthly_tasks(id) ON DELETE CASCADE,
    elevator_id INTEGER REFERENCES elevators(id) ON DELETE CASCADE,
    entrance_id INTEGER REFERENCES entrances(id) ON DELETE CASCADE,
    building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
    completion_type TEXT NOT NULL DEFAULT 'building' CHECK(completion_type IN ('building', 'entrance', 'elevator')),
    is_completed INTEGER NOT NULL DEFAULT 0,
    completed_by INTEGER REFERENCES users(id),
    completed_at TEXT,
    UNIQUE(monthly_task_id, elevator_id, entrance_id, building_id, completion_type)
  );

  -- Полная история каждого изменения отметки (checked/unchecked).
  -- Используется для страницы истории задачи и статистики.
  CREATE TABLE IF NOT EXISTS completion_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_completion_id INTEGER NOT NULL REFERENCES task_completions(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK(action IN ('checked', 'unchecked')),
    user_id INTEGER NOT NULL REFERENCES users(id),
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Заявки на разовые работы (аварийный ремонт, замена деталей и т.п.)
  CREATE TABLE IF NOT EXISTS work_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    building_id INTEGER REFERENCES buildings(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Настройки приложения в формате key-value.
  -- Ключи: menu_label_*, district_label, telegram_bot_token, telegram_chat_id.
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Дополнительная текстовая информация по лифту/подъезду/зданию
  -- (серийный номер, дата последнего капремонта и т.п.)
  CREATE TABLE IF NOT EXISTS elevator_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    entrance_id INTEGER REFERENCES entrances(id) ON DELETE CASCADE,
    elevator_id INTEGER REFERENCES elevators(id) ON DELETE CASCADE,
    info_text TEXT NOT NULL DEFAULT '',
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(building_id, entrance_id, elevator_id)
  );

  -- Персональные настройки видимости пунктов меню для каждого пользователя.
  -- Администратор может скрыть ненужные разделы для конкретного работника.
  CREATE TABLE IF NOT EXISTS user_menu_visibility (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    menu_key TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(user_id, menu_key)
  );

  -- Журнал изменений зданий: кто, когда и что изменил.
  -- Записывается при любом редактировании через BuildingsPage.
  CREATE TABLE IF NOT EXISTS building_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Районы — группы зданий для организации по территориальному признаку.
  -- Название "Район" можно изменить в настройках (district_label в app_settings).
  CREATE TABLE IF NOT EXISTS districts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Звенья (бригады) — группы работников внутри района.
  -- Каждое звено принадлежит одному району.
  -- Удаление района удаляет все его звенья (CASCADE).
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Состав звена. Один работник может быть в нескольких звеньях.
  CREATE TABLE IF NOT EXISTS team_members (
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY(team_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_building_audit_building ON building_audit_log(building_id);
  CREATE INDEX IF NOT EXISTS idx_teams_district ON teams(district_id);
  CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
  CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

  -- ── Связь (диспетчерская система) ──────────────────────────────────────────

  -- Диспетчерские пульты (ДПУЛ КЛ 96, ДПУЛ ДЗЕР 7 ...)
  CREATE TABLE IF NOT EXISTS dispatch_centers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Линии/VPN (Линия 1, VPN 2 ...) принадлежат пульту
  CREATE TABLE IF NOT EXISTS vpn_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dispatch_center_id INTEGER NOT NULL REFERENCES dispatch_centers(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(name, dispatch_center_id)
  );

  -- Концентраторы (IP + адрес установки) принадлежат линии
  CREATE TABLE IF NOT EXISTS concentrators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    address TEXT,
    vpn_line_id INTEGER NOT NULL REFERENCES vpn_lines(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  -- Блоки связи — привязаны к лифту и концентратору
  -- block_number уникален в рамках концентратора И в рамках линии (проверяется в бэкенде)
  CREATE TABLE IF NOT EXISTS comm_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    block_number INTEGER NOT NULL CHECK(block_number >= 0 AND block_number <= 64),
    concentrator_id INTEGER NOT NULL REFERENCES concentrators(id) ON DELETE CASCADE,
    elevator_id INTEGER REFERENCES elevators(id) ON DELETE SET NULL,
    entrance_id INTEGER REFERENCES entrances(id) ON DELETE SET NULL,
    building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
    lift_type TEXT,
    block_type TEXT,
    registrar TEXT,
    camera TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(block_number, concentrator_id)
  );

  CREATE INDEX IF NOT EXISTS idx_vpn_lines_dispatch ON vpn_lines(dispatch_center_id);
  CREATE INDEX IF NOT EXISTS idx_concentrators_line ON concentrators(vpn_line_id);
  CREATE INDEX IF NOT EXISTS idx_comm_blocks_concentrator ON comm_blocks(concentrator_id);
  CREATE INDEX IF NOT EXISTS idx_comm_blocks_building ON comm_blocks(building_id);
  CREATE INDEX IF NOT EXISTS idx_comm_blocks_elevator ON comm_blocks(elevator_id);

  -- ── ТО2 и Журнал ────────────────────────────────────────────────────────────

  -- ТО2 — разовая отметка на здание за конкретный месяц (не переносится)
  CREATE TABLE IF NOT EXISTS task_to2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    set_by INTEGER REFERENCES users(id),
    set_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(building_id, year, month)
  );

  -- Журнал — постоянный статус на лифт (переносится автоматически пока не снят)
  CREATE TABLE IF NOT EXISTS elevator_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    elevator_id INTEGER NOT NULL UNIQUE REFERENCES elevators(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1,
    set_by INTEGER REFERENCES users(id),
    set_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    unset_by INTEGER REFERENCES users(id),
    unset_at TEXT
  );

  -- Журнал для подъездов (если в доме нет лифтов)
  CREATE TABLE IF NOT EXISTS entrance_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrance_id INTEGER NOT NULL UNIQUE REFERENCES entrances(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1,
    set_by INTEGER REFERENCES users(id),
    set_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    unset_by INTEGER REFERENCES users(id),
    unset_at TEXT
  );

  -- Журнал для зданий (если нет ни подъездов, ни лифтов)
  CREATE TABLE IF NOT EXISTS building_journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    building_id INTEGER NOT NULL UNIQUE REFERENCES buildings(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1,
    set_by INTEGER REFERENCES users(id),
    set_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    unset_by INTEGER REFERENCES users(id),
    unset_at TEXT
  );

  -- История событий ТО2 и Журнал
  CREATE TABLE IF NOT EXISTS to2_journal_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('to2', 'journal', 'entrance_journal', 'building_journal')),
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('set', 'unset')),
    user_id INTEGER REFERENCES users(id),
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    building_id INTEGER REFERENCES buildings(id),
    elevator_id INTEGER REFERENCES elevators(id),
    entrance_id INTEGER REFERENCES entrances(id),
    year INTEGER,
    month INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_task_to2_building ON task_to2(building_id, year, month);

  -- ТО2 на уровне лифта/подъезда за конкретный месяц (не переносится)
  CREATE TABLE IF NOT EXISTS elevator_to2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    elevator_id INTEGER REFERENCES elevators(id) ON DELETE CASCADE,
    entrance_id INTEGER REFERENCES entrances(id) ON DELETE CASCADE,
    building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    set_by INTEGER REFERENCES users(id),
    set_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    CHECK((elevator_id IS NOT NULL) OR (entrance_id IS NOT NULL))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_elevator_to2_elev ON elevator_to2(elevator_id, year, month) WHERE elevator_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_elevator_to2_ent ON elevator_to2(entrance_id, year, month) WHERE entrance_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_elevator_to2_building ON elevator_to2(building_id, year, month);
  CREATE INDEX IF NOT EXISTS idx_elevator_journal_elevator ON elevator_journal(elevator_id);
  CREATE INDEX IF NOT EXISTS idx_to2_journal_history ON to2_journal_history(entity_type, entity_id);

  -- Индексы производительности — покрывают самые частые запросы
  CREATE INDEX IF NOT EXISTS idx_monthly_tasks_building_year_month ON monthly_tasks(building_id, year, month);
  CREATE INDEX IF NOT EXISTS idx_task_completions_task ON task_completions(monthly_task_id);
  CREATE INDEX IF NOT EXISTS idx_completion_history_completion ON completion_history(task_completion_id);
  CREATE INDEX IF NOT EXISTS idx_building_assignments_user ON building_assignments(user_id);
  CREATE INDEX IF NOT EXISTS idx_building_assignments_building ON building_assignments(building_id);
  CREATE INDEX IF NOT EXISTS idx_work_records_building ON work_records(building_id);
  CREATE INDEX IF NOT EXISTS idx_work_records_user ON work_records(user_id);
  CREATE INDEX IF NOT EXISTS idx_work_records_status ON work_records(status);
  CREATE INDEX IF NOT EXISTS idx_work_records_created_at ON work_records(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_entrances_building ON entrances(building_id);
  CREATE INDEX IF NOT EXISTS idx_elevators_entrance ON elevators(entrance_id);
  CREATE INDEX IF NOT EXISTS idx_completion_history_timestamp ON completion_history(timestamp);
`);

// ── Простые миграции (ALTER TABLE) ────────────────────────────────────────────
// Безопасно запускать на уже развёрнутой БД — ошибка "duplicate column" игнорируется.
// Порядок важен: новые миграции добавлять В КОНЕЦ массива.

const migrations = [
  "ALTER TABLE users ADD COLUMN perm_edit_due_day INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN perm_edit_buildings INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN perm_view_stats INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE buildings ADD COLUMN district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL",
  "ALTER TABLE users ADD COLUMN perm_comm INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN perm_manage_districts INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE to2_journal_history ADD COLUMN entrance_id INTEGER REFERENCES entrances(id)",
  "ALTER TABLE users ADD COLUMN pref_show_elevator_info INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN pref_show_records INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN pref_info_font_size INTEGER NOT NULL DEFAULT 11",
  "ALTER TABLE users ADD COLUMN pref_info_color TEXT NOT NULL DEFAULT 'var(--text2)'",
];
for (const sql of migrations) {
  try { db.prepare(sql).run(); } catch (_) { /* колонка уже существует — это нормально */ }
}

// ── Сложные миграции (с проверкой состояния) ──────────────────────────────────

function runMigrations() {
  // Добавляем telegram_chat_id только если отсутствует
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes('telegram_chat_id')) {
    db.prepare("ALTER TABLE users ADD COLUMN telegram_chat_id TEXT").run();
    console.log('[DB] Migration: added users.telegram_chat_id');
  }

  // Исправляем временны́е метки без Z-суффикса (исторический баг — SQLite возвращал UTC без Z,
  // браузер интерпретировал как локальное время → смещение +3 часа для Europe/Moscow).
  // WHERE NOT LIKE '%Z' AND NOT LIKE '%+%' — идемпотентно, повторный запуск безвреден.
  const tables = [
    { table: 'building_audit_log',  cols: ['ts'] },
    { table: 'completion_history',  cols: ['timestamp'] },
    { table: 'work_records',        cols: ['created_at', 'updated_at'] },
    { table: 'monthly_tasks',       cols: ['created_at'] },
    { table: 'users',               cols: ['created_at'] },
    { table: 'buildings',           cols: ['created_at'] },
  ];
  db.transaction(() => {
    for (const { table, cols } of tables) {
      for (const col of cols) {
        const count = db.prepare(
          `UPDATE ${table} SET ${col} = ${col} || 'Z'
           WHERE ${col} NOT LIKE '%Z' AND ${col} NOT LIKE '%+%' AND ${col} IS NOT NULL`
        ).run().changes;
        if (count > 0) console.log(`[DB] TZ fix: ${count} rows in ${table}.${col}`);
      }
    }
  })();

  // ── МИГРАЦИЯ: Исправить CHECK constraint на to2_journal_history.entity_type ─────
  // Проблема: старая версия БД могла иметь CHECK без 'entrance_journal' и 'building_journal'.
  // SQLite не позволяет изменить CHECK constraint — нужно пересоздать таблицу.
  (function migrateTo2JournalHistory() {
    try {
      // Получаем SQL создания таблицы
      const tableInfo = db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='to2_journal_history'"
      ).get();
      
      // Если таблица существует и в её SQL нет 'entrance_journal' — нужна миграция
      if (tableInfo && tableInfo.sql && !tableInfo.sql.includes("'entrance_journal'")) {
        console.log('[DB] Migration: rebuilding to2_journal_history with extended CHECK constraint');
        
        db.transaction(() => {
          // 1. Создаём новую таблицу с правильным CHECK constraint
          db.exec(`
            CREATE TABLE to2_journal_history_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              entity_type TEXT NOT NULL CHECK(entity_type IN ('to2', 'journal', 'entrance_journal', 'building_journal')),
              entity_id INTEGER NOT NULL,
              action TEXT NOT NULL CHECK(action IN ('set', 'unset')),
              user_id INTEGER REFERENCES users(id),
              timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
              building_id INTEGER REFERENCES buildings(id),
              elevator_id INTEGER REFERENCES elevators(id),
              entrance_id INTEGER REFERENCES entrances(id),
              year INTEGER,
              month INTEGER
            )
          `);
          
          // 2. Копируем все данные из старой таблицы
          db.exec(`
            INSERT INTO to2_journal_history_new 
            SELECT id, entity_type, entity_id, action, user_id, timestamp, building_id, elevator_id, entrance_id, year, month
            FROM to2_journal_history
          `);
          
          // 3. Удаляем старую таблицу
          db.exec('DROP TABLE to2_journal_history');
          
          // 4. Переименовываем новую таблицу
          db.exec('ALTER TABLE to2_journal_history_new RENAME TO to2_journal_history');
          
          // 5. Восстанавливаем индекс
          db.exec('CREATE INDEX idx_to2_journal_history ON to2_journal_history(entity_type, entity_id)');
        })();
        
        console.log('[DB] Migration: to2_journal_history rebuilt successfully');
      }
    } catch (e) {
      console.error('[DB] Migration error (to2_journal_history):', e.message);
    }
  })();
}

runMigrations();

export default db;
