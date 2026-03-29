import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { MONTHS_RU } from '../utils/constants';

const now = new Date();

function ProgressBar({ pct, color }) {
  const c = pct >= 40 ? 'var(--green)' : pct >= 20 ? 'var(--yellow)' : 'var(--red)';
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, flex: 1, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color || c, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  );
}

export default function StatsPage() {
  const { user } = useAuth();
  const [districts, setDistricts] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [period, setPeriod] = useState('month'); // 'month' = по месяцу | 'year' = по году
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);

  // Загружаем доступные районы
  useEffect(() => {
    api.get('/districts').then(r => {
      setDistricts(r.data);
      if (r.data.length > 0) setSelectedDistrict(r.data[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadStats = useCallback(async () => {
    if (!selectedDistrict) return;
    setStatsLoading(true);
    try {
      const r = await api.get(`/districts/${selectedDistrict}/stats`, {
        params: { period, year, month }
      });
      setStats(r.data);
    } catch { setStats(null); }
    finally { setStatsLoading(false); }
  }, [selectedDistrict, period, year, month]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (year === now.getFullYear() && month === now.getMonth() + 1) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  if (districts.length === 0) return (
    <div className="page-body">
      <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
        Нет районов. Создайте районы и звенья в разделе Пользователи → Районы.
      </div>
    </div>
  );

  const selectedDistrictName = districts.find(d => d.id === selectedDistrict)?.name || '';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Статистика</h1>
      </div>

      <div className="page-body">
        {/* Фильтры */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            {/* Выбор района */}
            {user?.role === 'admin' && districts.length > 0 && (
              <select value={selectedDistrict || ''} onChange={e => setSelectedDistrict(Number(e.target.value))}
                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '6px 10px', color: 'var(--text)', fontSize: 13 }}>
                {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}

            {/* Период */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
              {['month', 'year'].map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  style={{ padding: '4px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: period === p ? 'var(--accent)' : 'transparent',
                    color: period === p ? '#fff' : 'var(--text2)', transition: 'all 0.15s' }}>
                  {p === 'month' ? 'Месяц' : 'Год'}
                </button>
              ))}
            </div>

            {/* Навигация по месяцу */}
            {period === 'month' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={prevMonth} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text)' }}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 110, textAlign: 'center' }}>
                  {MONTHS_RU[month - 1]} {year}
                </span>
                <button onClick={nextMonth} disabled={isCurrentMonth}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: isCurrentMonth ? 'default' : 'pointer', color: isCurrentMonth ? 'var(--text3)' : 'var(--text)' }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* Навигация по году */}
            {period === 'year' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setYear(y => y - 1)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text)' }}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{year}</span>
                <button onClick={() => setYear(y => y + 1)} disabled={year >= now.getFullYear()}
                  style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', cursor: year >= now.getFullYear() ? 'default' : 'pointer', color: year >= now.getFullYear() ? 'var(--text3)' : 'var(--text)' }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Статистика по звеньям */}
        {statsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : !stats || stats.teams.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>
            Нет данных. Добавьте звенья в районе «{selectedDistrictName}».
          </div>
        ) : stats.teams.map(team => (
          <div key={team.id} className="card" style={{ marginBottom: 16 }}>
            {/* Заголовок звена */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{team.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                Всего подъездов: <strong style={{ color: 'var(--text)' }}>{team.total_entrances}</strong>
              </div>
            </div>

            {team.members.length === 0 ? (
              <div style={{ color: 'var(--text3)', fontSize: 13 }}>Нет участников</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Заголовок таблицы */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 52px 1fr', gap: 8,
                  fontSize: 11, color: 'var(--text3)', fontWeight: 600, paddingBottom: 6,
                  borderBottom: '1px solid var(--border)' }}>
                  <span>Работник</span>
                  <span style={{ textAlign: 'right' }}>Подъездов</span>
                  <span style={{ textAlign: 'right' }}>Доля</span>
                  <span style={{ paddingLeft: 8 }}>Прогресс</span>
                </div>

                {/* Строки участников — сортировка по кол-ву по убыванию */}
                {[...team.members].sort((a, b) => b.entrances_done - a.entrances_done).map((m, idx) => {
                  const barColor = m.pct >= 40 ? 'var(--green)' : m.pct >= 20 ? 'var(--yellow)' : 'var(--red)';
                  return (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 52px 1fr',
                      gap: 8, alignItems: 'center', padding: '6px 0',
                      borderBottom: idx < team.members.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      {/* Имя */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.color, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#fff' }}>
                          {m.display_name.slice(0, 1)}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{m.display_name}</span>
                      </div>
                      {/* Подъездов */}
                      <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: 'var(--text)' }}>
                        {m.entrances_done}
                      </span>
                      {/* Процент */}
                      <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', color: barColor }}>
                        {m.pct}%
                      </span>
                      {/* Прогресс-бар */}
                      <div style={{ paddingLeft: 8 }}>
                        <ProgressBar pct={m.pct} color={barColor} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
