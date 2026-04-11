import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Check, History, BarChart3, Plus, X, ClipboardList, Info, Download, Search } from 'lucide-react';
import TaskHistory from '../components/tasks/TaskHistory';
import YearlyView from '../components/tasks/YearlyView';
import InfoModal from '../components/tasks/InfoModal';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { useViewMode } from '../contexts/ViewModeContext';
import socket from '../utils/socket';
import { exportToExcel, exportToPDF } from '../utils/export';
import { MONTHS_RU, MONTHS_SHORT, STATUS_LABELS, parseDate, getAdjustedDueDate, formatDueDate, getTosvDate } from '../utils/constants';


const SORT_KEY = (uid) => `tasks_sort_${uid}`;
const getSavedSort = (uid) => { try { return localStorage.getItem(SORT_KEY(uid)) || 'status'; } catch { return 'status'; } };
const saveSort = (uid, val) => { try { localStorage.setItem(SORT_KEY(uid), val); } catch {} };
const RECORD_STATUS = { in_progress: 'В работе', completed: 'Выполнено', cancelled: 'Отменено' };

const STATUS_COLORS_MAP = { pending: 'var(--text3)', in_progress: 'var(--yellow)', completed: 'var(--green)', overdue: 'var(--red)' };

function StatusBadge({ status }) {
  const { isMobile } = useViewMode();
  if (isMobile) {
    return (
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: STATUS_COLORS_MAP[status] || 'var(--text3)',
        flexShrink: 0,
      }} />
    );
  }
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

// Подсчёт ожидаемых чекбоксов из структуры здания
function countExpected(building) {
  const entrances = building.entrances || [];
  if (!entrances.length) return 1; // один чекбокс на уровне всего здания
  return entrances.reduce((sum, e) => sum + (e.elevators.length > 1 ? e.elevators.length : 1), 0);
}

function countDone(completions, building) {
  const entrances = building.entrances || [];
  if (!entrances.length) {
    return completions.filter(c => c.completion_type === 'building' && c.is_completed).length;
  }
  return completions.filter(c => {
    if (c.completion_type === 'elevator') return c.is_completed;
    if (c.completion_type === 'entrance') return c.is_completed;
    return false;
  }).length;
}

function ProgressBar({ completions, building, status }) {
  const total = countExpected(building);
  const done = countDone(completions, building);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 80 }}>
      <div className="progress-bar" style={{ flex: 1 }}>
        <div className={`progress-fill ${status}`} style={{ width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 34 }}>{done}/{total}</span>
    </div>
  );
}

function QuickRecordModal({ building, prefillTitle, onClose, onSaved }) {
  const [form, setForm] = useState({ title: prefillTitle || '', description: '', status: 'in_progress' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim()) return toast.error('Введите название');
    setSaving(true);
    try {
      await api.post('/records', { ...form, building_id: building.id });
      toast.success('Запись добавлена');
      onSaved(); onClose();
    } catch { toast.error('Ошибка'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Новая запись — {building.name}</span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Название</label>
            <input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              placeholder="Описание работы" autoFocus onKeyDown={e => e.key === 'Enter' && save()} />
          </div>
          <div className="form-group">
            <label className="form-label">Описание</label>
            <textarea className="form-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              placeholder="Дополнительные детали..." rows={3} />
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
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Сохранение...' : 'Добавить'}</button>
        </div>
      </div>
    </div>
  );
}

function BuildingRecords({ buildingId, refreshKey }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/records?buildingId=${buildingId}`).then(r => {
      setRecords(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [buildingId, refreshKey]);

  if (loading) return <div style={{ padding: 8, textAlign: 'center' }}><div className="spinner" /></div>;
  if (!records.length) return <p style={{ color: 'var(--text2)', fontSize: 13, padding: '4px 0' }}>Нет записей по этому объекту</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {records.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', background: 'var(--bg2)', borderRadius: 7, border: '1px solid var(--border)' }}>
          <span className={`badge badge-${r.status}`} style={{ flexShrink: 0, marginTop: 1 }}>{RECORD_STATUS[r.status]}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.title}</div>
            {r.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{r.description}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div title={r.user_name} style={{ width: 20, height: 20, borderRadius: '50%', background: r.user_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white' }}>
              {r.user_name?.split(' ').map(w => w[0]).join('').slice(0,2)}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{parseDate(r.created_at).toLocaleDateString('ru')}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Маленькая кнопка добавления заявки (рядом с чекбоксом)
function AddRecordBtn({ label, onClick }) {
  const { isMobile } = useViewMode();
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ fontSize: 11.5, color: 'var(--accent)', padding: '3px 8px', height: 'auto' }}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      <Plus size={11} />{!isMobile && <span> {label || 'Запись'}</span>}
    </button>
  );
}


const TaskCard = memo(function TaskCard({ task, onUpdate, onRefresh, forceExpanded }) {
  const { user } = useAuth();
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = forceExpanded !== undefined ? forceExpanded : localExpanded;
  const [showHistory, setShowHistory] = useState(false);
  const [showYearly, setShowYearly] = useState(false);
  const [showRecords, setShowRecords] = useState(false);
  const [recordModal, setRecordModal] = useState(null);
  const [recordsKey, setRecordsKey] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  // elevator_info: { [elevator_id]: info_text } — загружается при раскрытии
  const [elevatorInfo, setElevatorInfo] = useState({});
  const [elevatorInfoLoaded, setElevatorInfoLoaded] = useState(false);

  // Загружаем elevator_info когда карточка раскрыта и галка включена
  // useEffect реагирует и на ручное раскрытие и на forceExpanded
  useEffect(() => {
    if (expanded && !!user?.pref_show_elevator_info && !elevatorInfoLoaded) {
      setElevatorInfoLoaded(true);
      api.get(`/buildings/${task.building?.id}/info`).then(r => {
        const map = {};
        r.data.forEach(row => {
          const txt = row.info_text?.trim();
          if (!txt) return;
          // elevator_id есть — привязано к конкретному лифту
          if (row.elevator_id) { map[`el_${row.elevator_id}`] = txt; }
          // только entrance_id — один лифт в подъезде
          else if (row.entrance_id) { map[`en_${row.entrance_id}`] = txt; }
          // только building — простое здание без подъездов
          else { map[`b_${task.building?.id}`] = txt; }
        });
        setElevatorInfo(map);
      }).catch(() => {});
    }
  }, [expanded, user?.pref_show_elevator_info, elevatorInfoLoaded, task.building?.id]);

  const setExpanded = (v) => setLocalExpanded(v);

  const building = task.building;
  const entrances = building.entrances || [];
  const completions = task.completions || [];
  const isSimple = entrances.length === 0;
  // canCheck объявляем заранее — используется в чекбоксе всего здания
  const canCheckEarly = (user?.role === 'admin' || user?.perm_complete_others);

  const getCompletion = (type, id) => {
    if (type === 'building') return completions.find(c => c.completion_type === 'building');
    if (type === 'entrance') return completions.find(c => c.completion_type === 'entrance' && c.entrance_id === id);
    if (type === 'elevator') return completions.find(c => c.completion_type === 'elevator' && c.elevator_id === id);
    return null;
  };

  const toggle = async (type, id, currentlyDone, completionUserId) => {
    // Пункт 12: confirm при снятии чужой отметки
    if (currentlyDone && completionUserId && completionUserId !== user.id) {
      if (!confirm('Снять отметку, поставленную другим пользователем?')) return;
    }
    try {
      const body = { completion_type: type, is_completed: !currentlyDone };
      if (type === 'elevator') body.elevator_id = id;
      else if (type === 'entrance') body.entrance_id = id;
      else body.building_id = building.id;
      const r = await api.post(`/tasks/${task.id}/complete`, body);
      onUpdate(task.id, r.data);
      toast.success(!currentlyDone ? '✓ Отмечено' : 'Отметка снята', { id: `toggle-${task.id}` });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const canCheck = user.role === 'admin' || user.perm_complete_others || building.assignedUsers?.some(u => u.id === user.id);

  const openRecord = (prefillTitle) => setRecordModal({ prefillTitle });

  // --- ИЗМЕНЕНИЕ: Проверка журнала на трех уровнях ---
  // Проверяем журнал на уровне здания
  const hasBuildingJournal = building.journal;
  
  // Проверяем журналы на уровне подъездов
  const hasEntranceJournal = entrances.some(e => e.journal);
  
  // Проверяем журналы на уровне лифтов
  const hasElevatorJournal = entrances.some(e => (e.elevators || []).some(el => el.journal));
  
  // Итоговый флаг: есть ли хоть какой-то журнал
  const hasAnyJournal = hasBuildingJournal || hasEntranceJournal || hasElevatorJournal;

  return (
    <div className={`task-building-card ${task.status}${expanded ? " expanded" : ""}`}>
      <div className="task-card-header" style={{ gap: 8 }}>
        {/* Быстрый чекбокс на уровне всего здания */}
        {(() => {
          const buildingComp = completions.find(c => c.completion_type === 'building');
          const allDone = isSimple
            ? !!buildingComp?.is_completed
            : completions.length > 0 && completions.every(c => c.is_completed);
          const someDone = !allDone && completions.some(c => c.is_completed);
          return (
            <div
              style={{ flexShrink: 0 }}
              title="Отметить весь дом"
              onClick={e => {
                e.stopPropagation();
                if (isSimple) {
                  toggle('building', building.id, buildingComp?.is_completed, buildingComp?.completed_by);
                } else {
                  const want = !allDone; // true = отметить всё, false = снять все отметки
                  const calls = [];
                  entrances.forEach(entrance => {
                    if (entrance.elevators.length > 1) {
                      entrance.elevators.forEach(el => {
                        const c = completions.find(x => x.completion_type === 'elevator' && x.elevator_id === el.id);
                        if (!!c?.is_completed !== want) calls.push(() => toggle('elevator', el.id, !!c?.is_completed, c?.completed_by));
                      });
                    } else {
                      const c = completions.find(x => x.completion_type === 'entrance' && x.entrance_id === entrance.id);
                      if (!!c?.is_completed !== want) calls.push(() => toggle('entrance', entrance.id, !!c?.is_completed, c?.completed_by));
                    }
                  });
                  // Выполняем последовательно чтобы избежать гонки запросов
                  calls.reduce((p, fn) => p.then(fn), Promise.resolve());
                }
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 5,
                border: `2px solid ${allDone ? 'var(--accent)' : someDone ? 'var(--accent)' : 'var(--border)'}`,
                background: allDone ? 'var(--accent)' : someDone ? 'var(--accent-dim)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', cursor: 'pointer',
              }}>
                {allDone && <Check size={11} color="white" strokeWidth={3}/>}
                {someDone && !allDone && <div style={{ width: 8, height: 2, background: 'var(--accent)', borderRadius: 1 }}/>}
              </div>
            </div>
          );
        })()}
        <div onClick={() => setExpanded(!expanded)} style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0 }}>
        <StatusBadge status={task.status} />
        <div className="task-card-name">{building.name}</div>
        <div className="task-card-meta">
          <ProgressBar completions={completions} building={building} status={task.status} />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {(task.to2 || task.hasAnyTo2) && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--yellow)', color: '#000', lineHeight: 1.4, whiteSpace: 'nowrap' }}>ТО2</span>
            )}
            {/* ИЗМЕНЕНИЕ: Метка Жур. проверяет три уровня */}
            {hasAnyJournal && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--accent)', color: '#fff', lineHeight: 1.4, whiteSpace: 'nowrap' }}>Жур.</span>
            )}
          </div>
          {expanded ? <ChevronUp size={16} color="var(--text2)" /> : <ChevronDown size={16} color="var(--text2)" />}
        </div>
        </div>
      </div>

      {expanded && (
        <div className="task-card-body">

          {isSimple ? (
            <div>
              <div className="elevator-item" onClick={() => {
                const c = getCompletion('building');
                if (canCheck) toggle('building', building.id, c?.is_completed, c?.completed_by);
              }}>
                <div className={`checkbox-custom ${getCompletion('building')?.is_completed ? 'checked' : ''}`}>
                  {getCompletion('building')?.is_completed && <Check size={12} />}
                </div>
                <span className="elevator-name">ТО выполнено</span>
                {getCompletion('building')?.user_name && (
                  <span className="completion-meta">
                    <span style={{ color: getCompletion('building').user_color }}>{getCompletion('building').user_name}</span>
                    {' · '}{parseDate(getCompletion('building').completed_at).toLocaleDateString('ru')}
                  </span>
                )}
              </div>
              <div style={{ paddingLeft: 8, marginTop: 4 }}>
                <AddRecordBtn label="Добавить запись" onClick={() => openRecord(`ТО — ${building.name}`)} />
              </div>
            </div>
          ) : (
            entrances.map(entrance => {
              const hasMultiElevators = entrance.elevators.length > 1;
              const entranceCompletion = getCompletion('entrance', entrance.id);
              const allDone = hasMultiElevators
                ? entrance.elevators.every(el => getCompletion('elevator', el.id)?.is_completed)
                : entranceCompletion?.is_completed;

              return (
                <div key={entrance.id} className="entrance-section">
                  {/* Строка заголовка подъезда */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {!hasMultiElevators ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div className="elevator-item"
                          onClick={() => canCheck && toggle('entrance', entrance.id, entranceCompletion?.is_completed, entranceCompletion?.completed_by)}>
                          <div className={`checkbox-custom ${entranceCompletion?.is_completed ? 'checked' : ''}`}>
                            {entranceCompletion?.is_completed && <Check size={12} />}
                          </div>
                          <span className="elevator-name" style={{ fontWeight: 600 }}>{entrance.name}</span>
                          {entranceCompletion?.user_name && (
                            <span className="completion-meta">
                              <span style={{ color: entranceCompletion.user_color }}>{entranceCompletion.user_name}</span>
                              {' · '}{parseDate(entranceCompletion.completed_at).toLocaleDateString('ru')}
                            </span>
                          )}
                          {/* Метки ТО2 и Жур. для подъезда */}
                          {entrance.to2 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'var(--yellow)', color: '#000', marginLeft: 4 }}>ТО2</span>}
                          {entrance.journal && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'var(--accent)', color: '#fff', marginLeft: 2 }}>Жур.</span>}
                        </div>
                        {/* Информация о лифте для подъезда с одним лифтом */}
                        {!!user?.pref_show_elevator_info && (elevatorInfo[`en_${entrance.id}`] || elevatorInfo[`el_${entrance.elevators?.[0]?.id}`]) && (
                          <div style={{ paddingLeft: 12, paddingBottom: 2, fontSize: user?.pref_info_font_size || 11, color: user?.pref_info_color || 'var(--text2)', fontStyle: 'italic', lineHeight: 1.4 }}>
                            {elevatorInfo[`en_${entrance.id}`] || elevatorInfo[`el_${entrance.elevators?.[0]?.id}`]}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
                        <div className={`checkbox-custom ${allDone ? 'checked' : ''}`} style={{ width: 16, height: 16, pointerEvents: 'none' }}>
                          {allDone && <Check size={10} />}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{entrance.name}</span>
                      </div>
                    )}
                    {/* Кнопка добавления заявки по подъезду */}
                    <AddRecordBtn onClick={() => openRecord(`${building.name} — ${entrance.name}`)} />
                  </div>

                  {/* Лифты */}
                  {hasMultiElevators && entrance.elevators.map(el => {
                    const c = getCompletion('elevator', el.id);
                    return (
                      <div key={el.id} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div className="elevator-item" style={{ flex: 1, paddingLeft: 28 }}
                            onClick={() => canCheck && toggle('elevator', el.id, c?.is_completed, c?.completed_by)}>
                            <div className={`checkbox-custom ${c?.is_completed ? 'checked' : ''}`}>
                              {c?.is_completed && <Check size={12} />}
                            </div>
                            <span className="elevator-name">{el.name}</span>
                            {c?.user_name && (
                              <span className="completion-meta">
                                <span style={{ color: c.user_color }}>{c.user_name}</span>
                                {' · '}{parseDate(c.completed_at).toLocaleDateString('ru')}
                              </span>
                            )}
                            {/* Метки ТО2 и Жур. для лифта */}
                            {el.to2 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'var(--yellow)', color: '#000', marginLeft: 4 }}>ТО2</span>}
                            {el.journal && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: 'var(--accent)', color: '#fff', marginLeft: 2 }}>Жур.</span>}
                          </div>
                          {/* Кнопка добавления заявки по лифту */}
                          <AddRecordBtn onClick={() => openRecord(`${building.name} — ${entrance.name} — ${el.name}`)} />
                        </div>
                        {/* Информация о лифте — если галка в профиле включена */}
                        {!!user?.pref_show_elevator_info && elevatorInfo[`el_${el.id}`] && (
                          <div style={{ paddingLeft: 28, paddingBottom: 4, fontSize: user?.pref_info_font_size || 11, color: user?.pref_info_color || 'var(--text2)', fontStyle: 'italic', lineHeight: 1.4 }}>
                            {elevatorInfo[`el_${el.id}`]}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}

          {/* Кнопки внизу карточки */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <button className={`btn btn-ghost btn-sm ${showHistory ? 'active' : ''}`} onClick={() => setShowHistory(!showHistory)}>
              <History size={14} /> История
            </button>
            <button className={`btn btn-ghost btn-sm ${showYearly ? 'active' : ''}`} onClick={() => setShowYearly(!showYearly)}>
              <BarChart3 size={14} /> За год
            </button>
            <button className={`btn btn-ghost btn-sm ${showRecords ? 'active' : ''}`} onClick={() => setShowRecords(!showRecords)}>
              <ClipboardList size={14} /> Записи
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowInfo(true)}>
              <Info size={14} /> Инф.
            </button>
          </div>

          {/* Даты ТО и ТОСВ — скорректированные под рабочий день */}
          {(() => {
            const adjusted = getAdjustedDueDate(building.due_day, task.year, task.month);
            const original = new Date(task.year, task.month - 1, Math.min(building.due_day, new Date(task.year, task.month, 0).getDate()));
            const isAdjusted = adjusted.getDate() !== original.getDate();
            const tosv = getTosvDate(building.due_day, task.year, task.month);
            return (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ opacity: 0.6 }}>Дата ТО:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{formatDueDate(adjusted)}</span>
                  {isAdjusted && (
                    <span style={{ fontSize: 11, color: 'var(--text3)', opacity: 0.7 }}>
                      (перенос с {original.getDate()}-го)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ opacity: 0.6 }}>ТОСВ:</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{formatDueDate(tosv)}</span>
                </div>
              </div>
            );
          })()}

          {showHistory && (
            <div style={{ marginTop: 10, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>История отметок</div>
              <TaskHistory taskId={task.id} />
            </div>
          )}
          {showYearly && (
            <div style={{ marginTop: 10, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Выполнение за год</div>
              <YearlyView buildingId={building.id} />
            </div>
          )}
          {showRecords && (
            <div style={{ marginTop: 10, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Записи по объекту</div>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => openRecord(`ТО — ${building.name}`)}>
                  <Plus size={13} /> Добавить
                </button>
              </div>
              <BuildingRecords buildingId={building.id} refreshKey={recordsKey} />
            </div>
          )}
        </div>
      )}

      {recordModal && (
        <QuickRecordModal
          building={building}
          prefillTitle={recordModal.prefillTitle}
          onClose={() => setRecordModal(null)}
          onSaved={() => { setRecordsKey(k => k + 1); setShowRecords(true); }}
        />
      )}
      {showInfo && (
        <InfoModal building={building} task={task} onClose={() => setShowInfo(false)} onUpdate={() => onRefresh && onRefresh()} />
      )}
    </div>
  );
});

const FILTER_OPTS = [
  { key: null,          label: 'Все',        color: 'var(--text2)' },
  { key: 'overdue',     label: 'Просрочено', color: 'var(--red)' },
  { key: 'in_progress', label: 'В процессе', color: 'var(--yellow)' },
  { key: 'pending',     label: 'Ожидает',    color: 'var(--text2)' },
  { key: 'completed',   label: 'Выполнено',  color: 'var(--green)' },
];

const SORT_ORDER = { overdue: 0, in_progress: 1, pending: 2, completed: 3 };
function sortTasks(arr, mode = 'status') {
  return [...arr].sort((a, b) => {
    if (mode === 'name')    return (a.building?.name || '').localeCompare(b.building?.name || '', 'ru', { numeric: true, sensitivity: 'base' });
    if (mode === 'address') return (a.building?.address || '').localeCompare(b.building?.address || '', 'ru', { numeric: true, sensitivity: 'base' });
    if (mode === 'due_day') return (a.building?.due_day || 99) - (b.building?.due_day || 99);
    return (SORT_ORDER[a.status] ?? 99) - (SORT_ORDER[b.status] ?? 99);
  });
}

export default function TasksPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState(null); // название звена или null
  const [filterDistrict, setFilterDistrict] = useState(null); // district_id или null
  const { user } = useAuth();
  const [taskSort, setTaskSort] = useState('status');
  const taskSortRef = useRef(taskSort);

  // Загружаем сохранённую сортировку как только стал известен user.id
  useEffect(() => {
    if (user?.id) setTaskSort(getSavedSort(user.id));
  }, [user?.id]);

  // Сохраняем сортировку при каждом изменении
  const handleSetTaskSort = (val) => { saveSort(user?.id, val); setTaskSort(val); };
  const [lastUpdated, setLastUpdated] = useState(null);
  const [allExpanded, setAllExpanded] = useState(false);
  const [exporting, setExporting] = useState(null);
  const { isMobile } = useViewMode();

  // Используем ref для year/month чтобы WS-обработчик не пересоздавался
  const yearMonthRef = useRef({ year, month });
  useEffect(() => { yearMonthRef.current = { year, month }; }, [year, month]);

  // load — стабильная функция, year/month читает через ref
  useEffect(() => { taskSortRef.current = taskSort; }, [taskSort]);

  // Пункт 10: тик для обновления "X сек назад"
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async (silent = false) => {
    const { year: y, month: m } = yearMonthRef.current;
    if (!silent) setLoading(true);
    try {
      const r = await api.get(`/tasks?year=${y}&month=${m}`);
      setTasks(sortTasks(r.data, taskSortRef.current));
      setLastUpdated(new Date());
    } catch { if (!silent) toast.error('Ошибка загрузки'); }
    finally { if (!silent) setLoading(false); }
  }, []); // нет зависимостей — функция стабильна навсегда

  // Загрузка при смене месяца/года
  useEffect(() => { load(); }, [year, month]); // eslint-disable-line

  // WS-подписка один раз — не зависит от load (стабильна)
  useEffect(() => {
    const onTaskUpdated = ({ taskId, status, completions } = {}) => {
      if (taskId && completions !== undefined) {
        // Мгновенный патч нужной карточки — без запроса к серверу
        // taskSort хранится в ref чтобы избежать stale closure
        setTasks(prev => sortTasks(
          prev.map(t => t.id === taskId ? { ...t, status, completions } : t),
          taskSortRef.current
        ));
      } else {
        load(true);
      }
    };

    const onReconnect = () => {
      // При переподключении — полный reload, могли пропустить события
      load(true);
    };

    socket.on('task:updated', onTaskUpdated);
    socket.on('connect', onReconnect);

    return () => {
      socket.off('task:updated', onTaskUpdated);
      socket.off('connect', onReconnect);
    };
  }, [load]); // load стабилен — этот эффект выполняется ровно один раз

  // Reload при возврате вкладки из фона
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Резервный polling каждые 10 секунд — на случай если WS не работает
  useEffect(() => {
    const interval = setInterval(() => {
      // Только если сокет не подключён — не дублируем с WS
      if (!socket.connected) {
        load(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [load]);

  // Тосты от cron-задачи
  useEffect(() => {
    const onReminder = ({ overdue, soon }) => {
      if (overdue > 0) toast.error(`Просрочено ТО: ${overdue} объектов`, { duration: 8000, id: 'to-overdue' });
      if (soon > 0)    toast(`Срок ТО через 1-3 дня: ${soon} объектов`, { duration: 6000, id: 'to-soon', icon: '⚠️' });
    };
    socket.on('to:reminder', onReminder);
    return () => socket.off('to:reminder', onReminder);
  }, []);

  // Вызывается из TaskCard после успешного toggle — мгновенный патч из ответа API
  const handleUpdate = useCallback((taskId, updated) => {
    setTasks(prev => sortTasks(
      prev.map(t => t.id === taskId
        ? { ...t, status: updated.status, completions: updated.completions }
        : t
      )
    ));
  }, []);

  const handleExportExcel = async () => {
    setExporting('xlsx');
    try { await exportToExcel(displayTasks, year, month); }
    catch (e) { toast.error('Ошибка экспорта: ' + e.message); }
    finally { setExporting(null); }
  };

  const handleExportPDF = async () => {
    setExporting('pdf');
    try { await exportToPDF(displayTasks, year, month); }
    catch (e) { toast.error('Ошибка экспорта: ' + e.message); }
    finally { setExporting(null); }
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
  };

  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => t.status === 'overdue').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    pending: tasks.filter(t => t.status === 'pending').length,
  };

  // Собираем уникальные районы из всех зданий (показываем фильтр только если > 1)
  const allDistricts = [];
  const seenDistrictIds = new Set();
  tasks.forEach(t => {
    const id = t.building?.district_id;
    const name = t.building?.districtName;
    if (id && name && !seenDistrictIds.has(id)) {
      seenDistrictIds.add(id);
      allDistricts.push({ id, name });
    }
  });
  allDistricts.sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' }));

  // Собираем уникальные звенья из районов всех зданий
  const allTeams = [];
  const seenTeamNames = new Set();
  tasks.forEach(t => {
    const districtName = t.building?.districtName;
    const teams = t.building?.teams || [];
    teams.forEach(team => {
      if (!seenTeamNames.has(team.name)) {
        seenTeamNames.add(team.name);
        allTeams.push(team);
      }
    });
  });

  const filteredTasks = tasks
    .filter(t => !activeFilter || t.status === activeFilter)
    .filter(t => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return t.building?.name?.toLowerCase().includes(q) ||
             t.building?.address?.toLowerCase().includes(q);
    })
    .filter(t => !filterDistrict || t.building?.district_id === filterDistrict)
    .filter(t => !filterTeam || (t.building?.teams || []).some(team => team.name === filterTeam));
  const displayTasks = sortTasks(filteredTasks, taskSort);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">ТО</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setAllExpanded(v => !v)}
            title={allExpanded ? "Свернуть все" : "Развернуть все"}
            style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          >
            {allExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            {!isMobile && <span>{allExpanded ? 'Свернуть' : 'Развернуть'}</span>}
          </button>
          {/* Пункт 8: сортировка карточек */}
          <select
            value={taskSort}
            onChange={e => handleSetTaskSort(e.target.value)}
            className="form-input"
            style={{ fontSize: 12, height: 32, padding: '0 8px', width: 'auto', cursor: 'pointer' }}
            title="Сортировка"
          >
            <option value="status">По статусу</option>
            <option value="name">По названию</option>
            <option value="address">По адресу</option>
            <option value="due_day">По дню ТО</option>
          </select>
          <div className="month-nav">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={prevMonth}><ChevronLeft size={16}/></button>
          <span style={{ fontWeight: 600, fontSize: isMobile ? 13 : 15, minWidth: isMobile ? 100 : 150, textAlign: 'center', whiteSpace: 'nowrap' }}>
            {MONTHS_RU[month-1]} {year}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={nextMonth}><ChevronRight size={16}/></button>
        </div>
          </div>
      </div>

      <div className="page-body">
        {/* Кнопки фильтра по статусам */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Кнопка «Все» */}
          <button
            onClick={() => setActiveFilter(null)}
style={{
              background: activeFilter === null ? 'var(--accent-dim)' : 'var(--bg2)',
              border: `1px solid ${activeFilter === null ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8, padding: isMobile ? '8px 10px' : '10px 16px', cursor: 'pointer', textAlign: 'center', minWidth: isMobile ? 52 : undefined,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: activeFilter === null ? 'var(--accent)' : 'var(--text2)' }}>{stats.total}</div>
            {!isMobile && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Всего</div>}
            {isMobile && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text2)', margin: '2px auto 0' }}/>}
          </button>
          {[
            { key: 'completed',   label: 'Выполнено',  val: stats.completed,   color: 'var(--green)',  dot: '✓' },
            { key: 'in_progress', label: 'В процессе', val: stats.in_progress, color: 'var(--yellow)', dot: '…' },
            { key: 'overdue',     label: 'Просрочено', val: stats.overdue,     color: 'var(--red)',    dot: '!' },
          ].map(s => (
            <button
              key={s.key}
              onClick={() => setActiveFilter(activeFilter === s.key ? null : s.key)}
style={{
                background: activeFilter === s.key ? `${s.color}18` : 'var(--bg2)',
                border: `1px solid ${activeFilter === s.key ? s.color : 'var(--border)'}`,
                borderRadius: 8, padding: isMobile ? '8px 10px' : '10px 16px', cursor: 'pointer', textAlign: 'center', minWidth: isMobile ? 52 : undefined,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
              {!isMobile && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{s.label}</div>}
              {isMobile && <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, margin: '2px auto 0' }}/>}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {lastUpdated && (
              <span title={lastUpdated.toLocaleTimeString('ru')}>
                {(() => {
                  const sec = Math.floor((Date.now() - lastUpdated) / 1000);
                  if (sec < 60) return `${sec}с назад`;
                  const min = Math.floor(sec / 60);
                  return `${min}мин назад`;
                })()}
              </span>
            )}
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 2s ease-in-out infinite' }} />
            Авто
          </div>
        </div>

        {/* Метка активного фильтра */}
        {activeFilter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: 'var(--text2)' }}>
            Показано: <span style={{ fontWeight: 600, color: 'var(--text)' }}>{STATUS_LABELS[activeFilter]}</span>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setActiveFilter(null)}><X size={12}/></button>
          </div>
        )}

        {/* Пункт 11: поиск по адресу/названию */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
          <input
            className="form-input"
            placeholder="Поиск по объекту или адресу..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 34, height: 38, fontSize: 13.5 }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2 }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Фильтр по районам — показывается только если пользователь в нескольких районах */}
        {allDistricts.length > 1 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Район:</span>
            {allDistricts.map(d => (
              <button
                key={d.id}
                onClick={() => { setFilterDistrict(filterDistrict === d.id ? null : d.id); setFilterTeam(null); }}
                style={{
                  padding: '4px 10px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  background: filterDistrict === d.id ? 'var(--accent)' : 'var(--bg2)',
                  color: filterDistrict === d.id ? '#fff' : 'var(--text)',
                  border: `1px solid ${filterDistrict === d.id ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  opacity: filterDistrict && filterDistrict !== d.id ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {d.name}
              </button>
            ))}
            {filterDistrict && (
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setFilterDistrict(null)} title="Сбросить">
                <X size={12}/>
              </button>
            )}
          </div>
        )}

        {/* Фильтр по звену */}
        {allTeams.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Звено:</span>
            {allTeams.map(team => (
              <button
                key={team.name}
                onClick={() => setFilterTeam(filterTeam === team.name ? null : team.name)}
                style={{
                  padding: '4px 10px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  background: filterTeam === team.name ? 'var(--accent)' : 'var(--bg2)',
                  color: filterTeam === team.name ? '#fff' : 'var(--text)',
                  border: `1px solid ${filterTeam === team.name ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  opacity: filterTeam && filterTeam !== team.name ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {team.name}
              </button>
            ))}
            {filterTeam && (
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setFilterTeam(null)} title="Сбросить">
                <X size={12}/>
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}><div className="spinner" /></div>
        ) : displayTasks.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="2" width="18" height="20" rx="2"/><path d="M9 9l3-3 3 3"/><path d="M9 15l3 3 3-3"/></svg>
            {tasks.length === 0 ? (
              <>
                <h3>Нет объектов</h3>
                <p>Добавьте адреса в разделе «Адреса»</p>
              </>
            ) : (
              <>
                <h3>Ничего не найдено</h3>
                <p style={{ maxWidth: 300, margin: '0 auto' }}>
                  {[
                    search && `По запросу «${search}»`,
                    activeFilter && `Статус «${STATUS_LABELS[activeFilter]}»`,
                    filterTeam && 'У звена нет объектов',
                  ].filter(Boolean).join(' · ') || 'Нет совпадений'}
                </p>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => {
                  setSearch(''); setActiveFilter(null); setFilterTeam(null); setFilterDistrict(null);
                }}>Сбросить фильтры</button>
              </>
            )}
          </div>
        ) : (
          displayTasks.map(task => <TaskCard key={task.id} task={task} onUpdate={handleUpdate} onRefresh={load} forceExpanded={allExpanded || undefined} />)
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }`}</style>
    </div>
  );
}