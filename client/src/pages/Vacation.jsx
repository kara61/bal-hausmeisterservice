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

  const getRemainColor = (remaining) => {
    if (remaining <= 3) return 'text-danger';
    if (remaining <= 7) return 'text-warning';
    return 'text-success';
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Urlaubskonto</h1>
        <input
          type="number"
          value={year}
          onChange={e => setYear(parseInt(e.target.value))}
          className="input"
          style={{ width: '100px' }}
        />
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mitarbeiter</th>
              <th>Anspruch</th>
              <th>Genommen</th>
              <th>Verbleibend</th>
            </tr>
          </thead>
          <tbody>
            {balances.map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.worker_name}</td>
                <td><span className="mono">{b.entitlement_days} Tage</span></td>
                <td><span className="mono">{b.used_days} Tage</span></td>
                <td>
                  <span className={`mono fw-bold ${getRemainColor(b.remaining)}`}>
                    {b.remaining} Tage
                  </span>
                </td>
              </tr>
            ))}
            {balances.length === 0 && (
              <tr><td colSpan={4}><div className="empty-state"><div className="empty-state-text">Keine Urlaubsdaten fuer dieses Jahr</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
