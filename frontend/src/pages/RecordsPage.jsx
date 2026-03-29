import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Search, Edit2, Trash2, Archive, List, Filter, Building2, Calendar, ChevronDown } from 'lucide-react';
import api from '../utils/api';
import { parseDate } from '../utils/constants';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const STATUS_OPTS = [
  { value: '', label: 'Все статусы' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'completed', label: 'Выполнено' },
  { value: 'cancelled', label: 'Отменено' },
];
const STATUS_LABELS = { in_progress: 'В работе', completed: 'Выполнено', cancelled: 'Отменено' };
const STATUS_COLORS = { in_progress: 'var(--yellow)', completed: 'var(--green)', cancelled: 'var(--text3)' };

function RecordModal({ record, buildings, onClose, onSave }) {
  const [form, setForm] = useState({
    title: record?.title || '',
    description: record?.description || '',
    building_id: record?.building_id || '',
    status: record?.status || 'in_progress',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim()) return toast.error('Введите название');
    setSaving(true);
    try {
      if (record?.id) {
        await api.put(`/records/${record.id}`, form);
        toast.success('Сохранено');
      } else {
        await api.post('/records', form);
        toast.success('Заявка создана');
      }
      onSave(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{record?.id ? 'Редактировать заявку' : 'Новая заявка'}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Название *</label>
            <input className="form-input" value={form.title} autoFocus
              onChange={e => setForm({...form, title: e.target.value})}
              onKeyDown={e => e.key === 'Enter' && save()} placeholder="Описание заявки" />
          </div>
          <div className="form-group">
            <label className="form-label">Описание</label>
            <textarea className="form-input" value={form.description} rows={3}
              onChange={e => setForm({...form, description: e.target.value})}
              placeholder="Дополнительная информация..." />
          </div>
          <div className="form-group">
            <label className="form-label">Объект</label>
            <select className="form-input" value={form.building_id} onChange={e => setForm({...form, building_id: e.target.value})}>
              <option value="">— Не указан —</option>
              {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Статус</label>
            <select className="form-input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
              <option value="in_progress">В работе</option>
              <option value="completed">Выполнено</option>
              <option value="cancelled">Отменено</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  );
}

function RecordCard({ record, onEdit, onDelete, isAdmin }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
      overflow: 'hidden', transition: 'border-color 0.15s',
      borderLeft: `3px solid ${STATUS_COLORS[record.status]}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <span className={`badge badge-${record.status}`} style={{ flexShrink: 0 }}>{STATUS_LABELS[record.status]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.title}</div>
          {record.building_name && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Building2 size={11}/> {record.building_name}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div title={record.user_name} style={{ width: 24, height: 24, borderRadius: '50%', background: record.user_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white' }}>
            {record.user_name?.split(' ').map(w => w[0]).join('').slice(0,2)}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
            {parseDate(record.created_at).toLocaleDateString('ru')}
          </span>
          <ChevronDown size={14} color="var(--text2)" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
          {record.description && (
            <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 10, marginBottom: 10, lineHeight: 1.5 }}>{record.description}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', marginTop: record.description ? 0 : 10 }}>
            <Calendar size={12}/>
            Создано: {parseDate(record.created_at).toLocaleString('ru')}
            {record.updated_at !== record.created_at && (
              <span> · Изменено: {parseDate(record.updated_at).toLocaleString('ru')}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(record)}>
              <Edit2 size={13}/> Редактировать
            </button>
            {isAdmin && (
              <button className="btn btn-danger btn-sm" onClick={() => onDelete(record.id)}>
                <Trash2 size={13}/> Удалить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecordsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [records, setRecords] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  // Слушаем событие от плавающей кнопки в Layout
  useEffect(() => {
    const handler = () => setModal({});
    window.addEventListener('records:new', handler);
    return () => window.removeEventListener('records:new', handler);
  }, []);
  const [archiveMode, setArchiveMode] = useState(false);

  // Фильтры
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBuilding, setFilterBuilding] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [users, setUsers] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: PAGE_SIZE });
      if (filterStatus)   params.set('status', filterStatus);
      if (filterBuilding) params.set('buildingId', filterBuilding);
      if (filterUser)     params.set('userId', filterUser);
      if (search)         params.set('search', search);
      const [rRes, bRes] = await Promise.all([
        api.get(`/records?${params}`),
        api.get('/buildings'),
      ]);
      const data = rRes.data;
      setRecords(data.items || []);
      setTotalPages(data.pages || 1);
      setTotalCount(data.total || 0);
      setBuildings(bRes.data);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [filterStatus, filterBuilding, filterUser, search]);

  useEffect(() => { setPage(1); load(1); }, [filterStatus, filterBuilding, filterUser, search]);
  useEffect(() => { load(page); }, [page]);

  useEffect(() => {
    if (isAdmin) api.get('/users').then(r => setUsers(r.data)).catch(() => {});
  }, [isAdmin]);

  const deleteRecord = async (id) => {
    if (!confirm('Удалить заявку?')) return;
    try { await api.delete(`/records/${id}`); load(); toast.success('Удалено'); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  // Разделяем на активные и архивные
  const isArchived = r => r.status === 'completed' || r.status === 'cancelled';

  // Пункт 19: бэкенд делает фильтрацию и пагинацию; клиент только делит active/archive
  const filtered = records.filter(r => archiveMode ? isArchived(r) : !isArchived(r));
  const activeCount  = records.filter(r => !isArchived(r)).length;
  const archiveCount = records.filter(r =>  isArchived(r)).length;
  const hasFilters = search || filterStatus || filterBuilding || filterUser;

  const clearFilters = () => { setSearch(''); setFilterStatus(''); setFilterBuilding(''); setFilterUser(''); };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Заявки</h1>
        <button className="btn btn-primary" onClick={() => setModal({})}>
          <Plus size={16}/> Новая
        </button>
      </div>

      <div className="page-body">
        {/* Вкладки режима */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={`btn btn-sm ${!archiveMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setArchiveMode(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <List size={14}/> Активные
            {activeCount > 0 && <span style={{ background: 'var(--accent)', color: 'white', borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{activeCount}</span>}
          </button>
          <button
            className={`btn btn-sm ${archiveMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setArchiveMode(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Archive size={14}/> Архив
            {archiveCount > 0 && <span style={{ background: 'var(--text3)', color: 'white', borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>{archiveCount}</span>}
          </button>
        </div>

        {/* Строка поиска и фильтров */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 32 }}
              placeholder="Поиск по названию, описанию, объекту..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={14}/> Фильтры {hasFilters && '●'}
          </button>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <X size={13}/> Сбросить
            </button>
          )}
        </div>

        {/* Расширенные фильтры */}
        {showFilters && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', padding: '12px 14px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Статус</label>
              <select className="form-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Объект</label>
              <select className="form-input" value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)}>
                <option value="">Все объекты</option>
                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {isAdmin && users.length > 0 && (
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Исполнитель</label>
                <select className="form-input" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                  <option value="">Все</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Информация о результатах */}
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
          {hasFilters ? `Найдено: ${filtered.length} из ${archiveMode ? archiveCount : activeCount}` : `${archiveMode ? 'Архив' : 'Активных'}: ${filtered.length}`}
        </div>

        {/* Список заявок */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}><div className="spinner"/></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {archiveMode ? <Archive size={36}/> : <List size={36}/>}
            <h3>{hasFilters ? 'Ничего не найдено' : (archiveMode ? 'Архив пуст' : 'Нет активных заявок')}</h3>
            <p>{hasFilters ? 'Попробуйте изменить фильтры' : (!archiveMode ? 'Создайте первую заявку' : 'Завершённые заявки появятся здесь')}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(r => (
              <RecordCard key={r.id} record={r} isAdmin={isAdmin} onEdit={setModal} onDelete={deleteRecord} />
            ))}
          </div>
        )}

        {/* Пункт 19: пагинация */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-sm btn-icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>
              стр. <strong>{page}</strong> из <strong>{totalPages}</strong>
              <span style={{ marginLeft: 8, opacity: 0.6 }}>({totalCount} всего)</span>
            </span>
            <button className="btn btn-ghost btn-sm btn-icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        )}
      </div>

      {modal !== null && (
        <RecordModal
          record={modal?.id ? modal : null}
          buildings={buildings}
          onClose={() => setModal(null)}
          onSave={load}
        />
      )}

    </div>
  );
}
