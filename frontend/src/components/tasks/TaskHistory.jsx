import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { parseDate } from '../../utils/constants';

export default function TaskHistory({ taskId }) {
  const [history, setHistory] = useState([]);
  useEffect(() => {
    api.get(`/tasks/${taskId}/history`).then(r => setHistory(r.data));
  }, [taskId]);

  if (!history.length) return <p style={{ color: 'var(--text2)', fontSize: 13 }}>История пуста</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {history.map(h => {
        // Формируем метку объекта: лифт, подъезд или здание целиком
        const objLabel = h.elevator_name
          ? `${h.entrance_name ? h.entrance_name + ' / ' : ''}${h.elevator_name}`
          : h.entrance_name
            ? h.entrance_name
            : h.completion_type === 'building' ? 'здание целиком' : null;
        return (
          <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: h.action === 'checked' ? 'var(--green)' : 'var(--red)', flexShrink: 0, marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: h.user_color, fontWeight: 600 }}>{h.user_name}</span>
                <span style={{ color: 'var(--text2)' }}>{h.action === 'checked' ? 'отметил' : 'снял'}</span>
                {objLabel && <span style={{ color: 'var(--text3)', fontSize: 11, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4 }}>{objLabel}</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{parseDate(h.timestamp).toLocaleString('ru')}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
