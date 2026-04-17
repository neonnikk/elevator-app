import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Radio } from 'lucide-react';
import { ListChecks, Building2, ClipboardList, Users, User, LogOut, Menu, X, Calendar, Edit2, Check, Settings, BarChart2, WifiOff, PieChart } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

// Конфигурация меню по умолчанию
const DEFAULT_MENU = [
  { key: 'dashboard', path: '/dashboard', Icon: BarChart2,    defaultLabel: 'Дашборд' },
  { key: 'tasks',     path: '/tasks',     Icon: ListChecks,   defaultLabel: 'ТО' },
  { key: 'buildings', path: '/buildings', Icon: Building2,    defaultLabel: 'Адреса' },
  { key: 'calendar',  path: '/calendar',  Icon: Calendar,     defaultLabel: 'Календарь' },
  { key: 'records',   path: '/records',   Icon: ClipboardList, defaultLabel: 'Заявки' },
  { key: 'stats',     path: '/stats',     Icon: PieChart,     defaultLabel: 'Статистика' },
  { key: 'comm',      path: '/comm',      Icon: Radio,        defaultLabel: 'Связь',      permKey: 'perm_comm' },
  { key: 'users',     path: '/users',     Icon: Users,        defaultLabel: 'Пользователи', adminOnly: true },
  { key: 'profile',   path: '/profile',   Icon: User,         defaultLabel: 'Профиль' },
];

export function useMenuConfig() {
  const [labels, setLabels] = useState({});
  const [visibility, setVisibility] = useState({});
  const { user } = useAuth();

  const load = useCallback(async () => {
    try {
      const [sRes, mRes] = await Promise.all([
        api.get('/settings'),
        api.get('/me/menu'),
      ]);
      setLabels(sRes.data);
      setVisibility(mRes.data);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const getLabel = (key) => labels[`menu_label_${key}`] || DEFAULT_MENU.find(m => m.key === key)?.defaultLabel || key;

  const isVisible = (item) => {
    if (item.adminOnly && user?.role !== 'admin' && !user?.perm_manage_users) return false;
    if (item.permKey && user?.role !== 'admin' && !user?.[item.permKey]) return false;
    if (user?.role === 'admin') return true; // администратор всегда видит всё
    const v = visibility[item.key];
    // Если у пользователя есть хоть одна запись настроек — неуказанные пункты скрыты
    // Если записей нет совсем — показываем всё (настройки ещё не задавались)
    const hasAnySettings = Object.keys(visibility).length > 0;
    if (v === undefined) return !hasAnySettings;
    return v;
  };

  return { labels, setLabels, visibility, setVisibility, getLabel, isVisible, reload: load };
}

function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline  = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online',  onOnline);
    setOffline(!navigator.onLine);
    return () => { window.removeEventListener('offline', onOffline); window.removeEventListener('online', onOnline); };
  }, []);
  if (!offline) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#ef4444', color: 'white', textAlign: 'center',
      padding: '8px 16px', fontSize: 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <WifiOff size={14}/> Нет соединения с сервером — данные могут быть устаревшими
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { labels, setLabels, getLabel, isVisible } = useMenuConfig();
  const [editingLabel, setEditingLabel] = useState(null); // { key, value } — редактируемый пункт меню

  const close = () => setSidebarOpen(false);
  const initials = user?.display_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  const saveLabel = async (key, value) => {
    try {
      const r = await api.put('/settings', { [`menu_label_${key}`]: value });
      setLabels(r.data);
      setEditingLabel(null);
    } catch {}
  };

  const visibleItems = DEFAULT_MENU.filter(item => isVisible(item));

  return (
    <div className="app-layout">
      <OfflineBanner/>
      <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={close} />

      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="2" width="18" height="20" rx="2"/>
            <path d="M9 9l3-3 3 3"/><path d="M9 15l3 3 3-3"/>
            <line x1="12" y1="6" x2="12" y2="18"/>
          </svg>
          <span>ТО Лифтов</span>
        </div>

        <div className="sidebar-nav">
          {visibleItems.map(item => {
            const label = getLabel(item.key);
            const isEditing = editingLabel?.key === item.key;
            const isActive = location.pathname === item.path;

            return (
              <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flex: 1, gap: 4, padding: '4px 6px' }}>
                    <input
                      className="form-input"
                      style={{ flex: 1, padding: '5px 8px', fontSize: 13 }}
                      value={editingLabel.value}
                      autoFocus
                      onChange={e => setEditingLabel({ ...editingLabel, value: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveLabel(item.key, editingLabel.value);
                        if (e.key === 'Escape') setEditingLabel(null);
                      }}
                    />
                    <button className="btn btn-primary btn-sm btn-icon" onClick={() => saveLabel(item.key, editingLabel.value)}><Check size={13}/></button>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingLabel(null)}><X size={13}/></button>
                  </div>
                ) : (
                  <>
                    <button
                      className={`nav-item ${isActive ? 'active' : ''}`}
                      style={{ flex: 1 }}
                      onClick={() => { navigate(item.path); close(); }}
                    >
                      <item.Icon size={18} />
                      {label}
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        style={{ flexShrink: 0, opacity: 0.4, padding: '6px' }}
                        title="Переименовать"
                        onClick={() => setEditingLabel({ key: item.key, value: label })}
                      >
                        <Edit2 size={12}/>
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <div className="user-card" onClick={() => { navigate('/profile'); close(); }}>
            <div className="user-avatar" style={{ background: user?.color || '#6366F1' }}>{initials}</div>
            <div className="user-info">
              <div className="name">{user?.display_name}</div>
              <div className="role">{user?.role === 'admin' ? 'Администратор' : 'Пользователь'}</div>
            </div>
          </div>
          <button className="nav-item" style={{ color: 'var(--red)' }} onClick={logout}>
            <LogOut size={18} /> Выйти
          </button>
        </div>
      </nav>

      <main className="main-content">
        {children}
      </main>

      {/* Плавающая кнопка + для заявок — рендерится вне main-content чтобы fixed работал */}
      {location.pathname === '/records' && (
        <button
          onClick={() => {
            // Отправляем custom event чтобы RecordsPage открыл модалку
            window.dispatchEvent(new CustomEvent('records:new'));
          }}
          title="Новая заявка"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            zIndex: 200,
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Plus size={24}/>
        </button>
      )}
    </div>
  );
}
