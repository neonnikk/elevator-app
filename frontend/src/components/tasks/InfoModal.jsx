import { useState, useEffect, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function InfoModal({ building, task, onClose, onUpdate }) {
  const entrances = building.entrances || [];

  // --- 1. Подготовка данных ---
  const items = [];
  const isStructureSimple = entrances.length === 0;
  
  if (isStructureSimple) {
    items.push({ key: `b_${building.id}`, label: building.name, entrance_id: null, elevator_id: null });
  } else {
    entrances.forEach(entrance => {
      if (entrance.elevators.length > 1) {
        entrance.elevators.forEach(el => {
          items.push({ key: `el_${el.id}`, label: `${entrance.name} — ${el.name}`, entrance_id: entrance.id, elevator_id: el.id });
        });
      } else {
        items.push({ key: `en_${entrance.id}`, label: entrance.name, entrance_id: entrance.id, elevator_id: null });
      }
    });
  }

  const journalUnits = [];
  if (isStructureSimple) {
    journalUnits.push({ type: 'building', id: building.id, label: 'Журнал на здание' });
  } else {
    entrances.forEach(entrance => {
      if (entrance.elevators && entrance.elevators.length > 0) {
        entrance.elevators.forEach(el => {
          const label = entrance.elevators.length > 1 ? `${entrance.name} — ${el.name}` : entrance.name;
          journalUnits.push({ type: 'elevator', id: el.id, label: label });
        });
      } else {
        journalUnits.push({ type: 'entrance', id: entrance.id, label: entrance.name });
      }
    });
  }

  const [texts, setTexts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [to2, setTo2] = useState(false);
  const [to2Loading, setTo2Loading] = useState(false);
  const [elevatorTo2, setElevatorTo2] = useState({});   // { elevator_id: bool }
  const [entranceTo2, setEntranceTo2] = useState({});   // { entrance_id: bool }
  const [to2UnitLoading, setTo2UnitLoading] = useState({});
  const [journals, setJournals] = useState({});
  const [entranceJournals, setEntranceJournals] = useState({});
  const [buildingJournal, setBuildingJournal] = useState(false);
  const [journalLoading, setJournalLoading] = useState({});

  const year = task?.year || new Date().getFullYear();
  const month = task?.month || (new Date().getMonth() + 1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [infoRes, statusRes] = await Promise.all([
        api.get(`/buildings/${building.id}/info`),
        api.get(`/to2journal/building/${building.id}/${year}/${month}`),
      ]);
      const map = {};
      infoRes.data.forEach(row => {
        const key = row.elevator_id ? `el_${row.elevator_id}` : row.entrance_id ? `en_${row.entrance_id}` : `b_${building.id}`;
        map[key] = row.info_text;
      });
      setTexts(map);
      setTo2(statusRes.data.to2?.active || false);
      setElevatorTo2(statusRes.data.elevatorTo2 || {});
      setEntranceTo2(statusRes.data.entranceTo2 || {});
      setJournals(statusRes.data.journals || {});
      setEntranceJournals(statusRes.data.entranceJournals || {});
      setBuildingJournal(statusRes.data.buildingJournal || false);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [building.id, year, month]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = items.map(item => ({
        entrance_id: item.entrance_id,
        elevator_id: item.elevator_id,
        info_text: texts[item.key] || '',
      }));
      await api.put(`/buildings/${building.id}/info`, payload);
      toast.success('Сохранено');
      onClose();
    } catch { toast.error('Ошибка'); }
    finally { setSaving(false); }
  };

  // Обработчик ТО2 на лифт или подъезд
  const handleToggleTo2Unit = async (type, id, e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const key = `${type}_${id}`;
    setTo2UnitLoading(p => ({ ...p, [key]: true }));
    const current = type === 'elevator' ? !!elevatorTo2[id] : !!entranceTo2[id];
    try {
      if (current) {
        await api.delete(`/to2journal/to2/${type}/${id}/${year}/${month}`);
        if (type === 'elevator') setElevatorTo2(p => ({ ...p, [id]: false }));
        else setEntranceTo2(p => ({ ...p, [id]: false }));
        toast.success('ТО2 снято');
      } else {
        await api.post(`/to2journal/to2/${type}/${id}/${year}/${month}`);
        if (type === 'elevator') setElevatorTo2(p => ({ ...p, [id]: true }));
        else setEntranceTo2(p => ({ ...p, [id]: true }));
        toast.success('ТО2 установлено');
      }
      if (onUpdate) onUpdate();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setTo2UnitLoading(p => ({ ...p, [key]: false })); }
  };

  // Обработчики
  const handleToggleTo2 = async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setTo2Loading(true);
    try {
      if (to2) {
        await api.delete(`/to2journal/to2/${building.id}/${year}/${month}`);
        setTo2(false);
        toast.success('ТО2 снято');
      } else {
        await api.post(`/to2journal/to2/${building.id}/${year}/${month}`);
        setTo2(true);
        toast.success('ТО2 установлено');
      }
      if (onUpdate) onUpdate();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setTo2Loading(false); }
  };

  const handleToggleJournal = async (unit, e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    
    const key = `${unit.type}_${unit.id}`;
    setJournalLoading(p => ({ ...p, [key]: true }));

    let currentStatus = false;
    if (unit.type === 'elevator') currentStatus = journals[unit.id];
    else if (unit.type === 'entrance') currentStatus = entranceJournals[unit.id];
    else if (unit.type === 'building') currentStatus = buildingJournal;

    try {
      if (currentStatus) {
        if (unit.type === 'elevator') await api.delete(`/to2journal/journal/${unit.id}`);
        else if (unit.type === 'entrance') await api.delete(`/to2journal/journal/entrance/${unit.id}`);
        else if (unit.type === 'building') await api.delete(`/to2journal/journal/building/${unit.id}`);
        
        if (unit.type === 'elevator') setJournals(p => ({ ...p, [unit.id]: false }));
        else if (unit.type === 'entrance') setEntranceJournals(p => ({ ...p, [unit.id]: false }));
        else if (unit.type === 'building') setBuildingJournal(false);
        
        toast.success('Журнал снят');
      } else {
        if (unit.type === 'elevator') await api.post(`/to2journal/journal/${unit.id}`);
        else if (unit.type === 'entrance') await api.post(`/to2journal/journal/entrance/${unit.id}`);
        else if (unit.type === 'building') await api.post(`/to2journal/journal/building/${unit.id}`);

        if (unit.type === 'elevator') setJournals(p => ({ ...p, [unit.id]: true }));
        else if (unit.type === 'entrance') setEntranceJournals(p => ({ ...p, [unit.id]: true }));
        else if (unit.type === 'building') setBuildingJournal(true);

        toast.success('Журнал установлен');
      }
      if (onUpdate) onUpdate();
    } catch (err) { 
      toast.error(err.response?.data?.error || 'Ошибка'); 
    }
    finally { setJournalLoading(p => ({ ...p, [key]: false })); }
  };

  // Компонент чекбокса с защитой от всплытия
  const Checkbox = ({ checked, loading: ld, onClick, label, color }) => {
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ld && onClick) onClick(e);
    };

    return (
      <div
        onClick={handleClick}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: ld ? 'wait' : 'pointer', userSelect: 'none', padding: '4px 0' }}>
        <div style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
          border: `2px solid ${checked ? color : 'var(--border)'}`,
          background: checked ? color : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}>
          {checked && <Check size={12} color={color === 'var(--yellow)' ? '#000' : '#fff'} strokeWidth={3}/>}
        </div>
        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: checked ? 600 : 400 }}>{label}</span>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <span className="modal-title">Информация — {building.name}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">
          {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner"/></div> : (
            <>
              {/* ТО2 */}
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, border: to2 ? '1px solid var(--yellow)' : '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>ТО2 — на здание</div>
                <Checkbox
                  checked={to2}
                  loading={to2Loading}
                  onClick={handleToggleTo2}
                  label="ТО2 в этом месяце"
                  color="var(--yellow)"
                />
              </div>

              {/* ТО2 и Журнал по лифтам/подъездам — компактная таблица */}
              {journalUnits.length > 0 && (
                <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 12px', alignItems: 'center' }}>
                    {/* Заголовок */}
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {journalUnits[0]?.type === 'building' ? 'Здание' : journalUnits.length > 1 ? 'Лифт / Подъезд' : 'Объект'}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>ТО2</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Жур.</div>

                    {/* Строки по каждому лифту/подъезду */}
                    {journalUnits.map(unit => {
                      const jKey = `${unit.type}_${unit.id}`;
                      const journalChecked = unit.type === 'elevator' ? !!journals[unit.id]
                        : unit.type === 'entrance' ? !!entranceJournals[unit.id]
                        : buildingJournal;
                      const to2Checked = unit.type === 'elevator' ? !!elevatorTo2[unit.id]
                        : unit.type === 'entrance' ? !!entranceTo2[unit.id]
                        : false; // здание — не показываем здесь (есть отдельная галка выше)
                      const to2Key = `${unit.type}_${unit.id}`;

                      return [
                        <div key={`label_${jKey}`} style={{ fontSize: 13, color: 'var(--text)', paddingTop: 4, paddingBottom: 2, borderTop: '1px solid var(--border)' }}>
                          {unit.label}
                        </div>,
                        /* ТО2 — только для лифтов и подъездов, не для здания */
                        unit.type !== 'building' ? (
                          <div key={`to2_${jKey}`} style={{ display: 'flex', justifyContent: 'center', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                            <div onClick={e => handleToggleTo2Unit(unit.type, unit.id, e)}
                              style={{
                                width: 20, height: 20, borderRadius: 5, cursor: to2UnitLoading[to2Key] ? 'wait' : 'pointer',
                                border: `2px solid ${to2Checked ? 'var(--yellow)' : 'var(--border)'}`,
                                background: to2Checked ? 'var(--yellow)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s',
                              }}>
                              {to2Checked && <Check size={11} color="#000" strokeWidth={3}/>}
                            </div>
                          </div>
                        ) : <div key={`to2_${jKey}`} style={{ borderTop: '1px solid var(--border)' }}/>,
                        /* Журнал */
                        <div key={`jur_${jKey}`} style={{ display: 'flex', justifyContent: 'center', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                          <div onClick={e => handleToggleJournal(unit, e)}
                            style={{
                              width: 20, height: 20, borderRadius: 5, cursor: !!journalLoading[jKey] ? 'wait' : 'pointer',
                              border: `2px solid ${journalChecked ? 'var(--accent)' : 'var(--border)'}`,
                              background: journalChecked ? 'var(--accent)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.15s',
                            }}>
                            {journalChecked && <Check size={11} color="#fff" strokeWidth={3}/>}
                          </div>
                        </div>,
                      ];
                    })}
                  </div>
                </div>
              )}

              {/* Технические данные */}
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Технические данные
              </div>
              {items.map(item => (
                <div key={item.key} className="form-group">
                  <label className="form-label">{item.label}</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Технические данные, особенности, заметки..."
                    value={texts[item.key] || ''}
                    onChange={e => setTexts(prev => ({ ...prev, [item.key]: e.target.value }))}
                  />
                </div>
              ))}
            </>
          )}
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