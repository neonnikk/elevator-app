// SetupPage.jsx — страница первоначальной настройки (создание администратора)
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import toast from 'react-hot-toast';

export function SetupPage({ onDone }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  const [loading, setLoading] = useState(false);

  const handle = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post('/setup', form);
      localStorage.setItem('token', r.data.token);
      setUser(r.data.user);
      onDone();
      toast.success('Добро пожаловать!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="2" width="18" height="20" rx="2"/>
              <path d="M9 9l3-3 3 3"/><path d="M9 15l3 3 3-3"/>
              <line x1="12" y1="6" x2="12" y2="18"/>
            </svg>
          </div>
          <h1>ТО Лифтов</h1>
          <p>Первоначальная настройка — создайте администратора</p>
        </div>
        <form onSubmit={handle}>
          <div className="form-group">
            <label className="form-label">Имя пользователя</label>
            <input className="form-input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="admin" required />
          </div>
          <div className="form-group">
            <label className="form-label">Отображаемое имя</label>
            <input className="form-input" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} placeholder="Иван Иванов" required />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input className="form-input" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Создание...' : 'Создать администратора'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SetupPage;
