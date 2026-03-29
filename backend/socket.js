/**
 * socket.js — singleton Socket.IO instance.
 *
 * Проблема: server.js создаёт io, но notifyTO.js (cron-задача) тоже
 * должен рассылать события через WebSocket. Прямой импорт server.js
 * создал бы циклическую зависимость.
 *
 * Решение: храним io в модуле-синглтоне. server.js вызывает setIO() один раз
 * при старте, а все остальные модули вызывают getIO().
 */

let _io = null;

export const setIO = (io) => { _io = io; };
export const getIO = () => _io;
