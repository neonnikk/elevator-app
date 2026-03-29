/**
 * api.js — настроенный Axios instance для всех запросов к бэкенду.
 *
 * baseURL '/api' — nginx на фронтенд-контейнере проксирует /api/* → backend:3015.
 * withCredentials: true — браузер отправляет httpOnly cookie `token` с каждым запросом.
 *
 * Interceptors:
 *   Request:  добавляет Authorization header из localStorage (legacy fallback).
 *             После первого re-login токен переезжает в cookie и localStorage очищается.
 *   Response: при 401 очищает устаревший токен и редиректит на /login.
 */

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // нужно для httpOnly cookie — без этого браузер не отправит его
});

api.interceptors.request.use(config => {
  // Поддержка старого токена из localStorage — актуально для пользователей
  // которые залогинились до перехода на cookie-based auth.
  // При следующем логине localStorage очистится автоматически.
  const token = localStorage.getItem('token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      // Токен истёк или инвалидирован — очищаем всё и отправляем на логин.
      // Проверяем что мы не уже на /login — иначе будет бесконечный редирект.
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
