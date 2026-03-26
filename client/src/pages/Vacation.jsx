import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';

export default function Vacation() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [balances, setBalances] = useState([]);
  const [error, setError] = useState(null);
  const { t } = useLang();

  const load = async () => {
    try {
      const data = await api.get(`/vacation?year=${year}`);
      setBalances(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
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
        <h1 className="page-title">{t('vacation.title')}</h1>
        <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="input" style={{ width: '100px' }} />
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">
          {error}
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('vacation.worker')}</th>
              <th>{t('vacation.entitlement')}</th>
              <th>{t('vacation.used')}</th>
              <th>{t('vacation.remaining')}</th>
            </tr>
          </thead>
          <tbody>
            {balances.map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.worker_name}</td>
                <td><span className="mono">{b.entitlement_days} {t('common.days')}</span></td>
                <td><span className="mono">{b.used_days} {t('common.days')}</span></td>
                <td><span className={`mono fw-bold ${getRemainColor(b.remaining)}`}>{b.remaining} {t('common.days')}</span></td>
              </tr>
            ))}
            {balances.length === 0 && (
              <tr><td colSpan={4}><div className="empty-state"><div className="empty-state-text">{t('vacation.none')}</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
