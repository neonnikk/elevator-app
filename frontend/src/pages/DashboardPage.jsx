import { useState, useEffect, useCallback } from 'react';
import { Building2, CheckCircle2, AlertTriangle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { MONTHS_RU, STATUS_COLORS } from '../utils/constants';

export default function DashboardPage() {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]); // последние 6 месяцев
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (y, m) => {
    setLoading(true);
    try {
      // Текущий месяц — через /tasks (пересчитывает актуальные статусы)
      const tasksRes = await api.get(`/tasks?year=${y}&month=${m}`);
      const tasks = tasksRes.data;
      const total      = tasks.length;
      const completed  = tasks.filter(t => t.status === 'completed').length;
      const overdue    = tasks.filter(t => t.status === 'overdue').length;
      const inProgress = tasks.filter(t => t.status === 'in_progress').length;
      const pending    = tasks.filter(t => t.status === 'pending').length;
      const pct = total ? Math.round(completed / total * 100) : 0;

      const overdueItems = tasks
        .filter(t => t.status === 'overdue')
        .sort((a, b) => (a.building?.due_day || 99) - (b.building?.due_day || 99))
        .slice(0, 5);

      const today = new Date().getDate();
      const upcoming = tasks
        .filter(t => t.status !== 'completed' && t.building?.due_day >= today && t.building?.due_day <= today + 7)
        .sort((a, b) => a.building.due_day - b.building.due_day)
        .slice(0, 5);

      setStats({ total, completed, overdue, inProgress, pending, pct, overdueItems, upcoming });

      // История — отдельный эндпоинт, берёт сохранённые статусы без пересчёта
      // Важно: /tasks пересчитывает статусы с new Date() → все прошлые месяцы = overdue
      const histRes = await api.get('/tasks/history-summary?months=6');
      setHistory(histRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(year, month); }, [year, month, load]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    if (isCurrentMonth) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  if (loading && !stats) return <div className="loading-screen"><div className="spinner"/></div>;
  if (!stats) return null;

  const cards = [
    { label: 'Всего объектов',  value: stats.total,      icon: Building2,    color: 'var(--accent)' },
    { label: 'Выполнено',       value: stats.completed,  icon: CheckCircle2, color: 'var(--green)' },
    { label: 'Просрочено',      value: stats.overdue,    icon: AlertTriangle,color: 'var(--red)' },
    { label: 'В процессе',      value: stats.inProgress, icon: Clock,        color: 'var(--yellow)' },
  ];

  // Максимум для нормировки графика
  const maxTotal = Math.max(...history.map(h => h.total), 1);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Дашборд</h1>
        {/* Навигация по месяцам */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={prevMonth}><ChevronLeft size={16}/></button>
          <span style={{ fontWeight: 600, fontSize: 15, minWidth: 160, textAlign: 'center' }}>
            {MONTHS_RU[month - 1]} {year}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={nextMonth} disabled={isCurrentMonth}
            style={{ opacity: isCurrentMonth ? 0.3 : 1 }}>
            <ChevronRight size={16}/>
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Карточки статистики */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {cards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} color={color}/>
              </div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Прогресс за месяц */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>Прогресс за месяц</span>
            <span style={{ fontWeight: 700, color: stats.pct === 100 ? 'var(--green)' : 'var(--accent)' }}>{stats.pct}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 5, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${stats.pct}%`, background: stats.pct === 100 ? 'var(--green)' : 'var(--accent)', borderRadius: 5, transition: 'width 0.5s ease' }}/>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--text2)', flexWrap: 'wrap' }}>
            {[
              { label: 'Выполнено',  val: stats.completed,  color: 'var(--green)' },
              { label: 'В процессе', val: stats.inProgress, color: 'var(--yellow)' },
              { label: 'Ожидает',    val: stats.pending,    color: 'var(--text3)' },
              { label: 'Просрочено', val: stats.overdue,    color: 'var(--red)' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }}/>
                {s.label}: <strong>{s.val}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* График — последние 6 месяцев */}
        {history.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>История за 6 месяцев</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
              {history.map((h, i) => {
                const isSelected = h.year === year && h.month === month;
                if (h.noData) {
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      onClick={() => { setYear(h.year); setMonth(h.month); }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>—</div>
                      <div style={{ width: '100%', height: 90, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                        <div style={{ width: '100%', height: 10, borderRadius: 4, background: 'var(--border)', border: isSelected ? '2px solid var(--accent)' : 'none' }}/>
                      </div>
                      <div style={{ fontSize: 10, color: isSelected ? 'var(--accent)' : 'var(--text3)', fontWeight: isSelected ? 700 : 400, textAlign: 'center' }}>
                        {MONTHS_RU[h.month - 1].slice(0, 3)}<br/>{h.year}
                      </div>
                    </div>
                  );
                }
        // Высота столбца = доля от максимума, сегменты внутри = доли статусов
        const barHeight = maxTotal ? Math.max(10, Math.round((h.total / maxTotal) * 88)) : 10;
        const completedPct = h.total ? Math.round((h.completed / h.total) * 100) : 0;
        const overduePct   = h.total ? Math.round((h.overdue   / h.total) * 100) : 0;
        const restPct      = 100 - completedPct - overduePct;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                    onClick={() => { setYear(h.year); setMonth(h.month); }}>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{h.pct}%</div>
                    <div style={{ width: '100%', height: 90, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      {/* Столбец: высота пропорциональна кол-ву объектов, внутри — сегменты */}
                      <div style={{
                        width: '100%', height: `${barHeight}px`,
                        borderRadius: 4, overflow: 'hidden',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid transparent',
                        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                        transition: 'all 0.2s',
                        background: 'var(--border)',
                      }}>
                        {/* Просрочено — снизу */}
                        {overduePct > 0 && (
                          <div style={{ height: `${overduePct}%`, background: 'var(--red)', opacity: 0.85, flexShrink: 0 }}/>
                        )}
                        {/* Выполнено */}
                        {completedPct > 0 && (
                          <div style={{ height: `${completedPct}%`, background: isSelected ? 'var(--accent)' : 'var(--green)', flexShrink: 0 }}/>
                        )}
                        {/* Остаток (pending + in_progress) */}
                        {restPct > 0 && h.total > 0 && (
                          <div style={{ height: `${restPct}%`, background: 'var(--text3)', opacity: 0.3, flexShrink: 0 }}/>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: isSelected ? 'var(--accent)' : 'var(--text3)', fontWeight: isSelected ? 700 : 400, textAlign: 'center' }}>
                      {MONTHS_RU[h.month - 1].slice(0, 3)}<br/>{h.year}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: 'var(--text3)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, background: 'var(--green)', borderRadius: 2 }}/> Выполнено</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, background: 'var(--red)', borderRadius: 2, opacity: 0.85 }}/> Просрочено</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, background: 'var(--text3)', borderRadius: 2, opacity: 0.4 }}/> Ожидает / В процессе</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: 2 }}/> Выбранный месяц</div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {/* Просроченные */}
          {stats.overdueItems.length > 0 && (
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)' }}>
                <AlertTriangle size={15}/> Просроченные ТО
              </div>
              {stats.overdueItems.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{t.building?.name}</span>
                  <span style={{ color: 'var(--red)', fontSize: 12 }}>до {t.building?.due_day} числа</span>
                </div>
              ))}
            </div>
          )}

          {/* Ближайшие сроки — только для текущего месяца */}
          {isCurrentMonth && stats.upcoming.length > 0 && (
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--yellow)' }}>
                <Clock size={15}/> Срок подходит (7 дней)
              </div>
              {stats.upcoming.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{t.building?.name}</span>
                  <span style={{ color: 'var(--yellow)', fontSize: 12 }}>{t.building?.due_day} числа</span>
                </div>
              ))}
            </div>
          )}

          {/* Всё в порядке */}
          {stats.overdueItems.length === 0 && (!isCurrentMonth || stats.upcoming.length === 0) && (
            <div className="card" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--green)' }}>
              <CheckCircle2 size={40} style={{ margin: '0 auto 12px' }}/>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Всё в порядке!</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>
                {isCurrentMonth ? 'Нет просроченных и приближающихся сроков' : 'Нет просроченных ТО за этот месяц'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
