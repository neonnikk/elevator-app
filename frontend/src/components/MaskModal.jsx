import { useState, useEffect, useCallback } from 'react';
import { X, Check, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function MaskModal({ user, onClose }) {
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  // hidden: Set of keys like "elevator_123" or "entrance_456"
  const [hidden, setHidden]       = useState(new Set());
  const [expanded, setExpanded]   = useState({}); // building_id → bool

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/mask/${user.id}`);
      setBuildings(r.data);
      // Раскрываем все здания по умолчанию если их мало
      const exp = {};
      r.data.forEach(b => { exp[b.id] = r.data.length <= 5; });
      setExpanded(exp);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const toggleHidden = (type, id) => {
    const key = `${type}_${id}`;
    setHidden(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const hiddenList = [];
      for (const key of hidden) {
        const [type, id] = key.split('_');
        // Найти building_id
        let building_id = null;
        for (const b of buildings) {
          if (type === 'elevator') {
            for (const ent of b.entrances) {
              if ((ent.elevators || []).some(el => String(el.id) === id)) {
                building_id = b.id; break;
              }
            }
          } else {
            if (b.entrances.some(ent => String(ent.id) === id)) building_id = b.id;
          }
          if (building_id) break;
        }
        if (building_id) hiddenList.push({ type, id: parseInt(id), building_id });
      }
      await api.put(`/mask/${user.id}`, { hidden: hiddenList });
      toast.success('Маска сохранена');
      onClose();
    } catch { toast.error('Ошибка сохранения'); }
    finally { setSaving(false); }
  };

  const toggleBuilding = (buildingId) => {
    setExpanded(p => ({ ...p, [buildingId]: !p[buildingId] }));
  };

  // Показать/скрыть все элементы здания
  const toggleAllInBuilding = (b) => {
    const allKeys = [];
    for (const ent of b.entrances) {
      if (ent.type === 'entrance_with_elevators') {
        for (const el of ent.elevators) allKeys.push(`elevator_${el.id}`);
      } else {
        allKeys.push(`entrance_${ent.id}`);
      }
    }
    const allHidden = allKeys.every(k => hidden.has(k));
    setHidden(prev => {
      const next = new Set(prev);
      if (allHidden) { allKeys.forEach(k => next.delete(k)); }
      else            { allKeys.forEach(k => next.add(k)); }
      return next;
    });
  };

  // Считаем видимых/скрытых в здании
  const getBuildingStats = (b) => {
    let total = 0, hiddenCount = 0;
    for (const ent of b.entrances) {
      if (ent.type === 'entrance_with_elevators') {
        for (const el of ent.elevators) {
          total++;
          if (hidden.has(`elevator_${el.id}`)) hiddenCount++;
        }
      } else {
        total++;
        if (hidden.has(`entrance_${ent.id}`)) hiddenCount++;
      }
    }
    return { total, hiddenCount, visibleCount: total - hiddenCount };
  };

  const CB = ({ checked, onChange, label, indent = 0 }) => (
    <div onClick={onChange}
      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none',
        padding: '4px 0', paddingLeft: indent }}>
      <div style={{
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        border: `2px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
        background: checked ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s',
      }}>
        {checked && <Check size={11} color="#fff" strokeWidth={3}/>}
      </div>
      <span style={{ fontSize: 13, color: checked ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <span className="modal-title">Маска — {user.display_name}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.5 }}>
            Отметьте галками лифты/подъезды которые <strong>видит</strong> пользователь на вкладке ТО.
            Снимите галку чтобы скрыть. Если все скрыты — здание не отображается.
          </p>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner"/></div>
          ) : buildings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontSize: 13 }}>
              Пользователь не входит ни в один район
            </div>
          ) : buildings.map(b => {
            const stats = getBuildingStats(b);
            const isExpanded = expanded[b.id];
            const allHidden = stats.hiddenCount === stats.total && stats.total > 0;

            return (
              <div key={b.id} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {/* Заголовок здания */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg3)', cursor: 'pointer' }}>
                  <div onClick={() => toggleBuilding(b.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    {isExpanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.name}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: allHidden ? 'var(--red)' : stats.hiddenCount > 0 ? 'var(--yellow)' : 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {stats.visibleCount}/{stats.total} видимо
                  </span>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px', flexShrink: 0 }}
                    onClick={() => toggleAllInBuilding(b)}>
                    {allHidden ? 'Показать все' : 'Скрыть все'}
                  </button>
                </div>

                {/* Лифты/подъезды */}
                {isExpanded && (
                  <div style={{ padding: '6px 12px 8px' }}>
                    {b.entrances.map(ent => {
                      if (ent.type === 'entrance_with_elevators') {
                        return (
                          <div key={ent.id}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', padding: '4px 0 2px', marginTop: 4 }}>
                              {ent.name}
                            </div>
                            {ent.elevators.map(el => (
                              <CB key={el.id}
                                checked={!hidden.has(`elevator_${el.id}`)}
                                onChange={() => toggleHidden('elevator', el.id)}
                                label={el.name}
                                indent={12}
                              />
                            ))}
                          </div>
                        );
                      } else {
                        return (
                          <CB key={ent.id}
                            checked={!hidden.has(`entrance_${ent.id}`)}
                            onChange={() => toggleHidden('entrance', ent.id)}
                            label={ent.name}
                          />
                        );
                      }
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить маску'}
          </button>
        </div>
      </div>
    </div>
  );
}
