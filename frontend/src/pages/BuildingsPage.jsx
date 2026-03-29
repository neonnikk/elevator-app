import { useState, useEffect, useCallback, Fragment } from 'react';
import { Plus, Edit2, Trash2, X, Check, Users, Building2, ChevronDown, ChevronUp, History, Clock, Search, MapPin, CheckSquare, Square } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

/* ─────────────────────────────────────────────
   Inline editable number cell (like due_day)
───────────────────────────────────────────── */
function InlineNumber({ value, onSave, title = 'Нажмите для редактирования' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  const commit = () => {
    const n = parseInt(val);
    if (!isNaN(n) && n >= 0) onSave(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number" min="0"
        value={val}
        style={{ width: 54, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
      />
    );
  }
  return (
    <span
      title={title}
      style={{ cursor: 'pointer', padding: '3px 6px', borderRadius: 5, display: 'inline-block', minWidth: 28, textAlign: 'center' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      onClick={() => { setVal(value); setEditing(true); }}
    >
      {value || '—'}
    </span>
  );
}

/* ─────────────────────────────────────────────
   Full Building Modal (add / edit)
   — contains all fields + entrance/elevator editor
───────────────────────────────────────────── */
function BuildingModal({ building, onClose, onSave }) {
  const isEdit = !!building?.id;

  const [form, setForm] = useState({
    name:        building?.name        || '',
    address:     building?.address     || '',
    description: building?.description || '',
    due_day:     building?.due_day     || 15,
  });

  // Подъезды: [{ id?, name, elevators: [{id?, name}] }]
  const initEntrances = () => {
    if (!building?.entrances?.length) return [];
    return building.entrances.map(e => ({
      id:        e.id,
      name:      e.name,
      elevators: (e.elevators || []).map(el => ({ id: el.id, name: el.name })),
    }));
  };
  const [entrances, setEntrances] = useState(initEntrances);
  const [saving, setSaving] = useState(false);

  // ── entrance helpers ──
  const addEntrance = () => {
    const n = entrances.length + 1;
    setEntrances(prev => [...prev, { name: `Подъезд ${n}`, elevators: [] }]);
  };
  const removeEntrance = (ei) => setEntrances(prev => prev.filter((_, i) => i !== ei));
  const updateEntrance = (ei, name) => setEntrances(prev => prev.map((e, i) => i === ei ? { ...e, name } : e));

  // ── elevator helpers ──
  const addElevator = (ei) => {
    setEntrances(prev => prev.map((e, i) => {
      if (i !== ei) return e;
      const n = e.elevators.length + 1;
      return { ...e, elevators: [...e.elevators, { name: `Лифт ${n}` }] };
    }));
  };
  const removeElevator = (ei, li) => setEntrances(prev => prev.map((e, i) =>
    i !== ei ? e : { ...e, elevators: e.elevators.filter((_, j) => j !== li) }
  ));
  const updateElevator = (ei, li, name) => setEntrances(prev => prev.map((e, i) =>
    i !== ei ? e : { ...e, elevators: e.elevators.map((el, j) => j !== li ? el : { ...el, name }) }
  ));

  /* ── Save ── */
  const save = async () => {
    if (!form.name.trim()) return toast.error('Введите название');
    setSaving(true);
    try {
      if (isEdit) {
        // 1. Обновляем поля здания
        await api.put(`/buildings/${building.id}`, { ...form, due_day: parseInt(form.due_day) });

        // 2. Синхронизируем подъезды: удаляем убранные, обновляем существующие, добавляем новые
        const existing = building.entrances || [];
        const keptIds = entrances.filter(e => e.id).map(e => e.id);
        for (const old of existing) {
          if (!keptIds.includes(old.id)) await api.delete(`/buildings/entrances/${old.id}`);
        }
        for (const ent of entrances) {
          if (ent.id) {
            // Обновляем название
            await api.put(`/buildings/entrances/${ent.id}`, { name: ent.name });
            // Синхронизируем лифты
            const oldElvs = existing.find(e => e.id === ent.id)?.elevators || [];
            const keptElIds = ent.elevators.filter(el => el.id).map(el => el.id);
            for (const oel of oldElvs) {
              if (!keptElIds.includes(oel.id)) await api.delete(`/buildings/elevators/${oel.id}`);
            }
            for (const el of ent.elevators) {
              if (el.id) {
                await api.put(`/buildings/elevators/${el.id}`, { name: el.name });
              } else {
                await api.post(`/buildings/entrances/${ent.id}/elevators`, { name: el.name });
              }
            }
          } else {
            // Новый подъезд
            const r = await api.post(`/buildings/${building.id}/entrances`, { name: ent.name });
            const newEntId = r.data.id;
            for (const el of ent.elevators) {
              await api.post(`/buildings/entrances/${newEntId}/elevators`, { name: el.name });
            }
          }
        }
      } else {
        // New building — send entrances in one shot
        await api.post('/buildings', {
          ...form,
          due_day: parseInt(form.due_day),
          entrances: entrances.map(e => ({
            name: e.name,
            elevators: e.elevators,
          })),
        });
      }
      toast.success(isEdit ? 'Сохранено' : 'Адрес добавлен');
      onSave();
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <span className="modal-title">{isEdit ? 'Редактировать адрес' : 'Новый адрес'}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">

          {/* ── Main fields ── */}
          <div className="form-group">
            <label className="form-label">Название *</label>
            <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Купалы 72/1" />
          </div>
          <div className="form-group">
            <label className="form-label">Адрес</label>
            <input className="form-input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="ул. Купалы, 72/1" />
          </div>
          <div className="form-group">
            <label className="form-label">Описание</label>
            <textarea className="form-input" rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Дополнительная информация" />
          </div>
          <div className="form-group">
            <label className="form-label">День ТО (1–31)</label>
            <input className="form-input" type="number" min="1" max="31" value={form.due_day}
              onChange={e => setForm({...form, due_day: e.target.value})} style={{ maxWidth: 100 }} />
          </div>

          {/* ── Entrances / Elevators ── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Подъезды и лифты</span>
              <button className="btn btn-ghost btn-sm" onClick={addEntrance}><Plus size={13}/> Подъезд</button>
            </div>

            {entrances.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>Нет подъездов — здание целиком</p>
            )}

            {entrances.map((ent, ei) => (
              <div key={ei} style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 10, border: '1px solid var(--border)' }}>
                {/* Строка подъезда */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    className="form-input"
                    style={{ flex: 1, padding: '5px 10px', fontSize: 13.5, fontWeight: 600 }}
                    value={ent.name}
                    onChange={e => updateEntrance(ei, e.target.value)}
                    placeholder="Подъезд 1"
                  />
                  <button className="btn btn-sm btn-ghost btn-icon" onClick={() => addElevator(ei)} title="Добавить лифт">
                    <Plus size={13}/>
                  </button>
                  <button className="btn btn-sm btn-danger btn-icon" onClick={() => removeEntrance(ei)} title="Удалить подъезд">
                    <Trash2 size={13}/>
                  </button>
                </div>

                {/* Лифты */}
                {ent.elevators.map((el, li) => (
                  <div key={li} style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 16, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>⟶</span>
                    <input
                      className="form-input"
                      style={{ flex: 1, padding: '4px 9px', fontSize: 13 }}
                      value={el.name}
                      onChange={e => updateElevator(ei, li, e.target.value)}
                      placeholder="Лифт 1"
                    />
                    <button className="btn btn-sm btn-danger btn-icon" onClick={() => removeElevator(ei, li)}>
                      <X size={12}/>
                    </button>
                  </div>
                ))}

                {ent.elevators.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text3)', paddingLeft: 16 }}>
                    Один лифт — нажмите + чтобы добавить несколько
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ─────────────────────────────────────────────
   Inline expanded row — редактирование прямо в таблице
───────────────────────────────────────────── */
function ExpandedBuildingRow({ building, canEdit, canEditDueDay, onSave, onClose }) {
  const [form, setForm] = useState({
    name:        building.name        || '',
    address:     building.address     || '',
    description: building.description || '',
    due_day:     building.due_day     || 15,
  });
  const [entrances, setEntrances] = useState(() =>
    (building.entrances || []).map(e => ({
      id: e.id, name: e.name,
      elevators: (e.elevators || []).map(el => ({ id: el.id, name: el.name })),
    }))
  );
  const [saving, setSaving] = useState(false);

  const addEntrance = () => {
    const n = entrances.length + 1;
    setEntrances(prev => [...prev, { name: `Подъезд ${n}`, elevators: [] }]);
  };
  const removeEntrance = (ei) => setEntrances(prev => prev.filter((_, i) => i !== ei));
  const updateEntrance = (ei, name) => setEntrances(prev => prev.map((e, i) => i === ei ? { ...e, name } : e));
  const addElevator = (ei) => setEntrances(prev => prev.map((e, i) => {
    if (i !== ei) return e;
    return { ...e, elevators: [...e.elevators, { name: `Лифт ${e.elevators.length + 1}` }] };
  }));
  const removeElevator = (ei, li) => setEntrances(prev => prev.map((e, i) =>
    i !== ei ? e : { ...e, elevators: e.elevators.filter((_, j) => j !== li) }
  ));
  const updateElevator = (ei, li, name) => setEntrances(prev => prev.map((e, i) =>
    i !== ei ? e : { ...e, elevators: e.elevators.map((el, j) => j !== li ? el : { ...el, name }) }
  ));

  const save = async () => {
    if (!form.name.trim()) return toast.error('Введите название');
    setSaving(true);
    try {
      await api.put(`/buildings/${building.id}`, { ...form, due_day: parseInt(form.due_day) });
      const existing = building.entrances || [];
      const keptIds = entrances.filter(e => e.id).map(e => e.id);
      for (const old of existing) {
        if (!keptIds.includes(old.id)) await api.delete(`/buildings/entrances/${old.id}`);
      }
      for (const ent of entrances) {
        if (ent.id) {
          await api.put(`/buildings/entrances/${ent.id}`, { name: ent.name });
          const oldElvs = existing.find(e => e.id === ent.id)?.elevators || [];
          const keptElIds = ent.elevators.filter(el => el.id).map(el => el.id);
          for (const oel of oldElvs) {
            if (!keptElIds.includes(oel.id)) await api.delete(`/buildings/elevators/${oel.id}`);
          }
          for (const el of ent.elevators) {
            if (el.id) await api.put(`/buildings/elevators/${el.id}`, { name: el.name });
            else await api.post(`/buildings/entrances/${ent.id}/elevators`, { name: el.name });
          }
        } else {
          const r = await api.post(`/buildings/${building.id}/entrances`, { name: ent.name });
          for (const el of ent.elevators) {
            await api.post(`/buildings/entrances/${r.data.id}/elevators`, { name: el.name });
          }
        }
      }
      toast.success('Сохранено');
      onSave();
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: '14px 16px', borderTop: '2px solid var(--accent)', borderBottom: '1px solid var(--border)' }}>
      {/* Поля здания */}
      {canEdit ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 12, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Название</div>
            <input className="form-input" style={{ padding: '5px 9px', fontSize: 13 }}
              value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Адрес</div>
            <input className="form-input" style={{ padding: '5px 9px', fontSize: 13 }}
              value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>День ТО</div>
            <input className="form-input" type="number" min="1" max="31"
              style={{ padding: '5px 9px', fontSize: 13, width: 70 }}
              value={form.due_day} onChange={e => setForm({...form, due_day: e.target.value})} />
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--text2)' }}>
          <strong style={{ color: 'var(--text)' }}>{building.name}</strong>
          {building.address && <span> · {building.address}</span>}
          <span> · День ТО: {building.due_day}</span>
        </div>
      )}

      {/* Подъезды и лифты */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Подъезды и лифты
          </span>
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={addEntrance} style={{ fontSize: 12 }}>
              <Plus size={12}/> Подъезд
            </button>
          )}
        </div>

        {entrances.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 0' }}>Нет подъездов — здание целиком</div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {entrances.map((ent, ei) => (
            <div key={ei} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', minWidth: 140 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                {canEdit ? (
                  <input className="form-input"
                    style={{ flex: 1, padding: '3px 7px', fontSize: 12, fontWeight: 600 }}
                    value={ent.name}
                    onChange={e => updateEntrance(ei, e.target.value)} />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{ent.name}</span>
                )}
                {canEdit && (
                  <>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Добавить лифт" onClick={() => addElevator(ei)}><Plus size={11}/></button>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeEntrance(ei)}><Trash2 size={11}/></button>
                  </>
                )}
              </div>
              {ent.elevators.map((el, li) => (
                <div key={li} style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 8, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text3)', fontSize: 11 }}>⟶</span>
                  {canEdit ? (
                    <input className="form-input"
                      style={{ flex: 1, padding: '2px 7px', fontSize: 11 }}
                      value={el.name}
                      onChange={e => updateElevator(ei, li, e.target.value)} />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>{el.name}</span>
                  )}
                  {canEdit && (
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeElevator(ei, li)}><X size={10}/></button>
                  )}
                </div>
              ))}
              {ent.elevators.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)', paddingLeft: 8 }}>1 лифт</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Кнопки */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Закрыть</button>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        )}
      </div>
    </div>
  );
}


/* ─────────────────────────────────────────────
   Main Page
───────────────────────────────────────────── */
export default function BuildingsPage() {
  const { user } = useAuth();
  const [buildings, setBuildings]   = useState([]);
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editModal, setEditModal]   = useState(null);   // null | объект здания
  const [auditModal, setAuditModal] = useState(null);  // null | объект здания
  const [expandedRow, setExpandedRow] = useState(null); // id раскрытой строки
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [editingDueDay, setEditingDueDay] = useState({});

  const isAdmin      = user?.role === 'admin';
  const canEdit      = isAdmin || !!user?.perm_edit_buildings;
  const canEditDueDay = canEdit || !!user?.perm_edit_due_day;
  const canManageDistricts = isAdmin || !!user?.perm_manage_districts;

  // {districtLabel ? `Режим: ${districtLabel}` : 'Режим распределения'} по районам
  const [districtMode, setDistrictMode] = useState(false);
  const [selected, setSelected] = useState(new Set()); // выбранные building ids
  const [districts, setDistricts] = useState([]);
  const [districtLabel, setDistrictLabel] = useState('Район');
  const [assignDistrictId, setAssignDistrictId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [filterDistrict, setFilterDistrict] = useState(''); // '' = все, 'none' = без района, число = id района

  const loadDistricts = useCallback(async () => {
    try {
      const [dr, sr] = await Promise.all([
        api.get('/districts'),
        api.get('/settings'),
      ]);
      setDistricts(dr.data);
      setDistrictLabel(sr.data.district_label || 'Район');
    } catch {}
  }, []);

  useEffect(() => { if (isAdmin) loadDistricts(); }, [isAdmin, loadDistricts]);

  const load = async () => {
    try {
      const [br, ur] = await Promise.all([
        api.get('/buildings'),
        isAdmin ? api.get('/users') : Promise.resolve({ data: [] }),
      ]);
      setBuildings(br.data);
      setUsers(ur.data);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const saveDueDay = async (buildingId, value) => {
    const num = parseInt(value);
    if (!num || num < 1 || num > 31) return;
    try {
      const b = buildings.find(b => b.id === buildingId);
      await api.put(`/buildings/${buildingId}`, { name: b.name, address: b.address, description: b.description, due_day: num });
      load();
    } catch { toast.error('Ошибка'); }
  };

  const deleteBuilding = async (id) => {
    if (!confirm('Удалить адрес и все его данные?')) return;
    try { await api.delete(`/buildings/${id}`); load(); toast.success('Удалено'); }
    catch (err) { toast.error(err.response?.data?.error || 'Ошибка удаления'); }
  };

  const toggleSelect = (id) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleSelectAll = () => {
    if (selected.size === sortedBuildings?.length) setSelected(new Set());
    else setSelected(new Set(sortedBuildings.map(b => b.id)));
  };
  const assignDistrict = async () => {
    if (!selected.size) return toast.error('Выберите здания');
    setAssigning(true);
    try {
      await api.put('/districts/buildings/assign', {
        buildingIds: [...selected],
        districtId: assignDistrictId ? Number(assignDistrictId) : null,
      });
      toast.success(`Назначено: ${selected.size} зданий`);
      setSelected(new Set()); setDistrictMode(false); load();
    } catch { toast.error('Ошибка назначения'); }
    finally { setAssigning(false); }
  };

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span style={{ opacity: 0.3, fontSize: 10, marginLeft: 3 }}>↕</span>;
    return <span style={{ fontSize: 10, marginLeft: 3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };
  const sortedBuildings = [...buildings]
    .filter(b => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return b.name?.toLowerCase().includes(q) || b.address?.toLowerCase().includes(q);
    })
    .filter(b => {
      if (!filterDistrict) return true;
      if (filterDistrict === 'none') return !b.district_id;
      return b.district_id === Number(filterDistrict);
    })
    .sort((a, b) => {
    // Сортировка по умолчанию — по sort_order (ручной порядок),
    // при равном sort_order — натуральный порядок по имени (Клецкова 2 < Клецкова 10)
    if (!sortCol) {
      const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true, sensitivity: 'base' });
    }

    // Для числовых колонок — обычное сравнение чисел
    if (sortCol === 'entrances') {
      const diff = (a.entrances||[]).length - (b.entrances||[]).length;
      return sortDir === 'asc' ? diff : -diff;
    }
    if (sortCol === 'elevators') {
      const ae = (a.entrances||[]).reduce((s,e) => s+(e.elevators||[]).length, 0);
      const be = (b.entrances||[]).reduce((s,e) => s+(e.elevators||[]).length, 0);
      return sortDir === 'asc' ? ae - be : be - ae;
    }
    if (sortCol === 'due_day') {
      return sortDir === 'asc' ? a.due_day - b.due_day : b.due_day - a.due_day;
    }

    // Для текстовых колонок — localeCompare с numeric:true
    // numeric:true делает "Клецкова 2" < "Клецкова 10" (естественный порядок)
    // без него: "Клецкова 10" < "Клецкова 2" (лексикографический — '1' < '2')
    const field = sortCol === 'name' ? 'name' : 'address';
    const cmp = (a[field] || '').localeCompare(b[field] || '', 'ru', { numeric: true, sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Адреса</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canManageDistricts && (
            <button className={`btn ${districtMode ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setDistrictMode(m => !m); setSelected(new Set()); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <MapPin size={14}/> {districtMode ? 'Выйти из режима' : `По ${districtLabel.toLowerCase()}ам`}
            </button>
          )}
          {canEdit && !districtMode && (
            <button className="btn btn-primary" onClick={() => setEditModal({})}>
              <Plus size={16}/> Добавить адрес
            </button>
          )}
        </div>
      </div>

      {/* Панель назначения районов */}
      {districtMode && canManageDistricts && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 10,
          padding: '12px 16px', margin: '0 0 12px', display: 'flex', flexWrap: 'wrap',
          gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
            <MapPin size={13} style={{ marginRight: 4, verticalAlign: 'middle' }}/>
            Режим: {districtLabel}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            Выбрано: <strong style={{ color: 'var(--text)' }}>{selected.size}</strong> из {sortedBuildings.length}
          </span>
          <select value={assignDistrictId} onChange={e => setAssignDistrictId(e.target.value)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '5px 10px', color: 'var(--text)', fontSize: 13, flex: 1, minWidth: 150, maxWidth: 260 }}>
            <option value="">{`— Без ${districtLabel.toLowerCase()}а —`}</option>
            {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={assignDistrict}
            disabled={assigning || selected.size === 0}
            style={{ fontSize: 13, padding: '6px 14px' }}>
            {assigning ? 'Сохранение...' : `Назначить (${selected.size})`}
          </button>
          <button onClick={toggleSelectAll}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text2)' }}>
            {selected.size === sortedBuildings.length ? 'Снять все' : 'Выбрать все'}
          </button>
        </div>
      )}

      <div className="page-body">
        {/* Поиск */}
        <div style={{ position: 'relative', marginBottom: isAdmin && districts.length ? 8 : 16 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
          <input
            className="form-input"
            placeholder="Поиск по названию или адресу..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 34, height: 38, fontSize: 13.5 }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
              <X size={14}/>
            </button>
          )}
        </div>

        {/* Фильтр по районам */}
        {isAdmin && districts.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setFilterDistrict('')}
              style={{ padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: !filterDistrict ? 'var(--accent)' : 'var(--bg3)',
                color: !filterDistrict ? '#fff' : 'var(--text2)' }}>
              Все ({buildings.length})
            </button>
            <button onClick={() => setFilterDistrict('none')}
              style={{ padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: filterDistrict === 'none' ? 'var(--yellow)' : 'var(--bg3)',
                color: filterDistrict === 'none' ? '#000' : 'var(--text2)' }}>
              {`Без ${districtLabel.toLowerCase()}а`} ({buildings.filter(b => !b.district_id).length})
            </button>
            {districts.map(d => (
              <button key={d.id} onClick={() => setFilterDistrict(String(d.id))}
                style={{ padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: filterDistrict === String(d.id) ? 'var(--accent)' : 'var(--bg3)',
                  color: filterDistrict === String(d.id) ? '#fff' : 'var(--text2)' }}>
                {d.name} ({buildings.filter(b => b.district_id === d.id).length})
              </button>
            ))}
          </div>
        )}

        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <div className="table-wrapper">
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  {districtMode && (
                    <th style={{ textAlign: 'center', padding: '4px 2px', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      <div onClick={toggleSelectAll} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
                        {selected.size === sortedBuildings.length && sortedBuildings.length > 0
                          ? <CheckSquare size={15} style={{ color: 'var(--accent)' }}/>
                          : <Square size={15} style={{ color: 'var(--text3)' }}/>}
                      </div>
                    </th>
                  )}
                  <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer', userSelect: 'none', padding: '4px 6px', fontSize: 9, textTransform: 'uppercase', textAlign: 'center' }}>Адрес <SortIcon col="name"/></th>
                  <th onClick={() => toggleSort('entrances')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center', padding: '4px 2px', fontSize: 9, textTransform: 'uppercase', lineHeight: 1.2, whiteSpace: 'nowrap' }}>Подъ-<br/>ездов <SortIcon col="entrances"/></th>
                  <th onClick={() => toggleSort('elevators')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center', padding: '4px 2px', fontSize: 9, textTransform: 'uppercase', lineHeight: 1.2, whiteSpace: 'nowrap' }}>Лиф-<br/>тов <SortIcon col="elevators"/></th>
                  <th onClick={() => toggleSort('due_day')} style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center', padding: '4px 2px', fontSize: 9, textTransform: 'uppercase', lineHeight: 1.2, whiteSpace: 'nowrap' }}>День<br/>ТО <SortIcon col="due_day"/></th>
                  {isAdmin && !districtMode && <th style={{ padding: '4px 4px', fontSize: 9, textTransform: 'uppercase', lineHeight: 1.2, whiteSpace: 'nowrap', textAlign: 'center' }}>{districtLabel}</th>}
                  <th style={{ padding: '4px 4px', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center' }}>Работники</th>
                  {canEdit && !districtMode && <th style={{ padding: '4px 4px', fontSize: 9, textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center' }}>Действия</th>}
                </tr>
              </thead>
              <tbody>
                {sortedBuildings.map(b => {
                  const totalLifts = b.entrances.reduce((acc, e) => acc + Math.max(e.elevators.length, 1), 0);
                  const districtName = districts.find(d => d.id === b.district_id)?.name;
                  const isChecked = selected.has(b.id);
                  return (
                    <Fragment key={b.id}>
                    <tr
                      onClick={districtMode
                        ? () => toggleSelect(b.id)
                        : () => setExpandedRow(expandedRow === b.id ? null : b.id)}
                      style={{
                        cursor: 'pointer',
                        background: isChecked ? 'var(--accent)18' : expandedRow === b.id ? 'var(--bg3)' : undefined,
                      }}>
                      {/* Чекбокс в режиме распределения */}
                      {districtMode && (
                        <td style={{ textAlign: 'center', padding: '6px 2px' }}>
                          {isChecked
                            ? <CheckSquare size={15} style={{ color: 'var(--accent)' }}/>
                            : <Square size={15} style={{ color: 'var(--text3)' }}/>}
                        </td>
                      )}

                      {/* Адрес — не переносится, при необходимости горизонтальный скролл */}
                      <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600 }}>{b.name}</div>
                        {b.description && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{b.description}</div>}
                      </td>

                      {/* Подъездов */}
                      <td style={{ textAlign: 'center', padding: '6px 2px' }}>{b.entrances.length || '—'}</td>

                      {/* Лифтов */}
                      <td style={{ textAlign: 'center', padding: '6px 2px' }}>{totalLifts || '—'}</td>

                      {/* День ТО */}
                      <td style={{ textAlign: 'center', padding: '6px 2px' }}>
                        {canEditDueDay ? (
                          <InlineNumber
                            value={b.due_day}
                            title="Нажмите чтобы изменить день ТО"
                            onSave={n => saveDueDay(b.id, n)}
                          />
                        ) : b.due_day}
                      </td>

                      {/* Район */}
                      {isAdmin && !districtMode && (
                        <td style={{ padding: '6px 4px' }}>
                          {districtName
                            ? <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 10, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '100%' }}>{districtName}</span>
                            : <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>}
                        </td>
                      )}

                      {/* Работники */}
                      <td style={{ padding: '6px 4px' }}>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                          {b.assignedUsers?.map(u => (
                            <div key={u.id} title={u.display_name}
                              style={{ width: 24, height: 24, borderRadius: '50%', background: u.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                              {u.display_name.split(' ').map(w => w[0]).join('').slice(0,2)}
                            </div>
                          ))}

                        </div>
                      </td>

                      {/* Действия */}
                      {canEdit && !districtMode && (
                        <td style={{ padding: '6px 4px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm btn-icon" title="История изменений" onClick={e => { e.stopPropagation(); setAuditModal(b); }}>
                              <History size={14}/>
                            </button>
                            <button className="btn btn-ghost btn-sm btn-icon" title="Редактировать" onClick={e => { e.stopPropagation(); setEditModal(b); }}>
                              <Edit2 size={14}/>
                            </button>
                            {isAdmin && (
                              <button className="btn btn-danger btn-sm btn-icon" title="Удалить" onClick={e => { e.stopPropagation(); deleteBuilding(b.id); }}>
                                <Trash2 size={14}/>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {/* Раскрытая строка с редактированием */}
                    {expandedRow === b.id && !districtMode && (
                      <tr>
                        <td colSpan={99} style={{ padding: 0, background: 'var(--bg2)' }}>
                          <ExpandedBuildingRow
                            building={b}
                            canEdit={canEdit}
                            canEditDueDay={canEditDueDay}
                            onSave={() => { load(); }}
                            onClose={() => setExpandedRow(null)}
                          />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {buildings.length === 0 && (
          <div className="empty-state">
            <Building2 size={40} strokeWidth={1} />
            <h3>Нет адресов</h3>
            <p>Добавьте первый адрес для обслуживания</p>
          </div>
        )}
      </div>

      {editModal !== null && (
        <BuildingModal
          building={editModal?.id ? editModal : null}
          onClose={() => setEditModal(null)}
          onSave={load}
        />
      )}
      {auditModal && (
        <AuditModal building={auditModal} onClose={() => setAuditModal(null)} />
      )}
    </div>
  );
}

function AuditModal({ building, onClose }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/buildings/${building.id}/audit`)
      .then(r => { setLog(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [building.id]);

  const ACTION_LABELS = { create: 'Создано', update: 'Изменено', delete: 'Удалено' };
  const FIELD_LABELS  = { name: 'Название', address: 'Адрес', due_day: 'День ТО', building: 'Объект' };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span className="modal-title"><History size={16} style={{ marginRight: 6 }}/>История — {building.name}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner"/></div>
          ) : log.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 14 }}>История пуста</div>
          ) : log.map(entry => (
            <div key={entry.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <Clock size={14} style={{ color: 'var(--text3)', flexShrink: 0, marginTop: 2 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{ACTION_LABELS[entry.action] || entry.action}</span>
                  {entry.field && entry.field !== 'building' && (
                    <span style={{ color: 'var(--text2)' }}>{FIELD_LABELS[entry.field] || entry.field}</span>
                  )}
                  {entry.old_value && entry.new_value && (
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                      <span style={{ textDecoration: 'line-through' }}>{entry.old_value}</span>
                      {' → '}
                      <span style={{ color: 'var(--text)' }}>{entry.new_value}</span>
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 8 }}>
                  <span>{entry.user_name || 'Система'}</span>
                  <span>·</span>
                  <span>{parseDate(entry.ts).toLocaleString('ru', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
