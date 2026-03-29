/**
 * Smoke tests — базовая проверка что сервер запускается и отвечает корректно.
 * Запуск: node --test tests/smoke.test.js
 * Требует: запущенный сервер на TEST_URL (по умолчанию http://localhost:3015)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_URL || 'http://localhost:3015';

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}

describe('Health', () => {
  test('GET /health → 200 с полями status, uptime, version', async () => {
    const { status, data } = await get('/health');
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.equal(data.status, 'ok');
    assert.ok(typeof data.uptime === 'number', 'uptime должен быть числом');
    assert.ok(data.version, 'version должен быть задан');
    assert.ok(typeof data.buildings === 'number', 'buildings должен быть числом');
  });
});

describe('Auth', () => {
  test('GET /api/me без токена → 401', async () => {
    const { status } = await get('/api/me');
    assert.equal(status, 401);
  });

  test('POST /api/login с неверными данными → 401', async () => {
    const { status, data } = await post('/api/login', {
      username: 'nonexistent_user_xyz',
      password: 'wrongpassword',
    });
    assert.equal(status, 401);
    assert.ok(data?.error, 'Должно быть поле error');
  });

  test('POST /api/login без тела → 400', async () => {
    const { status } = await post('/api/login', {});
    assert.ok([400, 401].includes(status), `Expected 400 or 401, got ${status}`);
  });
});

describe('Protected routes', () => {
  const routes = [
    '/api/buildings',
    '/api/tasks',
    '/api/records',
    '/api/users',
    '/api/settings',
  ];

  for (const route of routes) {
    test(`GET ${route} без токена → 401`, async () => {
      const { status } = await get(route);
      assert.equal(status, 401, `${route} должен вернуть 401 без токена`);
    });
  }
});

describe('Setup endpoint', () => {
  test('GET /api/setup-needed → 200 с полем needed', async () => {
    const { status, data } = await get('/api/setup-needed');
    assert.equal(status, 200);
    assert.ok(typeof data.needed === 'boolean', 'needed должен быть boolean');
  });
});

describe('404 handling', () => {
  test('GET /api/nonexistent → 404', async () => {
    const { status } = await get('/api/nonexistent_route_xyz');
    assert.equal(status, 404);
  });
});
