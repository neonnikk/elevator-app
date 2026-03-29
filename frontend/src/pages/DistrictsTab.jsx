import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Check, X, Users, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

// ── Inline редактируемый текст ────────────────────────────────────────────────
function InlineEdit({ value, onSave, placeholder = 'Название' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  const save = () => {
    if (val.trim() && val.trim() !== value) onSave(val.trim());
    setEditing(false);
  };

  if (!editing) return (
    <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      onClick={() => { setVal(value); setEditing(true); }}>
      {value}
      <Edit2 size={12} style={{ color: 'var(--text3)', flexShrink: 0 }} />
    </span>
  );

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        style={{ background: 'var(--bg3)', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 6px', color: 'var(--text)', fontSize: 'inherit', width: 160 }} />
      <button onClick={save} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', padding: 2 }}><Check size={14} /></button>
      <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2 }}><X size={14} /></button>
    </span>
  );
}

// ── Редактор состава звена ────────────────────────────────────────────────────
function TeamMembersModal({ team, allUsers, onClose, onSaved }) {
  const [selected, setSelected] = useState(new Set(team.members.map(m => m.id)));
  const [saving, setSaving] = useState(false);

  const toggle = id => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/districts/teams/${team.id}/members`, { userIds: [...selected] });
      toast.success('Состав сохранён');
      onSaved();
      onClose();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380, width: '90%' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
          Состав звена «{team.name}»
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
          {allUsers.filter(u => !u.is_blocked || selected.has(u.id)).map(u => (
            <div key={u.id} onClick={() => toggle(u.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                background: selected.has(u.id) ? 'var(--bg3)' : 'transparent',
                border: `1px solid ${selected.has(u.id) ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.15s' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: u.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {u.display_name.slice(0, 1)}
              </div>
              <span style={{ flex: 1, fontSize: 13 }}>{u.display_name}</span>
              {selected.has(u.id) && <Check size={14} style={{ color: 'var(--accent)' }} />}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Карточка звена ────────────────────────────────────────────────────────────
function TeamCard({ team, allUsers, districtId, onReload }) {
  const [editingMembers, setEditingMembers] = useState(false);

  const rename = async name => {
    try {
      await api.put(`/districts/teams/${team.id}`, { name });
      onReload();
    } catch { toast.error('Ошибка переименования'); }
  };

  const remove = async () => {
    if (!confirm(`Удалить звено «${team.name}»?`)) return;
    try {
      await api.delete(`/districts/teams/${team.id}`);
      toast.success('Звено удалено');
      onReload();
    } catch { toast.error('Ошибка удаления'); }
  };

  return (
    <>
      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px',
        border: '1px solid var(--border)', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
            <InlineEdit value={team.name} onSave={rename} />
          </div>
          <button onClick={() => setEditingMembers(true)} title="Состав"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4 }}>
            <Users size={14} />
          </button>
          <button onClick={remove} title="Удалить звено"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
            <Trash2 size={14} />
          </button>
        </div>
        {team.members.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {team.members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--bg2)', borderRadius: 20, padding: '3px 10px 3px 4px',
                fontSize: 12, border: '1px solid var(--border)' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: m.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff' }}>
                  {m.display_name.slice(0, 1)}
                </div>
                {m.display_name}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Нет участников — нажмите <Users size={11}/> чтобы добавить</div>
        )}
      </div>
      {editingMembers && (
        <TeamMembersModal team={team} allUsers={allUsers}
          onClose={() => setEditingMembers(false)} onSaved={onReload} />
      )}
    </>
  );
}

// ── Карточка района ───────────────────────────────────────────────────────────
function DistrictCard({ district, allUsers, onReload }) {
  const [expanded, setExpanded] = useState(false);
  const [teams, setTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [addingTeam, setAddingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const loadTeams = useCallback(async () => {
    setLoadingTeams(true);
    try {
      const r = await api.get(`/districts/${district.id}/teams`);
      setTeams(r.data);
    } catch {}
    finally { setLoadingTeams(false); }
  }, [district.id]);

  useEffect(() => { if (expanded) loadTeams(); }, [expanded, loadTeams]);

  const rename = async name => {
    try { await api.put(`/districts/${district.id}`, { name }); onReload(); }
    catch { toast.error('Ошибка переименования'); }
  };

  const remove = async () => {
    if (!confirm(`Удалить район «${district.name}»? Здания останутся без района.`)) return;
    try { await api.delete(`/districts/${district.id}`); toast.success('Район удалён'); onReload(); }
    catch { toast.error('Ошибка удаления'); }
  };

  const addTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      await api.post(`/districts/${district.id}/teams`, { name: newTeamName.trim() });
      setNewTeamName(''); setAddingTeam(false);
      loadTeams();
    } catch { toast.error('Ошибка создания звена'); }
  };

  return (
    <div style={{ background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)',
      marginBottom: 10, overflow: 'hidden' }}>
      {/* Заголовок района */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        cursor: 'pointer', userSelect: 'none' }}>
        <div onClick={() => setExpanded(e => !e)} style={{ color: 'var(--text3)', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
        </div>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}
          onClick={() => setExpanded(e => !e)}>
          <InlineEdit value={district.name} onSave={rename} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          {district.building_count} зд. · {district.team_count} зв.
        </span>
        <button onClick={remove} title="Удалить район"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4 }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Звенья */}
      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          {loadingTeams ? (
            <div style={{ color: 'var(--text3)', fontSize: 13 }}>Загрузка...</div>
          ) : (
            <>
              {teams.map(t => (
                <TeamCard key={t.id} team={t} allUsers={allUsers}
                  districtId={district.id} onReload={loadTeams} />
              ))}
              {teams.length === 0 && !addingTeam && (
                <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>Нет звеньев</div>
              )}
            </>
          )}

          {addingTeam ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input autoFocus placeholder="Название звена" value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTeam(); if (e.key === 'Escape') setAddingTeam(false); }}
                style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }} />
              <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 13 }} onClick={addTeam}>Добавить</button>
              <button className="btn-secondary" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => setAddingTeam(false)}>✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingTeam(true)}
              style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6,
                color: 'var(--text3)', cursor: 'pointer', padding: '6px 12px', fontSize: 12,
                width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Plus size={12} /> Добавить звено
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────────
export default function DistrictsTab() {
  const [districts, setDistricts] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingDistrict, setAddingDistrict] = useState(false);
  const [newDistrictName, setNewDistrictName] = useState('');
  const [districtLabel, setDistrictLabel] = useState('Район');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelVal, setLabelVal] = useState('Район');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, uRes, sRes] = await Promise.all([
        api.get('/districts'),
        api.get('/users'),
        api.get('/settings'),
      ]);
      setDistricts(dRes.data);
      setAllUsers(uRes.data.filter(u => u.role !== 'admin'));
      const lbl = sRes.data.district_label || 'Район';
      setDistrictLabel(lbl); setLabelVal(lbl);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const saveLabel = async () => {
    try {
      await api.put('/settings', { key: 'district_label', value: labelVal.trim() || 'Район' });
      setDistrictLabel(labelVal.trim() || 'Район');
      setEditingLabel(false);
    } catch { toast.error('Ошибка сохранения'); }
  };

  useEffect(() => { load(); }, [load]);

  const addDistrict = async () => {
    if (!newDistrictName.trim()) return;
    try {
      await api.post('/districts', { name: newDistrictName.trim() });
      setNewDistrictName(''); setAddingDistrict(false);
      load();
    } catch { toast.error('Ошибка создания района'); }
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--text3)' }}>Загрузка...</div>;

  const lbl = districtLabel;
  const lblLow = lbl.toLowerCase();

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Настройка названия группы */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>Название группы зданий:</span>
        {editingLabel ? (
          <>
            <input autoFocus value={labelVal} onChange={e => setLabelVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditingLabel(false); }}
              style={{ background: 'var(--bg3)', border: '1px solid var(--accent)', borderRadius: 4,
                padding: '3px 8px', color: 'var(--text)', fontSize: 13, width: 120 }} />
            <button onClick={saveLabel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', padding: 2 }}>
              <Check size={14} />
            </button>
            <button onClick={() => { setLabelVal(districtLabel); setEditingLabel(false); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2 }}>
              <X size={14} />
            </button>
          </>
        ) : (
          <span onClick={() => setEditingLabel(true)}
            style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            {lbl}
            <Edit2 size={11} style={{ color: 'var(--text3)' }} />
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>используется в интерфейсе</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>{districts.length} {lblLow}</div>
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          onClick={() => setAddingDistrict(true)}>
          <Plus size={14} /> Новый {lblLow}
        </button>
      </div>

      {addingDistrict && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input autoFocus placeholder={`Название`} value={newDistrictName}
            onChange={e => setNewDistrictName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addDistrict(); if (e.key === 'Escape') setAddingDistrict(false); }}
            style={{ flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 14 }} />
          <button className="btn-primary" onClick={addDistrict}>Создать</button>
          <button className="btn-secondary" onClick={() => setAddingDistrict(false)}>X</button>
        </div>
      )}

      {districts.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40, fontSize: 14 }}>
          Нет {lblLow}ов. Создайте первый.
        </div>
      ) : (
        districts.map(d => (
          <DistrictCard key={d.id} district={d} allUsers={allUsers} onReload={load} />
        ))
      )}
    </div>
  );
}
