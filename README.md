# ТО Лифтов

Веб-приложение для учёта планового технического обслуживания лифтов.
Отслеживает статусы ТО по зданиям, подъездам и лифтам, управляет бригадами и районами, отправляет уведомления в Telegram.

---

## Возможности

- **Ежемесячные задачи ТО** — создание, отметка выполнения по каждому лифту/подъезду, история изменений
- **Календарь** — обзор всех зданий по месяцам с цветовой индикацией статусов
- **Дашборд** — гистограмма выполнения за последние 6 месяцев
- **Районы и звенья** — группировка зданий по районам, формирование бригад с назначением участников
- **Статистика** — количество обслуженных подъездов по каждому работнику за месяц/год
- **Заявки** — учёт разовых работ по объектам
- **Уведомления** — Telegram (глобальный чат + персональные) и push через WebSocket
- **Права доступа** — гибкая система разрешений для каждого пользователя
- **PWA** — устанавливается на телефон как приложение

---

## Стек технологий

| Слой | Технология |
|---|---|
| Backend | Node.js 20, Express 4 |
| База данных | SQLite (better-sqlite3), WAL-режим |
| Real-time | Socket.IO |
| Планировщик | node-cron |
| Frontend | React 18, Vite |
| Стили | Собственный CSS (CSS-переменные, тёмная/светлая темы) |
| Инфраструктура | Docker, Docker Compose, nginx |
| Reverse proxy | Nginx Proxy Manager |

---

## Быстрый старт (деплой с нуля)

### Требования

- Docker Engine + Docker Compose v2
- Nginx Proxy Manager (или любой reverse proxy с поддержкой WebSocket)
- Домен с SSL-сертификатом (нужен для установки PWA на телефон)

### 1. Скопировать архив на сервер

```bash
mkdir -p /docker-compose/lifttest/elevator-app
cd /docker-compose/lifttest/elevator-app
tar -xzf elevator-audit-v4.tar.gz --strip-components=1
```

### 2. Настроить переменные окружения

```bash
cp .env.example .env
nano .env
```

Минимальная конфигурация:

```env
APP_PORT=3017
JWT_SECRET=замените-на-случайную-строку-минимум-32-символа
TZ=Europe/Moscow
```

Полный список переменных:

| Переменная | Описание | Пример |
|---|---|---|
| `APP_PORT` | Внешний порт приложения | `3017` |
| `DATA_PATH` | Путь к папке с БД и логами | `./data` |
| `BACKUP_PATH` | Путь к папке с бэкапами | `./backups` |
| `JWT_SECRET` | Секрет для подписи токенов, мин. 32 символа | — |
| `TZ` | Часовой пояс для уведомлений | `Europe/Moscow` |
| `LOG_PATH` | Путь к файлу ошибок (внутри контейнера) | `/data/error.log` |
| `TELEGRAM_BOT_TOKEN` | Токен бота для уведомлений | — |
| `TELEGRAM_CHAT_ID` | Глобальный чат для всех уведомлений | — |

### 3. Собрать и запустить

```bash
docker compose build --no-cache
docker compose up -d

# Проверить статус
docker compose ps
docker compose logs backend --tail=30
```

### 4. Настроить Nginx Proxy Manager

В панели NPM создать новый Proxy Host:

| Поле | Значение |
|---|---|
| Domain Names | ваш-домен.com |
| Scheme | http |
| Forward Host | IP сервера |
| Forward Port | 3017 (APP_PORT) |
| WebSocket Support | включить |

На вкладке SSL выбрать сертификат, включить Force SSL.

### 5. Первый вход

Открыть сайт в браузере — автоматически откроется страница создания администратора.

---

## Обновление до новой версии

```bash
cd /docker-compose/lifttest/elevator-app

# Распаковать новый архив (данные не трогает)
tar -xzf elevator-audit-v4.tar.gz --strip-components=1

# Пересобрать и перезапустить
docker compose down
docker rmi elevator-app-frontend elevator-frontend-3017 2>/dev/null || true
docker compose build --no-cache
docker compose up -d
```

Данные (БД, логи) хранятся в `./data/` на хосте — при пересборке контейнеров не теряются.

---

## Структура проекта

```
elevator-app/
├── backend/
│   ├── server.js              # Точка входа: Express, Socket.IO, cron
│   ├── db.js                  # Схема БД, миграции, подключение SQLite
│   ├── auth.js                # JWT: генерация, проверка, инвалидация
│   ├── socket.js              # Singleton Socket.IO instance
│   ├── jobs/
│   │   └── notifyTO.js        # Проверка сроков ТО и отправка уведомлений
│   ├── middleware/
│   │   ├── logger.js          # Логирование запросов и ошибок
│   │   ├── validate.js        # Валидация тела запроса
│   │   └── rateLimit.js       # Rate limiter (in-memory)
│   └── routes/
│       ├── auth.js            # /login, /logout, /me, /setup
│       ├── users.js           # CRUD пользователей, права, меню
│       ├── buildings.js       # Здания, подъезды, лифты, аудит
│       ├── tasks.js           # Задачи ТО, отметки, история
│       ├── records.js         # Заявки на работы
│       ├── settings.js        # Настройки приложения
│       └── districts.js       # Районы, звенья, статистика
├── frontend/
│   ├── public/
│   │   ├── sw.js              # Service Worker (PWA, офлайн-кеш)
│   │   ├── manifest.json      # PWA манифест
│   │   └── elevator.svg       # Иконка приложения
│   └── src/
│       ├── App.jsx            # Роутинг, lazy loading страниц
│       ├── contexts/
│       │   ├── AuthContext.jsx      # Глобальное состояние авторизации
│       │   └── ViewModeContext.jsx  # Режим отображения (список/карточки)
│       ├── components/
│       │   └── Layout.jsx           # Боковое меню, навигация
│       ├── pages/
│       │   ├── DashboardPage.jsx    # Дашборд с гистограммой
│       │   ├── TasksPage.jsx        # Список задач ТО
│       │   ├── BuildingsPage.jsx    # Адреса + режим распределения по районам
│       │   ├── CalendarPage.jsx     # Календарь ТО
│       │   ├── RecordsPage.jsx      # Заявки
│       │   ├── UsersPage.jsx        # Пользователи + вкладка Районы
│       │   ├── DistrictsTab.jsx     # Управление районами и звеньями
│       │   ├── StatsPage.jsx        # Статистика по звеньям
│       │   ├── ProfilePage.jsx      # Профиль пользователя
│       │   ├── LoginPage.jsx        # Страница входа
│       │   └── SetupPage.jsx        # Первичная настройка
│       └── utils/
│           ├── api.js               # Axios instance с interceptors
│           ├── socket.js            # Socket.IO клиент с переподключением
│           ├── constants.js         # Константы: месяцы, статусы, parseDate()
│           └── export.js            # Экспорт данных
├── docker-compose.yml
├── .env.example
├── README.md
└── CHANGELOG.md
```

---

## Архитектура

```
Браузер
  │
  ▼
Nginx Proxy Manager (HTTPS + SSL)
  │
  ▼
frontend:3017 (nginx)
  ├── /api/*        → backend:3015  (REST API, httpOnly cookie auth)
  ├── /socket.io/   → backend:3015  (WebSocket, JWT auth при handshake)
  ├── /assets/*     → статика       (Cache-Control: 1 год, immutable)
  └── /*            → index.html    (SPA, no-cache)
         │
         ▼
    backend:3015 (Node.js/Express)
         │
         ▼
    SQLite ./data/elevator.db  ←→  backup-контейнер (снимок каждый час)
```

### Поток аутентификации

1. `POST /api/login` → сервер ставит **httpOnly cookie** `token` + возвращает токен в теле ответа
2. Все последующие запросы — cookie отправляется автоматически браузером
3. При каждом запросе проверяются `is_blocked` и `token_version` пользователя
4. WebSocket-соединение аутентифицируется отдельно при подключении (читает cookie из handshake)

---

## Схема базы данных

| Таблица | Описание |
|---|---|
| `users` | Пользователи, роли, права, Telegram Chat ID |
| `buildings` | Здания (адреса), привязка к району |
| `entrances` | Подъезды зданий |
| `elevators` | Лифты подъездов |
| `building_assignments` | Назначение работников на здания |
| `monthly_tasks` | Задачи ТО (год + месяц + здание) |
| `task_completions` | Отметки выполнения по лифтам/подъездам |
| `completion_history` | История всех изменений отметок |
| `work_records` | Заявки на разовые работы |
| `app_settings` | Настройки приложения (key-value) |
| `elevator_info` | Дополнительная информация по лифтам |
| `user_menu_visibility` | Видимость пунктов меню для каждого пользователя |
| `building_audit_log` | Журнал изменений зданий |
| `districts` | Районы (группы зданий) |
| `teams` | Звенья (бригады) внутри районов |
| `team_members` | Состав звеньев |

---

## Права пользователей

| Право | Описание |
|---|---|
| `perm_view_all` | Видеть все объекты (по умолчанию включено) |
| `perm_complete_others` | Снимать чужие отметки выполнения |
| `perm_assign_users` | Назначать исполнителей на объекты |
| `perm_edit_buildings` | Редактировать адреса, подъезды, лифты |
| `perm_edit_due_day` | Редактировать день ТО |
| `perm_delete_tasks` | Удалять объекты |
| `perm_manage_users` | Управлять пользователями |
| `perm_create_tasks` | Создавать здания |
| `perm_view_stats` | Просматривать страницу статистики |

---

## Управление контейнерами

```bash
# Просмотр логов в реальном времени
docker compose logs backend -f
docker compose logs frontend --tail=50

# Перезапуск отдельного сервиса
docker compose restart backend

# Полная остановка
docker compose down

# Пересборка с нуля
docker compose build --no-cache && docker compose up -d

# Размер базы данных
du -sh ./data/elevator.db

# Список бэкапов
ls -lh ./backups/
```

---

## Бэкапы

Контейнер `backup` делает горячий снимок базы через `sqlite3 .backup` каждый час в `./backups/`.
Хранит последние **168 файлов** (7 дней × 24 часа). Каждый снимок проверяется через `PRAGMA integrity_check`.

**Ручной бэкап перед обновлением:**
```bash
sqlite3 ./data/elevator.db ".backup ./backups/before-update-$(date +%Y%m%d).db"
```

**Восстановление из бэкапа:**
```bash
docker compose down
cp ./backups/elevator-YYYYMMDD-HHMMSS.db ./data/elevator.db
docker compose up -d
```

---

## Telegram уведомления

1. Создать бота через @BotFather → получить `TELEGRAM_BOT_TOKEN`
2. Добавить бота в чат, получить `TELEGRAM_CHAT_ID` (через @userinfobot)
3. Прописать оба значения в `.env`

**Глобальный чат** (`TELEGRAM_CHAT_ID`) — получает сводку по всем зданиям ежедневно в 09:00 по `TZ`.

**Персональные уведомления** — каждый работник указывает свой Telegram Chat ID в профиле и получает уведомления только по своим зданиям.

---

## Статистика по звеньям

1. В разделе **Пользователи → Районы** создать районы и звенья, добавить участников
2. На странице **Адреса → По районам** назначить здания в районы
3. Выдать нужным пользователям право `perm_view_stats`
4. Страница **Статистика** покажет количество обслуженных подъездов по каждому участнику за выбранный месяц или год

---

## PWA — установка на телефон

- **Android / Chrome:** кнопка «Установить» появится в адресной строке
- **iOS / Safari:** «Поделиться» → «На экран "Домой"»

Для работы PWA необходим HTTPS.

---

## Безопасность

- JWT-токен хранится в **httpOnly cookie** — недоступен из JavaScript (защита от XSS)
- Блокировка пользователя вступает в силу **немедленно** при следующем запросе
- **Token versioning** — смена пароля инвалидирует все активные сессии пользователя
- WebSocket-соединения аутентифицируются отдельно при handshake
- Rate limiting на эндпоинтах авторизации
- Все SQL-запросы через параметризованные `prepare().run()` (защита от SQL-инъекций)
- Все временные метки хранятся в UTC с Z-суффиксом — отображаются в локальном времени браузера
