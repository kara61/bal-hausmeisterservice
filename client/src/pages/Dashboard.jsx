import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function Dashboard() {
  const [flagged, setFlagged] = useState([]);
  const [pendingSick, setPendingSick] = useState([]);

  useEffect(() => {
    api.get('/time-entries/flagged').then(setFlagged).catch(() => {});
    api.get('/sick-leave?status=pending').then(setPendingSick).catch(() => {});
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Offene Flags ({flagged.length})</h2>
          {flagged.length === 0 ? <p style={{ color: '#999' }}>Keine offenen Flags</p> : (
            <ul style={{ listStyle: 'none' }}>
              {flagged.map(f => (
                <li key={f.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                  {f.worker_name} — {f.date} — {f.flag_reason}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Offene Krankmeldungen ({pendingSick.length})</h2>
          {pendingSick.length === 0 ? <p style={{ color: '#999' }}>Keine offenen Krankmeldungen</p> : (
            <ul style={{ listStyle: 'none' }}>
              {pendingSick.map(s => (
                <li key={s.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                  {s.worker_name} — {s.start_date} — {s.declared_days} Tage
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
