/**
 * CommPage.jsx — страница «Связь» (диспетчерская система лифтов).
 * Иерархия: Пульт → Линия/VPN → Концентратор → Блок → Лифт
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Plus, Trash2, Edit2, Radio, ChevronDown, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

// ── Поле с автодополнением ────────────────────────────────────────────────────

function AutoInput({ field, value, onChange, placeholder, style }) {
  const [all, setAll] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    api.get(`/comm/autocomplete/${field}`).then(r => setAll(r.data)).catch(() => {});
  }, [field]);

  const suggestions = value?.trim()
    ? all.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : all.slice(0, 8);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input className="form-input" value={value || ''} placeholder={placeholder} style={style}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} />
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
          marginTop: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxHeight: 180, overflowY: 'auto',
        }}>
          {suggestions.map(s => (
            <div key={s} onMouseDown={() => { onChange(s); setOpen(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Единая форма добавления/редактирования блока ──────────────────────────────

function BlockFullForm({ block, building, allCenters, onSave, onCancel }) {
  const isEdit = !!block?.id;
  const inp = { padding: '6px 9px', fontSize: 13 };

  // Иерархия
  const [centerMode, setCenterMode] = useState('select');
  const [centerId, setCenterId]     = useState(block ? String(block.dispatch_center_id) : '');
  const [centerName, setCenterName] = useState('');
  const [lineMode, setLineMode]     = useState('select');
  const [lineId, setLineId]         = useState(block ? String(block.vpn_line_id) : '');
  const [lineName, setLineName]     = useState('');
  const [concMode, setConcMode]     = useState('select');
  const [concId, setConcId]         = useState(block ? String(block.concentrator_id) : '');
  const [concIp, setConcIp]         = useState('');
  const [concAddr, setConcAddr]     = useState('');

  // Данные блока
  const [form, setForm] = useState({
    block_number: block?.block_number ?? '',
    entrance_id:  block?.entrance_id  ? String(block.entrance_id)  : '',
    elevator_id:  block?.elevator_id  ? String(block.elevator_id)  : '',
    lift_type:    block?.lift_type    || '',
    block_type:   block?.block_type   || '',
    registrar:    block?.registrar    || '',
    camera:       block?.camera       || '',
    notes:        block?.notes        || '',
  });
  const [saving, setSaving] = useState(false);

  const lines = allCenters.find(c => String(c.id) === centerId)?.lines || [];
  const concs = lines.find(l => String(l.id) === lineId)?.concentrators || [];
  const entrances = building?.entrances || [];

  const F = ({ label, required, children }) => (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>
        {label}{required && <span style={{ color: 'var(--red)' }}> *</span>}
      </div>
      {children}
    </div>
  );

  const ModeBtn = ({ mode, current, onClick, children }) => (
    <button className={`btn btn-sm ${current === mode ? 'btn-primary' : 'btn-ghost'}`}
      style={{ fontSize: 11, padding: '2px 10px' }} onClick={onClick}>{children}</button>
  );

  const save = async () => {
    const num = parseInt(form.block_number);
    if (form.block_number === '' || isNaN(num) || num < 0 || num > 64)
      return toast.error('№ блока: укажите число от 0 до 64');

    setSaving(true);
    try {
      let finalConcId = concId;

      if (!isEdit) {
        let finalCenterId = centerId;
        if (centerMode === 'new') {
          if (!centerName.trim()) { toast.error('Введите название пульта'); setSaving(false); return; }
          const r = await api.post('/comm/dispatch-centers', { name: centerName.trim() });
          finalCenterId = String(r.data.id);
        }
        if (!finalCenterId) { toast.error('Выберите или создайте пульт'); setSaving(false); return; }

        let finalLineId = lineId;
        if (lineMode === 'new') {
          if (!lineName.trim()) { toast.error('Введите название линии'); setSaving(false); return; }
          const r = await api.post('/comm/lines', { name: lineName.trim(), dispatch_center_id: parseInt(finalCenterId) });
          finalLineId = String(r.data.id);
        }
        if (!finalLineId) { toast.error('Выберите или создайте линию'); setSaving(false); return; }

        if (concMode === 'new') {
          if (!concIp.trim()) { toast.error('Введите IP концентратора'); setSaving(false); return; }
          const r = await api.post('/comm/concentrators', { ip: concIp.trim(), address: concAddr.trim(), vpn_line_id: parseInt(finalLineId) });
          finalConcId = String(r.data.id);
        }
        if (!finalConcId) { toast.error('Выберите или создайте концентратор'); setSaving(false); return; }
      }

      const payload = {
        block_number:    num,
        concentrator_id: parseInt(finalConcId),
        building_id:     building.id,
        entrance_id:     form.entrance_id ? parseInt(form.entrance_id) : null,
        elevator_id:     form.elevator_id ? parseInt(form.elevator_id) : null,
        lift_type:  form.lift_type  || null,
        block_type: form.block_type || null,
        registrar:  form.registrar  || null,
        camera:     form.camera     || null,
        notes:      form.notes      || null,
      };

      if (isEdit) {
        await api.put(`/comm/blocks/${block.id}`, payload);
        toast.success('Блок обновлён');
      } else {
        await api.post('/comm/blocks', payload);
        toast.success('Блок добавлен');
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
        {isEdit ? `Редактировать блок №${String(block.block_number).padStart(2,'0')}` : 'Новый блок связи'}
      </div>

      {/* Иерархия — только при создании нового блока */}
      {!isEdit && (
        <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
            Иерархия связи
          </div>

          {/* Пульт */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 80 }}>Пульт *</span>
              <ModeBtn mode="select" current={centerMode} onClick={() => setCenterMode('select')}>Выбрать</ModeBtn>
              <ModeBtn mode="new" current={centerMode} onClick={() => setCenterMode('new')}>Новый</ModeBtn>
            </div>
            {centerMode === 'select'
              ? <select className="form-input" style={inp} value={centerId}
                  onChange={e => { setCenterId(e.target.value); setLineId(''); setConcId(''); }}>
                  <option value="">— выберите пульт —</option>
                  {allCenters.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              : <input className="form-input" style={inp} placeholder="ДПУЛ КЛ 96"
                  value={centerName} onChange={e => setCenterName(e.target.value)} />
            }
          </div>

          {/* Линия/VPN */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 80 }}>Линия/VPN *</span>
              <ModeBtn mode="select" current={lineMode} onClick={() => setLineMode('select')}>Выбрать</ModeBtn>
              <ModeBtn mode="new" current={lineMode} onClick={() => setLineMode('new')}>Новая</ModeBtn>
            </div>
            {lineMode === 'select'
              ? <select className="form-input" style={inp} value={lineId}
                  onChange={e => { setLineId(e.target.value); setConcId(''); }}>
                  <option value="">— выберите линию —</option>
                  {lines.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                </select>
              : <input className="form-input" style={inp} placeholder="Линия 1 / VPN 2"
                  value={lineName} onChange={e => setLineName(e.target.value)} />
            }
          </div>

          {/* Концентратор */}
          <div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 80 }}>IP Конц. *</span>
              <ModeBtn mode="select" current={concMode} onClick={() => setConcMode('select')}>Выбрать</ModeBtn>
              <ModeBtn mode="new" current={concMode} onClick={() => setConcMode('new')}>Новый</ModeBtn>
            </div>
            {concMode === 'select'
              ? <select className="form-input" style={inp} value={concId} onChange={e => setConcId(e.target.value)}>
                  <option value="">— выберите концентратор —</option>
                  {concs.map(c => <option key={c.id} value={String(c.id)}>{c.ip}{c.address ? ` · ${c.address}` : ''}</option>)}
                </select>
              : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input className="form-input" style={inp} placeholder="IP (192.168.1.1)"
                    value={concIp} onChange={e => setConcIp(e.target.value)} />
                  <input className="form-input" style={inp} placeholder="Адрес установки"
                    value={concAddr} onChange={e => setConcAddr(e.target.value)} />
                </div>
            }
          </div>
        </div>
      )}

      {/* Данные блока */}
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <F label="№ Блока (0–64)" required>
          <input className="form-input" type="number" min="0" max="64" style={inp}
            value={form.block_number} placeholder="00"
            onChange={e => setForm(f => ({ ...f, block_number: e.target.value }))} />
        </F>
        <F label="Подъезд">
          <select className="form-input" style={inp} value={form.entrance_id}
            onChange={e => setForm(f => ({ ...f, entrance_id: e.target.value, elevator_id: '' }))}>
            <option value="">— не выбран —</option>
            {entrances.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
          </select>
        </F>
        <F label="Лифт">
          <select className="form-input" style={inp} value={form.elevator_id}
            onChange={e => setForm(f => ({ ...f, elevator_id: e.target.value }))}>
            <option value="">— не выбран —</option>
            {entrances
              .filter(e => !form.entrance_id || String(e.id) === form.entrance_id)
              .flatMap(e => (e.elevators || []).map(el => (
                <option key={el.id} value={String(el.id)}>{e.name} / {el.name}</option>
              )))}
          </select>
        </F>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <F label="Тип лифта">
          <AutoInput field="lift_type" value={form.lift_type} style={inp} placeholder="Тип лифта"
            onChange={v => setForm(f => ({ ...f, lift_type: v }))} />
        </F>
        <F label="Тип блока">
          <AutoInput field="block_type" value={form.block_type} style={inp} placeholder="Тип блока"
            onChange={v => setForm(f => ({ ...f, block_type: v }))} />
        </F>
        <F label="Регистратор">
          <AutoInput field="registrar" value={form.registrar} style={inp} placeholder="Регистратор"
            onChange={v => setForm(f => ({ ...f, registrar: v }))} />
        </F>
        <F label="Камера">
          <AutoInput field="camera" value={form.camera} style={inp} placeholder="Модель/описание"
            onChange={v => setForm(f => ({ ...f, camera: v }))} />
        </F>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Доп. информация</div>
        <textarea className="form-input" rows={2} style={{ ...inp, resize: 'vertical' }}
          value={form.notes} placeholder="Примечания"
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Отмена</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить блок'}
        </button>
      </div>
    </div>
  );
}

// ── Модалка здания ────────────────────────────────────────────────────────────

function BuildingCommModal({ building: initBuilding, canEdit, onClose, onRefreshList }) {
  const [building, setBuilding]     = useState(null);
  const [allCenters, setAllCenters] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [editId, setEditId]         = useState(null);
  const [openDC, setOpenDC]   = useState({});
  const [openVPN, setOpenVPN] = useState({});
  const [openCon, setOpenCon] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bR, cR] = await Promise.all([
        api.get(`/comm/buildings/${initBuilding.id}`),
        api.get('/comm/dispatch-centers'),
      ]);
      setBuilding(bR.data);
      setAllCenters(cR.data);
      const dc = {}, vl = {}, cn = {};
      (bR.data.blocks || []).forEach(b => {
        dc[b.dispatch_center_id] = true;
        vl[b.vpn_line_id]        = true;
        cn[b.concentrator_id]    = true;
      });
      setOpenDC(dc); setOpenVPN(vl); setOpenCon(cn);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [initBuilding.id]);

  useEffect(() => { load(); }, [load]);

  const hierarchy = (() => {
    if (!building?.blocks?.length) return [];
    const map = {};
    building.blocks.forEach(b => {
      if (!map[b.dispatch_center_id]) map[b.dispatch_center_id] = { id: b.dispatch_center_id, name: b.dispatch_center_name, lines: {} };
      const dc = map[b.dispatch_center_id];
      if (!dc.lines[b.vpn_line_id]) dc.lines[b.vpn_line_id] = { id: b.vpn_line_id, name: b.vpn_line_name, concentrators: {} };
      const ln = dc.lines[b.vpn_line_id];
      if (!ln.concentrators[b.concentrator_id]) ln.concentrators[b.concentrator_id] = { id: b.concentrator_id, ip: b.concentrator_ip, address: b.concentrator_address, blocks: [] };
      ln.concentrators[b.concentrator_id].blocks.push(b);
    });
    return Object.values(map).map(dc => ({ ...dc, lines: Object.values(dc.lines).map(ln => ({ ...ln, concentrators: Object.values(ln.concentrators) })) }));
  })();

  const del = async (id) => {
    if (!confirm('Удалить блок?')) return;
    try { await api.delete(`/comm/blocks/${id}`); load(); onRefreshList(); }
    catch { toast.error('Ошибка'); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <span className="modal-title">
            <Radio size={15} style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--accent)' }}/>
            {initBuilding.name}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner"/></div>
          ) : (
            <>
              {/* Инфо здания */}
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {building.address && <span><strong>Адрес:</strong> {building.address}</span>}
                <span><strong>Подъездов:</strong> {building.entrances?.length || 0}</span>
                <span><strong>Блоков связи:</strong> {building.blocks?.length || 0}</span>
              </div>

              {/* Кнопка добавить */}
              {canEdit && !showAdd && (
                <button className="btn btn-primary" style={{ width: '100%', marginBottom: 14 }}
                  onClick={() => { setShowAdd(true); setEditId(null); }}>
                  <Plus size={14}/> Добавить блок связи
                </button>
              )}

              {/* Форма добавления */}
              {canEdit && showAdd && (
                <BlockFullForm block={null} building={building} allCenters={allCenters}
                  onSave={() => { setShowAdd(false); load(); onRefreshList(); }}
                  onCancel={() => setShowAdd(false)} />
              )}

              {/* Пусто */}
              {!hierarchy.length && !showAdd && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontSize: 13 }}>
                  Нет данных связи. Нажмите «Добавить блок связи».
                </div>
              )}

              {/* Иерархия */}
              {hierarchy.map(dc => (
                <div key={dc.id} style={{ marginBottom: 10, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div onClick={() => setOpenDC(p => ({ ...p, [dc.id]: !p[dc.id] }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'var(--bg3)', cursor: 'pointer', userSelect: 'none' }}>
                    {openDC[dc.id] ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                    <Radio size={13} style={{ color: 'var(--accent)' }}/>
                    <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>Пульт: {dc.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {dc.lines.reduce((s, l) => s + l.concentrators.reduce((s2, c) => s2 + c.blocks.length, 0), 0)} блок.
                    </span>
                  </div>

                  {openDC[dc.id] && (
                    <div style={{ padding: '8px 12px' }}>
                      {dc.lines.map(line => (
                        <div key={line.id} style={{ marginBottom: 8 }}>
                          <div onClick={() => setOpenVPN(p => ({ ...p, [line.id]: !p[line.id] }))}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg2)', borderRadius: 6, cursor: 'pointer', userSelect: 'none', marginBottom: 4 }}>
                            {openVPN[line.id] ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                            <span style={{ fontWeight: 600, fontSize: 12, flex: 1, color: 'var(--accent)' }}>Линия/VPN: {line.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{line.concentrators.length} конц.</span>
                          </div>

                          {openVPN[line.id] && (
                            <div style={{ paddingLeft: 10 }}>
                              {line.concentrators.map(con => (
                                <div key={con.id} style={{ marginBottom: 6, border: '1px solid var(--border)', borderRadius: 8 }}>
                                  <div onClick={() => setOpenCon(p => ({ ...p, [con.id]: !p[con.id] }))}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--bg)', cursor: 'pointer', userSelect: 'none' }}>
                                    {openCon[con.id] ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                                    <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>
                                      IP Конц.: <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{con.ip}</span>
                                      {con.address && <span style={{ color: 'var(--text2)', fontWeight: 400 }}> · {con.address}</span>}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{con.blocks.length} блок.</span>
                                  </div>

                                  {openCon[con.id] && (
                                    <div style={{ padding: '6px 10px' }}>
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                          <tr style={{ background: 'var(--bg3)', fontSize: 10, textTransform: 'uppercase' }}>
                                            <th style={{ padding: '4px 6px', width: 40, textAlign: 'center', color: 'var(--text2)', fontWeight: 600 }}>№</th>
                                            <th style={{ padding: '4px 6px', color: 'var(--text2)', fontWeight: 600 }}>Лифт</th>
                                            <th style={{ padding: '4px 6px', color: 'var(--text2)', fontWeight: 600 }}>Тип лифта</th>
                                            <th style={{ padding: '4px 6px', color: 'var(--text2)', fontWeight: 600 }}>Тип блока</th>
                                            <th style={{ padding: '4px 6px', color: 'var(--text2)', fontWeight: 600 }}>Регистратор</th>
                                            <th style={{ padding: '4px 6px', color: 'var(--text2)', fontWeight: 600 }}>Камера</th>
                                            {canEdit && <th style={{ width: 52 }}/>}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {[...con.blocks].sort((a, b) => a.block_number - b.block_number).map(block => (
                                            <>
                                              <tr key={block.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)', fontSize: 13 }}>
                                                  {String(block.block_number).padStart(2, '0')}
                                                </td>
                                                <td style={{ padding: '5px 6px', color: 'var(--text2)' }}>
                                                  {block.entrance_name && <span style={{ color: 'var(--text3)' }}>{block.entrance_name} / </span>}
                                                  {block.elevator_name || '—'}
                                                </td>
                                                <td style={{ padding: '5px 6px' }}>{block.lift_type || '—'}</td>
                                                <td style={{ padding: '5px 6px' }}>{block.block_type || '—'}</td>
                                                <td style={{ padding: '5px 6px' }}>{block.registrar || '—'}</td>
                                                <td style={{ padding: '5px 6px' }}>{block.camera || '—'}</td>
                                                {canEdit && (
                                                  <td style={{ padding: '5px 6px' }}>
                                                    <div style={{ display: 'flex', gap: 3 }}>
                                                      <button className="btn btn-ghost btn-sm btn-icon"
                                                        onClick={() => { setEditId(editId === block.id ? null : block.id); setShowAdd(false); }}>
                                                        <Edit2 size={11}/>
                                                      </button>
                                                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => del(block.id)}>
                                                        <Trash2 size={11}/>
                                                      </button>
                                                    </div>
                                                  </td>
                                                )}
                                              </tr>
                                              {block.notes && (
                                                <tr key={`${block.id}-n`} style={{ borderBottom: '1px solid var(--border)' }}>
                                                  <td colSpan={7} style={{ padding: '2px 6px 5px 20px', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
                                                    {block.notes}
                                                  </td>
                                                </tr>
                                              )}
                                              {editId === block.id && (
                                                <tr key={`${block.id}-e`}>
                                                  <td colSpan={7} style={{ padding: '8px 4px' }}>
                                                    <BlockFullForm
                                                      block={{ ...block, dispatch_center_id: dc.id, vpn_line_id: line.id }}
                                                      building={building} allCenters={allCenters}
                                                      onSave={() => { setEditId(null); load(); onRefreshList(); }}
                                                      onCancel={() => setEditId(null)} />
                                                  </td>
                                                </tr>
                                              )}
                                            </>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Структура здания */}
              {building.entrances?.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Структура здания
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {building.entrances.map(ent => (
                      <div key={ent.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{ent.name}</div>
                        {ent.elevators?.map(el => {
                          const blk = building.blocks?.find(b => b.elevator_id === el.id);
                          return (
                            <div key={el.id} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: blk ? 'var(--green)' : 'var(--text3)' }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: blk ? 'var(--green)' : 'var(--text3)', flexShrink: 0 }}/>
                              {el.name}{blk ? ` · №${String(blk.block_number).padStart(2,'0')}` : ''}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

// ── Основная страница ─────────────────────────────────────────────────────────

export default function CommPage() {
  const { user } = useAuth();
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState(null);

  const canEdit = user?.role === 'admin' || !!user?.perm_comm;

  const load = useCallback(async () => {
    try {
      const r = await api.get('/comm/buildings');
      setBuildings(r.data);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = buildings.filter(b => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return b.name?.toLowerCase().includes(q) || b.address?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Связь</h1>
      </div>
      <div className="page-body">
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }}/>
          <input className="form-input" style={{ paddingLeft: 36 }}
            placeholder="Поиск по названию или адресу..."
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
              <X size={14}/>
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner"/></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Radio size={40} strokeWidth={1}/>
            <h3>{search ? 'Ничего не найдено' : 'Нет адресов'}</h3>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}>Адрес</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', width: 80 }}>Блоков</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id} onClick={() => setSelected(b)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                      {b.address && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{b.address}</div>}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      {b.comm_count > 0
                        ? <span style={{ background: 'var(--accent)18', color: 'var(--accent)', fontWeight: 700, fontSize: 13, padding: '2px 10px', borderRadius: 20 }}>{b.comm_count}</span>
                        : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <BuildingCommModal building={selected} canEdit={canEdit}
          onClose={() => setSelected(null)} onRefreshList={load} />
      )}
    </div>
  );
}
