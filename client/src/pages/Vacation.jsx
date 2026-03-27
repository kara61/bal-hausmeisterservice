import { useState, useEffect, useMemo } from 'react';
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

  const stats = useMemo(() => {
    if (balances.length === 0) return { total: 0, avgRemaining: 0, lowBalance: 0, usagePercent: 0 };
    const totalEntitlement = balances.reduce((s, b) => s + (b.entitlement_days || 0), 0);
    const totalUsed = balances.reduce((s, b) => s + (b.used_days || 0), 0);
    const avgRemaining = balances.reduce((s, b) => s + (b.remaining || 0), 0) / balances.length;
    const lowBalance = balances.filter(b => b.remaining <= 3).length;
    const usagePercent = totalEntitlement > 0 ? Math.round((totalUsed / totalEntitlement) * 100) : 0;
    return { total: balances.length, avgRemaining, lowBalance, usagePercent };
  }, [balances]);

  const getRemainColor = (remaining) => {
    if (remaining <= 3) return 'danger';
    if (remaining <= 7) return 'warning';
    return 'success';
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('vacation.title')}</h1>
          <p className="text-secondary text-sm mt-sm">{balances.length} {t('vacation.totalWorkers').toLowerCase()}</p>
        </div>
        <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="input" style={{ width: '100px' }} />
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">{error}</div>
      )}

      {/* Stats bar */}
      {balances.length > 0 && (
        <div className="te-stats-bar mb-md animate-fade-in">
          <div className="te-stat" data-color="info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.usagePercent}%</span>
              <span className="te-stat-label">{t('vacation.usagePercent')}</span>
            </div>
          </div>
          <div className="te-stat" data-color="accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.avgRemaining.toFixed(1)}</span>
              <span className="te-stat-label">{t('vacation.avgRemaining')}</span>
            </div>
          </div>
          <div className="te-stat" data-color={stats.lowBalance > 0 ? 'danger' : 'success'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.lowBalance}</span>
              <span className="te-stat-label">{t('vacation.lowBalance')}</span>
            </div>
          </div>
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '42px' }}>#</th>
              <th>{t('vacation.worker')}</th>
              <th>{t('vacation.entitlement')}</th>
              <th>{t('vacation.used')}</th>
              <th>{t('vacation.remaining')}</th>
              <th style={{ width: '180px' }}></th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b, i) => {
              const color = getRemainColor(b.remaining);
              const pct = b.entitlement_days > 0 ? Math.round((b.used_days / b.entitlement_days) * 100) : 0;
              return (
                <tr key={b.id}>
                  <td className="mono text-muted">{i + 1}</td>
                  <td>
                    <div className="te-worker-cell">
                      <div className="te-worker-avatar">
                        {(b.worker_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600 }}>{b.worker_name}</span>
                    </div>
                  </td>
                  <td><span className="mono">{b.entitlement_days} {t('common.days')}</span></td>
                  <td><span className="mono">{b.used_days} {t('common.days')}</span></td>
                  <td>
                    <span className={`badge badge-${color}`}>
                      {b.remaining} {t('common.days')}
                    </span>
                  </td>
                  <td>
                    <div className="vac-progress-bar">
                      <div className="vac-progress-fill" data-color={color} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {balances.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </div>
                    <div className="empty-state-text">{t('vacation.none')}</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
