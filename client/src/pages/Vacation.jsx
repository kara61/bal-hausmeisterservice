import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function Vacation() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [balances, setBalances] = useState([]);

  const load = async () => {
    const data = await api.get(`/vacation?year=${year}`);
    setBalances(data);
  };

  useEffect(() => { load(); }, [year]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Urlaubskonto</h1>
        <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ddd', width: '80px' }} />
      </div>
      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Mitarbeiter</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Anspruch</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Genommen</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Verbleibend</th>
          </tr>
        </thead>
        <tbody>
          {balances.map(b => (
            <tr key={b.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{b.worker_name}</td>
              <td style={{ padding: '0.75rem' }}>{b.entitlement_days} Tage</td>
              <td style={{ padding: '0.75rem' }}>{b.used_days} Tage</td>
              <td style={{ padding: '0.75rem' }}>
                <span style={{
                  fontWeight: 600,
                  color: b.remaining <= 3 ? '#c53030' : b.remaining <= 7 ? '#d69e2e' : '#38a169',
                }}>
                  {b.remaining} Tage
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
