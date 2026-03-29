/**
 * AuthContext.jsx — глобальное состояние авторизации.
 *
 * Провайдер оборачивает всё приложение (в App.jsx).
 * Любой компонент получает данные через: const { user, login, logout } = useAuth();
 *
 * Поля контекста:
 *   user        — объект пользователя из /api/me (null если не авторизован)
 *   loading     — true пока идёт первичная проверка сессии при загрузке
 *   login()     — POST /login, сохраняет токен, обновляет user
 *   logout()    — POST /logout, очищает cookie и state
 *   refreshUser() — GET /me, обновляет user (после изменения профиля/прав)
 *   setUser     — прямое обновление state (для оптимистичных обновлений)
 *
 * Инициализация:
 *   При монтировании делает GET /api/me. Если сервер вернул пользователя —
 *   сессия активна (cookie валиден). Иначе user остаётся null → редирект на /login.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // блокируем рендер до проверки сессии

  useEffect(() => {
    // Поддержка legacy localStorage-токена для плавной миграции на cookie-auth.
    // Пользователи, залогиненные до обновления, продолжат работать без повторного входа.
    const legacyToken = localStorage.getItem('token');
    if (legacyToken) api.defaults.headers.common['Authorization'] = `Bearer ${legacyToken}`;

    api.get('/me')
      .then(r => { setUser(r.data); setLoading(false); })
      .catch(() => {
        // Не авторизован — очищаем устаревший токен если был
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        setLoading(false);
      });
  }, []);

  const login = async (username, password) => {
    const r = await api.post('/login', { username, password });
    // Сервер ставит httpOnly cookie автоматически.
    // localStorage нужен только для Authorization header в текущей сессии
    // (до следующей перезагрузки страницы).
    localStorage.setItem('token', r.data.token);
    api.defaults.headers.common['Authorization'] = `Bearer ${r.data.token}`;
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = async () => {
    try { await api.post('/logout'); } catch {} // сервер удаляет cookie
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  // Используется после обновления профиля или прав — синхронизирует state с сервером
  const refreshUser = async () => {
    const r = await api.get('/me');
    setUser(r.data);
    return r.data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
