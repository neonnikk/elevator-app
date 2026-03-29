import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../../utils/api';

import { MONTHS_SHORT, STATUS_LABELS } from '../../utils/constants';

export default function YearlyView({ buildingId }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [tasks, setTasks] = useState([]);
  useEffect(() => {
    api.get(`/tasks/yearly/${buildingId}?year=${year}`).then(r => setTasks(r.data));
  }, [buildingId, year]);

  const now = new Date();
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setYear(y => y-1)}><ChevronLeft size={14}/></button>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{year}</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setYear(y => y+1)}><ChevronRight size={14}/></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
          const task = tasks.find(t => t.month === m);
          const isFuture = (year > now.getFullYear()) || (year === now.getFullYear() && m > now.getMonth() + 1);
          const status = isFuture ? 'future' : (task?.status || 'pending');
          return (
            <div key={m} className={`yearly-cell ${status}`} style={{ aspectRatio: 'auto', padding: '7px 8px', fontSize: 12 }}>
              <div style={{ fontWeight: 600 }}>{MONTHS_SHORT[m-1]}</div>
              {!isFuture && <div style={{ fontSize: 10, marginTop: 1, opacity: 0.85 }}>{STATUS_LABELS[status]?.slice(0,3) || '–'}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
