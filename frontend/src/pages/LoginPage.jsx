import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handle = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/tasks');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка входа');
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
          <p>Техническое обслуживание лифтов</p>
        </div>
        <form onSubmit={handle}>
          <div className="form-group">
            <label className="form-label">Логин</label>
            <input className="form-input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="Введите логин" required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input className="form-input" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
