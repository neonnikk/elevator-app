import { useState, useEffect, useCallback } from 'react';
import { Search, X, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import api from '../utils/api';

const EVENT_ICONS = {
  login_ok:      { icon: '🔑', color: 'var(--green)',  label: 'Вход' },
  login_fail:    { icon: '🚫', color: 'var(--red)',    label: 'Неудача входа' },
  logout:        { icon: '🚪', color: 'var(--text2)',  label: 'Выход' },
  to_check:      { icon: '✅', color: 'var(--green)',  label: 'Отметка ТО ✓' },
  to_uncheck:    { icon: '⬜', color: 'var(--yellow)', label: 'Снятие ТО' },
  to2_set:       { icon: '🔶', color: 'var(--yellow)', label: 'ТО2 установлен' },
  to2_unset:     { icon: '🔷', color: 'var(--text2)',  label: 'ТО2 снят' },
  journal_set:   { icon: '📓', color: 'var(--accent)', label: 'Журнал установлен' },
  journal_unset: { icon: '📔', color: 'var(--text2)',  label: 'Журнал снят' },
  building_edit: { icon: '🏢', color: 'var(--accent)', label: 'Изменение здания' },
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ru', { day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AppLogPage() {
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [eventTypes, setEventTypes] = useState({});
  const [filterType, setFilterType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo]     = useState('');
  const [page, setPage]         = useState(1);
  const LIMIT = 50;

  useEffect(() => {
    api.get('/log/event-types').then(r => setEventTypes(r.data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (filterType) params.type = filterType;
      if (filterFrom) params.from = filterFrom;
      if (filterTo)   params.to   = filterTo;
      const r = await api.get('/log', { params });
      setRows(r.data.rows);
      setTotal(r.data.total);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [page, filterType, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setFilterType(''); setFilterFrom(''); setFilterTo(''); setPage(1); };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Лог событий</h1>
      </div>

      <div className="page-body">
        {/* Фильтры */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>

            {/* Тип события */}
            <div style={{ minWidth: 180 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>Тип события</div>
              <select className="form-input" style={{ padding: '6px 10px', fontSize: 13 }}
                value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
                <option value="">Все события</option>
                {Object.entries(eventTypes).map(([key, label]) => (
                  <option key={key} value={key}>{EVENT_ICONS[key]?.icon} {label}</option>
                ))}
              </select>
            </div>

            {/* С даты */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>С даты</div>
              <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 13 }}
                value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }} />
            </div>

            {/* По дату */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>По дату</div>
              <input type="date" className="form-input" style={{ padding: '6px 10px', fontSize: 13 }}
                value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }} />
            </div>

            <button className="btn btn-ghost btn-sm" onClick={reset} title="Сбросить фильтры">
              <X size={14}/> Сбросить
            </button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={load} title="Обновить">
              <RefreshCw size={14}/>
            </button>
          </div>
        </div>

        {/* Счётчик */}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
          Найдено: <strong style={{ color: 'var(--text)' }}>{total}</strong>
          {total > LIMIT && ` · страница ${page} из ${totalPages}`}
        </div>

        {/* Таблица */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner"/></div>
        ) : rows.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
            Событий не найдено
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)' }}>
                  <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', width: 130 }}>Время</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', width: 44 }}>Тип</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}>Описание</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', width: 100 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const ev = EVENT_ICONS[row.event_type] || { icon: '•', color: 'var(--text3)' };
                  const isLoginFail = row.event_type === 'login_fail';
                  return (
                    <tr key={row.id}
                      style={{ borderBottom: '1px solid var(--border)', background: isLoginFail ? 'var(--red-dim)' : 'transparent' }}>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                        {formatDate(row.created_at)}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 16 }} title={ev.label}>
                        {ev.icon}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 13, color: isLoginFail ? 'var(--red)' : 'var(--text)' }}>
                        {row.description}
                        {row.ip && row.event_type === 'login_fail' && (
                          <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 8 }}>с {row.ip}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>
                        {row.ip || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Пагинация */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
              <ChevronLeft size={16}/>
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`btn btn-sm ${page === p ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ minWidth: 32 }}>{p}</button>
              );
            })}
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>
              <ChevronRight size={16}/>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
