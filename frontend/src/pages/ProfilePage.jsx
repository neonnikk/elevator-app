import { useState } from 'react';
import { Monitor, Smartphone, Cpu, Sun, Moon, SunMoon } from 'lucide-react';
import { getTheme, setTheme, applyTheme } from '../utils/viewMode';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useViewMode } from '../contexts/ViewModeContext';
import toast from 'react-hot-toast';

const COLORS = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#84CC16'];

const VIEW_MODES = [
  { key: 'auto',    Icon: Cpu,        label: 'Авто',    desc: 'По размеру экрана' },
  { key: 'mobile',  Icon: Smartphone, label: 'Мобильный', desc: 'Компактный вид' },
  { key: 'desktop', Icon: Monitor,    label: 'ПК',      desc: 'Полный вид' },
];

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const { mode: viewMode, changeMode, isMobile } = useViewMode();
  const [theme, setThemeState] = useState(() => user?.id ? getTheme(user.id) : 'auto');

  const changeTheme = (t) => {
    setThemeState(t);
    if (user?.id) setTheme(user.id, t);
    applyTheme(t);
  };
  const [form, setForm] = useState({
    displayName: user?.display_name || '',
    color: user?.color || '#6366F1',
    telegramChatId: user?.telegram_chat_id || '',
    prefShowElevatorInfo: !!user?.pref_show_elevator_info,
    prefShowRecords: !!user?.pref_show_records,
    prefInfoFontSize: user?.pref_info_font_size || 11,
    prefInfoColor: user?.pref_info_color || 'var(--text2)',
  });
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.put('/me', {
        displayName: form.displayName,
        color: form.color,
        telegramChatId: form.telegramChatId,
        prefShowElevatorInfo: form.prefShowElevatorInfo,
        prefShowRecords: form.prefShowRecords,
        prefInfoFontSize: form.prefInfoFontSize,
        prefInfoColor: form.prefInfoColor,
      });
      await refreshUser();
      toast.success('Профиль сохранён');
    } catch { toast.error('Ошибка'); }
    finally { setSaving(false); }
  };

  const savePw = async () => {
    if (pwForm.newPassword !== pwForm.confirm) return toast.error('Пароли не совпадают');
    if (pwForm.newPassword.length < 4) return toast.error('Пароль слишком короткий');
    setSavingPw(true);
    try {
      const r = await api.put('/me/password', { oldPassword: pwForm.oldPassword, newPassword: pwForm.newPassword });
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' });
      toast.success('Пароль изменён — войдите снова');
      // Сервер инвалидировал токен — нужен повторный вход
      if (r.data?.relogin) {
        setTimeout(() => { logout(); }, 1500);
      }
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setSavingPw(false); }
  };

  const initials = form.displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Профиль</h1>
      </div>
      <div className="page-body" style={{ maxWidth: 540 }}>

        {/* Карточка профиля */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div className="user-avatar" style={{ background: form.color, width: 56, height: 56, fontSize: 20 }}>{initials}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{form.displayName}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>@{user?.username} · {user?.role === 'admin' ? 'Администратор' : 'Пользователь'}</div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Отображаемое имя</label>
            <input className="form-input" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} />
          </div>

          <div className="form-group">
            <label className="form-label">Цвет метки</label>
            <div className="color-picker">
              {COLORS.map(c => (
                <div key={c} className={`color-swatch ${form.color === c ? 'selected' : ''}`}
                  style={{ background: c }} onClick={() => setForm({...form, color: c})} />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Telegram Chat ID <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 12 }}>(для личных уведомлений ТО)</span></label>
            <input className="form-input" value={form.telegramChatId}
              onChange={e => setForm({...form, telegramChatId: e.target.value})}
              placeholder="-1001234567890 или @username" />
          </div>

          <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить профиль'}
          </button>
        </div>

        {/* Карточка темы оформления */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Тема оформления</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { key: 'auto',  Icon: SunMoon, label: 'Авто',   desc: 'По системной' },
              { key: 'light', Icon: Sun,     label: 'Светлая', desc: 'Всегда светлая' },
              { key: 'dark',  Icon: Moon,    label: 'Тёмная',  desc: 'Всегда тёмная' },
            ].map(({ key, Icon, label, desc }) => {
              const active = theme === key;
              return (
                <button key={key} onClick={() => changeTheme(key)}
                  style={{
                    flex: 1, padding: '14px 10px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-dim)' : 'var(--bg)',
                    textAlign: 'center', transition: 'all 0.15s',
                  }}>
                  <Icon size={22} color={active ? 'var(--accent)' : 'var(--text2)'} style={{ marginBottom: 6 }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Карточка режима отображения */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Вид интерфейса</h3>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Сейчас активен: <strong>{isMobile ? 'мобильный' : 'полный'} вид</strong>
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            {VIEW_MODES.map(({ key, Icon, label, desc }) => {
              const active = viewMode === key;
              return (
                <button
                  key={key}
                  onClick={() => changeMode(key)}
                  style={{
                    flex: 1,
                    padding: '14px 10px',
                    borderRadius: 10,
                    border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-dim)' : 'var(--bg)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={22} color={active ? 'var(--accent)' : 'var(--text2)'} style={{ marginBottom: 6 }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Карточка настроек карточек ТО */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Настройки карточек ТО</h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
            Что показывать в раскрытой карточке здания на вкладке ТО
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: 'prefShowElevatorInfo', label: 'Показывать информацию о лифте', desc: 'Технические данные под каждым лифтом' },
              { key: 'prefShowRecords',      label: 'Показывать заявки',             desc: 'Список заявок под каждым зданием' },
            ].map(({ key, label, desc }) => (
              <div key={key}
                onClick={() => setForm(f => ({ ...f, [key]: !f[key] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: `2px solid ${form[key] ? 'var(--accent)' : 'var(--border)'}`,
                  background: form[key] ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}>
                  {form[key] && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: form[key] ? 600 : 400 }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Размер шрифта и цвет — только если галка включена */}
          {form.prefShowElevatorInfo && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Оформление текста</div>

              {/* Размер шрифта */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
                  Размер шрифта: <strong>{form.prefInfoFontSize}px</strong>
                </div>
                <input type="range" min="9" max="18" step="1"
                  value={form.prefInfoFontSize}
                  onChange={e => setForm(f => ({ ...f, prefInfoFontSize: parseInt(e.target.value) }))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  <span>9px — мелкий</span><span>18px — крупный</span>
                </div>
              </div>

              {/* Цвет текста */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Цвет текста</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { val: 'var(--text3)',  label: 'Серый' },
                    { val: 'var(--text2)',  label: 'Светлый' },
                    { val: 'var(--text)',   label: 'Основной' },
                    { val: 'var(--accent)', label: 'Акцент' },
                    { val: 'var(--green)',  label: 'Зелёный' },
                    { val: 'var(--yellow)', label: 'Жёлтый' },
                  ].map(({ val, label }) => (
                    <button key={val}
                      onClick={() => setForm(f => ({ ...f, prefInfoColor: val }))}
                      style={{
                        padding: '4px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                        border: `2px solid ${form.prefInfoColor === val ? 'var(--accent)' : 'var(--border)'}`,
                        background: form.prefInfoColor === val ? 'var(--accent-dim)' : 'var(--bg)',
                        color: val.startsWith('var') ? val : val,
                        fontWeight: form.prefInfoColor === val ? 700 : 400,
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Предпросмотр */}
              <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
                Предпросмотр:&nbsp;
                <span style={{ fontSize: form.prefInfoFontSize, color: form.prefInfoColor, fontStyle: 'italic' }}>
                  Завод №1234, г/п 400кг, 2018г.в.
                </span>
              </div>
            </div>
          )}

          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={saveProfile} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>

        {/* Карточка смены пароля */}
        <div className="card">
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Изменить пароль</h3>
          <div className="form-group">
            <label className="form-label">Текущий пароль</label>
            <input className="form-input" type="password" value={pwForm.oldPassword} onChange={e => setPwForm({...pwForm, oldPassword: e.target.value})} placeholder="••••••••" />
          </div>
          <div className="form-group">
            <label className="form-label">Новый пароль</label>
            <input className="form-input" type="password" value={pwForm.newPassword} onChange={e => setPwForm({...pwForm, newPassword: e.target.value})} placeholder="••••••••" />
          </div>
          <div className="form-group">
            <label className="form-label">Подтвердить пароль</label>
            <input className="form-input" type="password" value={pwForm.confirm} onChange={e => setPwForm({...pwForm, confirm: e.target.value})} placeholder="••••••••" />
          </div>
          <button className="btn btn-primary" onClick={savePw} disabled={savingPw}>
            {savingPw ? 'Сохранение...' : 'Изменить пароль'}
          </button>
        </div>
      </div>
    </div>
  );
}
