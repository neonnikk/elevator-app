import { useState, useEffect } from 'react';
import { Plus, X, Shield, ShieldOff, Trash2, Edit2, Eye, EyeOff } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import DistrictsTab from './DistrictsTab';

const COLORS = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#84CC16'];

const PERMS = [
  { key: 'view_all',         label: 'Видеть все объекты (иначе только назначенные)' },
  { key: 'complete_others',  label: 'Снимать чужие отметки выполнения' },
  { key: 'assign_users',     label: 'Назначать исполнителей на объекты' },
  { key: 'edit_buildings',   label: 'Редактировать адреса, подъезды, лифты' },
  { key: 'edit_due_day',     label: 'Редактировать день ТО' },
  { key: 'delete_tasks',     label: 'Удалять объекты' },
  { key: 'manage_users',     label: 'Управлять пользователями' },
  { key: 'create_tasks',     label: 'Создавать объекты (здания)' },
  { key: 'edit_tasks',       label: '(резерв)' },
  { key: 'comm',             label: 'Доступ к разделу Связь' },
  { key: 'manage_districts', label: 'Управлять районами и звеньями' },
];

const MENU_ITEMS = [
  { key: 'dashboard', label: 'Дашборд' },
  { key: 'tasks',     label: 'ТО' },
  { key: 'buildings', label: 'Адреса' },
  { key: 'calendar',  label: 'Календарь' },
  { key: 'records',   label: 'Заявки' },
  { key: 'stats',     label: 'Статистика' },
  { key: 'comm',      label: 'Связь' },
  { key: 'profile',   label: 'Профиль' },
];

function MenuVisibilityModal({ user: editUser, onClose }) {
  const [visibility, setVisibility] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/users/${editUser.id}/menu`).then(r => {
      setVisibility(r.data);
      setLoading(false);
    });
  }, [editUser.id]);

  const toggle = (key) => setVisibility(v => ({ ...v, [key]: v[key] === false ? true : false }));

  const isVisible = (key) => visibility[key] !== false;

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/users/${editUser.id}/menu`, visibility);
      toast.success('Сохранено');
      onClose();
    } catch { toast.error('Ошибка'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Пункты меню — {editUser.display_name}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">
          {loading ? <div className="spinner" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MENU_ITEMS.map(item => {
                const visible = isVisible(item.key);
                return (
                  <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</span>
                    <button
                      className={`btn btn-sm ${visible ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => toggle(item.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      {visible ? <><Eye size={13}/> Видно</> : <><EyeOff size={13}/> Скрыто</>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  );
}

function UserModal({ user: editUser, onClose, onSave }) {
  const isEdit = !!editUser?.id;
  const [form, setForm] = useState({
    username: editUser?.username || '',
    displayName: editUser?.display_name || '',
    password: '',
    color: editUser?.color || '#6366F1',
    role: editUser?.role || 'user',
    permissions: {
      create_tasks: !!editUser?.perm_create_tasks,
      edit_tasks: !!editUser?.perm_edit_tasks,
      comm: !!editUser?.perm_comm,
      manage_districts: !!editUser?.perm_manage_districts,
      delete_tasks: !!editUser?.perm_delete_tasks,
      assign_users: !!editUser?.perm_assign_users,
      complete_others: !!editUser?.perm_complete_others,
      view_all: editUser?.perm_view_all !== 0,
      manage_users: !!editUser?.perm_manage_users,
      edit_due_day: !!editUser?.perm_edit_due_day,
      edit_buildings: !!editUser?.perm_edit_buildings,
    }
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { displayName: form.displayName, color: form.color, role: form.role, permissions: form.permissions };
      if (isEdit) {
        await api.put(`/users/${editUser.id}`, payload);
        if (form.password) await api.put(`/users/${editUser.id}/password`, { newPassword: form.password });
      } else {
        if (!form.username || !form.password) return toast.error('Заполните логин и пароль');
        await api.post('/users', { ...payload, username: form.username, password: form.password });
      }
      toast.success(isEdit ? 'Сохранено' : 'Пользователь создан');
      onSave(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setSaving(false); }
  };

  const togglePerm = k => setForm(f => ({ ...f, permissions: { ...f.permissions, [k]: !f.permissions[k] } }));

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span className="modal-title">{isEdit ? 'Редактировать пользователя' : 'Новый пользователь'}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Логин</label>
              <input className="form-input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} disabled={isEdit} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{isEdit ? 'Новый пароль (необяз.)' : 'Пароль'}</label>
              <input className="form-input" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Отображаемое имя</label>
            <input className="form-input" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Цвет</label>
            <div className="color-picker">
              {COLORS.map(c => (
                <div key={c} className={`color-swatch ${form.color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setForm({...form, color: c})} />
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Роль</label>
            <select className="form-input" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
              <option value="user">Пользователь</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          {form.role !== 'admin' && (
            <div className="form-group">
              <label className="form-label">Права доступа</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {PERMS.map(p => (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '5px 0' }}>
                    <div className={`checkbox-custom ${form.permissions[p.key] ? 'checked' : ''}`} onClick={() => togglePerm(p.key)}>
                      {form.permissions[p.key] && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ fontSize: 13.5 }}>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  );
}

function TelegramPanel() {
  const [testing, setTesting] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const testTelegram = async () => {
    setTesting(true);
    try {
      await api.post('/settings/test-telegram');
      toast.success('Тестовое сообщение отправлено в Telegram!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setTesting(false); }
  };

  const notifyNow = async () => {
    setNotifying(true);
    try {
      await api.post('/settings/notify-now');
      toast.success('Проверка выполнена. Уведомления отправлены.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setNotifying(false); }
  };

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Bell size={18} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: 16 }}>Telegram уведомления</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
        Ежедневно в 09:00 сервер проверяет сроки ТО и отправляет сводку в Telegram.<br/>
        Для активации укажите <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>TELEGRAM_BOT_TOKEN</code> и{' '}
        <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>TELEGRAM_CHAT_ID</code> в файле <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>.env</code>,
        затем перезапустите контейнер.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={testTelegram} disabled={testing}>
          <Send size={13}/> {testing ? 'Отправка...' : 'Тест Telegram'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={notifyNow} disabled={notifying}>
          <RefreshCw size={13}/> {notifying ? 'Проверяю...' : 'Проверить сейчас'}
        </button>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(null);
  const [menuModal, setMenuModal] = useState(null);
  const [tab, setTab] = useState('users'); // 'users' = пользователи | 'districts' = районы

  const load = () => {
    api.get('/users').then(r => { setUsers(r.data); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleBlock = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { is_blocked: !u.is_blocked });
      load(); toast.success(u.is_blocked ? 'Разблокирован' : 'Заблокирован');
    } catch { toast.error('Ошибка'); }
  };

  const deleteUser = async (id) => {
    if (!confirm('Удалить пользователя?')) return;
    try { await api.delete(`/users/${id}`); load(); toast.success('Удалено'); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  const TAB_STYLE = (active) => ({
    padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: active ? 'var(--accent)' : 'var(--bg3)',
    color: active ? '#fff' : 'var(--text2)',
    transition: 'all 0.15s',
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{tab === 'users' ? 'Пользователи' : 'Районы и звенья'}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg2)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
            <button style={TAB_STYLE(tab === 'users')} onClick={() => setTab('users')}>Пользователи</button>
            <button style={TAB_STYLE(tab === 'districts')} onClick={() => setTab('districts')}>Районы</button>
          </div>
          {tab === 'users' && (
            <button className="btn btn-primary" onClick={() => setEditModal({})}>
              <Plus size={16}/> Добавить
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {tab === 'districts' ? <DistrictsTab /> : (
          <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Логин</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ opacity: u.is_blocked ? 0.6 : 1 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                          {u.display_name.split(' ').map(w => w[0]).join('').slice(0,2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.display_name}</div>
                          {u.id === me.id && <span className="tag" style={{ fontSize: 10 }}>Это вы</span>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{u.username}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-completed' : 'badge-pending'}`}>
                        {u.role === 'admin' ? 'Админ' : 'Польз.'}
                      </span>
                    </td>
                    <td>
                      {u.is_blocked
                        ? <span className="badge badge-overdue">Заблокирован</span>
                        : <span className="badge badge-completed">Активен</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm btn-icon" title="Редактировать" onClick={() => setEditModal(u)}><Edit2 size={14}/></button>
                        {u.role !== 'admin' && (
                          <button className="btn btn-ghost btn-sm btn-icon" title="Пункты меню" onClick={() => setMenuModal(u)}>
                            <Eye size={14}/>
                          </button>
                        )}
                        {u.id !== me.id && (
                          <>
                            <button className="btn btn-ghost btn-sm btn-icon" title={u.is_blocked ? 'Разблокировать' : 'Заблокировать'} onClick={() => toggleBlock(u)}>
                              {u.is_blocked ? <Shield size={14}/> : <ShieldOff size={14}/>}
                            </button>
                            <button className="btn btn-danger btn-sm btn-icon" title="Удалить" onClick={() => deleteUser(u.id)}>
                              <Trash2 size={14}/>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </div>

      {editModal !== null && (
        <UserModal user={editModal.id ? editModal : null} onClose={() => setEditModal(null)} onSave={load} />
      )}
      {menuModal && (
        <MenuVisibilityModal user={menuModal} onClose={() => setMenuModal(null)} />
      )}
    </div>
  );
}
