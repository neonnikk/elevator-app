import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../utils/api';

import { MONTHS_RU, STATUS_LABELS, STATUS_COLORS, getAdjustedDueDate } from '../utils/constants';
const DAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
function getFirstDayOfWeek(year, month) {
  // Неделя начинается с понедельника: 0=Пн...6=Вс
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/tasks?year=${year}&month=${month}`);
      setTasks(r.data);
    } catch {}
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);

  // Группируем задачи по скорректированному дню ТО (не выходной)
  const tasksByDay = {};
  tasks.forEach(t => {
    const dueDay = t.building?.due_day || 15;
    const adjusted = getAdjustedDueDate(dueDay, year, month);
    const day = adjusted.getDate();
    if (!tasksByDay[day]) tasksByDay[day] = [];
    tasksByDay[day].push(t);
  });

  const todayDay = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : null;

  // Строим сетку календаря
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedTasks = selectedDay ? (tasksByDay[selectedDay] || []) : [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Календарь</h1>
        <div className="month-nav">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={prevMonth}><ChevronLeft size={16}/></button>
          <span style={{ fontWeight: 600, fontSize: 15, minWidth: 150, textAlign: 'center' }}>
            {MONTHS_RU[month - 1]} {year}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={nextMonth}><ChevronRight size={16}/></button>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Сетка календаря */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Заголовки дней недели */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
              {DAYS_SHORT.map(d => (
                <div key={d} style={{ padding: '7px 0', textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase' }}>
                  {d}
                </div>
              ))}
            </div>

            {loading ? (
              <div style={{ padding: 60, textAlign: 'center' }}><div className="spinner" /></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {cells.map((day, idx) => {
                  if (!day) return <div key={`e-${idx}`} style={{ borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', minHeight: 64 }} />;

                  const dayTasks = tasksByDay[day] || [];
                  const isToday = day === todayDay;
                  const isSelected = day === selectedDay;

                  const statuses = dayTasks.map(t => t.status);
                  const hasOverdue    = statuses.includes('overdue');
                  const hasInProgress = statuses.includes('in_progress');
                  const hasCompleted  = statuses.includes('completed');
                  const hasPending    = statuses.includes('pending');

                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                      style={{
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid var(--border)',
                        minHeight: 64,
                        padding: '5px 3px',
                        cursor: dayTasks.length > 0 ? 'pointer' : 'default',
                        background: isSelected ? 'var(--accent-dim)' : isToday ? 'var(--bg3)' : 'transparent',
                        transition: 'background 0.12s',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Номер дня */}
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: isToday ? 'var(--accent)' : 'transparent',
                        color: isToday ? 'white' : 'var(--text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: isToday ? 700 : 400,
                        marginBottom: 3,
                      }}>
                        {day}
                      </div>

                      {/* Содержимое ячейки */}
                      {dayTasks.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {dayTasks.length <= 2 ? (
                            // 1-2 задачи — показываем название и счётчик
                            dayTasks.map(t => {
                              const done  = (t.completions||[]).filter(c => c.is_completed).length;
                              const total = (t.completions||[]).length;
                              return (
                                <div key={t.id} style={{
                                  fontSize: 9, lineHeight: 1.3,
                                  color: STATUS_COLORS[t.status],
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  display: 'flex', alignItems: 'center', gap: 2,
                                }}>
                                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: STATUS_COLORS[t.status], flexShrink: 0 }} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{t.building?.name}</span>
                                  {total > 0 && <span style={{ flexShrink: 0, opacity: 0.75 }}>{done}/{total}</span>}
                                </div>
                              );
                            })
                          ) : (
                            // 3+ задачи — только цветные точки по статусам + счётчик
                            <>
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                                {hasOverdue    && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)',    flexShrink: 0 }} />}
                                {hasInProgress && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--yellow)', flexShrink: 0 }} />}
                                {hasCompleted  && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',  flexShrink: 0 }} />}
                                {hasPending    && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)', flexShrink: 0 }} />}
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text2)', lineHeight: 1.2 }}>{dayTasks.length}</div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Панель деталей дня — показывается снизу на всю ширину */}
          {selectedDay && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedDay} {MONTHS_RU[month-1]}</div>
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSelectedDay(null)}><ChevronRight size={14}/></button>
              </div>
              {selectedTasks.length === 0 ? (
                <p style={{ color: 'var(--text2)', fontSize: 13 }}>Нет объектов на этот день</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedTasks.map(t => {
                    const comps = t.completions || [];
                    const total = comps.length;
                    const done = comps.filter(c => c.is_completed).length;
                    return (
                      <div key={t.id} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', border: `1px solid ${STATUS_COLORS[t.status]}33` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: total > 0 ? 6 : 0 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[t.status], flexShrink: 0 }} />
                          <div style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{t.building?.name}</div>
                          <span style={{ fontSize: 11, color: STATUS_COLORS[t.status], fontWeight: 600 }}>{STATUS_LABELS[t.status]}</span>
                        </div>
                        {total > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16 }}>
                            <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.round(done/total*100)}%`, background: STATUS_COLORS[t.status], borderRadius: 2, transition: 'width 0.3s' }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{done}/{total}</span>
                          </div>
                        )}
                        {t.building?.assignedUsers?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, paddingLeft: 16, marginTop: 6 }}>
                            {t.building.assignedUsers.map(u => (
                              <div key={u.id} title={u.display_name} style={{ width: 18, height: 18, borderRadius: '50%', background: u.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white' }}>
                                {u.display_name.split(' ').map(w => w[0]).join('').slice(0,2)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Легенда */}
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[k] }} />
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
