import { useState, useEffect, Fragment, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';

const MONTH_KEYS = ['', 'month.1', 'month.2', 'month.3', 'month.4', 'month.5', 'month.6',
  'month.7', 'month.8', 'month.9', 'month.10', 'month.11', 'month.12'];

export default function HourBalances() {
  const [workers, setWorkers] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showSync, setShowSync] = useState(false);
  const [showInitial, setShowInitial] = useState(false);
  const [showPayout, setShowPayout] = useState(null);
  const { t } = useLang();

  const now = new Date();
  const [syncYear, setSyncYear] = useState(now.getFullYear());
  const [syncMonth, setSyncMonth] = useState(now.getMonth() + 1);
  const [initialForm, setInitialForm] = useState({ worker_id: '', year: now.getFullYear(), surplus_hours: '', note: '' });
  const [payoutForm, setPayoutForm] = useState({ payout_hours: '', note: '' });

  const load = async () => {
    try {
      const data = await api.get('/hour-balances');
      setWorkers(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  useEffect(() => { load(); }, []);

  const handleSync = async () => {
    try {
      setError(null);
      await api.post('/hour-balances/sync', { year: syncYear, month: syncMonth });
      setSuccess(t('hourBalances.synced'));
      setShowSync(false);
      load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleInitial = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      await api.post('/hour-balances/initial', {
        worker_id: Number(initialForm.worker_id),
        year: Number(initialForm.year),
        surplus_hours: Number(initialForm.surplus_hours),
        note: initialForm.note || null,
      });
      setSuccess(t('hourBalances.saved'));
      setShowInitial(false);
      setInitialForm({ worker_id: '', year: now.getFullYear(), surplus_hours: '', note: '' });
      load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handlePayout = async (e, workerId) => {
    e.preventDefault();
    try {
      setError(null);
      const now = new Date();
      await api.post('/hour-balances/payout', {
        worker_id: workerId,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        payout_hours: Number(payoutForm.payout_hours),
        note: payoutForm.note || null,
      });
      setSuccess(t('hourBalances.saved'));
      setShowPayout(null);
      setPayoutForm({ payout_hours: '', note: '' });
      load();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const formatMonth = (year, month) => {
    if (month === 0) return `${t('hourBalances.initial')} ${year}`;
    return `${t(MONTH_KEYS[month])} ${year}`;
  };

  const stats = useMemo(() => {
    if (workers.length === 0) return { total: 0, positive: 0, negative: 0, totalBalance: 0 };
    const positive = workers.filter(w => w.balance > 0).length;
    const negative = workers.filter(w => w.balance < 0).length;
    const totalBalance = workers.reduce((s, w) => s + (w.balance || 0), 0);
    return { total: workers.length, positive, negative, totalBalance };
  }, [workers]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('hourBalances.title')}</h1>
          <p className="text-secondary text-sm mt-sm">{workers.length} {t('vacation.totalWorkers').toLowerCase()}</p>
        </div>
        <div className="flex gap-sm">
          <button onClick={() => { setShowSync(!showSync); setShowInitial(false); }} className="btn btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            {t('hourBalances.syncMonth')}
          </button>
          <button onClick={() => { setShowInitial(!showInitial); setShowSync(false); }} className="btn btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('hourBalances.setInitial')}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-md animate-fade-in">{error}</div>}
      {success && <div className="alert alert-success mb-md animate-fade-in">{success}</div>}

      {/* Stats bar */}
      {workers.length > 0 && (
        <div className="te-stats-bar mb-md animate-fade-in">
          <div className="te-stat" data-color={stats.totalBalance >= 0 ? 'info' : 'danger'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.totalBalance.toFixed(1)}h</span>
              <span className="te-stat-label">{t('hourBalances.balance')}</span>
            </div>
          </div>
          <div className="te-stat" data-color="success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.positive}</span>
              <span className="te-stat-label">Surplus</span>
            </div>
          </div>
          <div className="te-stat" data-color={stats.negative > 0 ? 'danger' : 'success'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.negative}</span>
              <span className="te-stat-label">Deficit</span>
            </div>
          </div>
        </div>
      )}

      {/* Sync Form */}
      {showSync && (
        <div className="form-card mb-md animate-slide-in">
          <div className="form-card-title">{t('hourBalances.syncMonth')}</div>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">{t('hourBalances.year')}</label>
              <input type="number" value={syncYear} onChange={e => setSyncYear(Number(e.target.value))} className="input" />
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.month')}</label>
              <select value={syncMonth} onChange={e => setSyncMonth(Number(e.target.value))} className="select">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{t(MONTH_KEYS[i + 1])}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button onClick={handleSync} className="btn btn-primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                {t('hourBalances.syncMonth')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Initial Balance Form */}
      {showInitial && (
        <form onSubmit={handleInitial} className="form-card mb-md animate-slide-in">
          <div className="form-card-title">{t('hourBalances.setInitial')}</div>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">{t('hourBalances.worker')}</label>
              <select required value={initialForm.worker_id} onChange={e => setInitialForm({ ...initialForm, worker_id: e.target.value })} className="select">
                <option value="">--</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.year')}</label>
              <input type="number" required value={initialForm.year} onChange={e => setInitialForm({ ...initialForm, year: e.target.value })} className="input" />
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.amount')}</label>
              <input type="number" step="0.1" required value={initialForm.surplus_hours} onChange={e => setInitialForm({ ...initialForm, surplus_hours: e.target.value })} className="input" />
            </div>
          </div>
          <div className="form-row-3" style={{ marginTop: '0.75rem' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">{t('hourBalances.note')}</label>
              <input value={initialForm.note} onChange={e => setInitialForm({ ...initialForm, note: e.target.value })} className="input" />
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            </div>
          </div>
        </form>
      )}

      {/* Worker Balances */}
      <div className="hb-worker-list">
        {workers.map(w => (
          <div key={w.id} className="hb-worker-card">
            <div className="hb-worker-header" onClick={() => setExpanded(expanded === w.id ? null : w.id)}>
              <div className="te-worker-cell">
                <div className="te-worker-avatar">
                  {w.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <span style={{ fontWeight: 600 }}>{w.name}</span>
                  <span className="badge badge-neutral" style={{ marginLeft: '8px', fontSize: '0.7rem' }}>{t(`workers.role.${w.worker_role}`)}</span>
                </div>
              </div>
              <div className="hb-worker-right">
                <span className="hb-balance-value" data-sign={w.balance > 0 ? 'positive' : w.balance < 0 ? 'negative' : 'zero'}>
                  {w.balance > 0 ? '+' : ''}{w.balance.toFixed(1)} {t('hourBalances.hours')}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`hb-chevron ${expanded === w.id ? 'open' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>

            {expanded === w.id && (
              <div className="hb-worker-detail animate-fade-in">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('hourBalances.month')}</th>
                      <th>{t('hourBalances.surplus')}</th>
                      <th>{t('hourBalances.payout')}</th>
                      <th>{t('hourBalances.balance')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let running = 0;
                      return (w.history || []).map((h, i) => {
                        running += Number(h.surplus_hours) - Number(h.payout_hours);
                        return (
                          <tr key={i}>
                            <td className="mono">{formatMonth(h.year, h.month)}</td>
                            <td className="mono">{Number(h.surplus_hours).toFixed(1)}</td>
                            <td className="mono">{Number(h.payout_hours) > 0 ? Number(h.payout_hours).toFixed(1) : '—'}</td>
                            <td>
                              <span className="mono" style={{ fontWeight: 600, color: running > 0 ? 'var(--success)' : running < 0 ? 'var(--danger)' : 'inherit' }}>
                                {running.toFixed(1)}
                              </span>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                    {(!w.history || w.history.length === 0) && (
                      <tr><td colSpan={4} className="text-muted" style={{ textAlign: 'center' }}>{t('hourBalances.noData')}</td></tr>
                    )}
                  </tbody>
                </table>

                {/* Payout Form */}
                {showPayout === w.id ? (
                  <form onSubmit={e => handlePayout(e, w.id)} className="hb-payout-form">
                    <div className="form-group">
                      <label className="form-label">{t('hourBalances.amount')}</label>
                      <input type="number" step="0.1" required value={payoutForm.payout_hours}
                        onChange={e => setPayoutForm({ ...payoutForm, payout_hours: e.target.value })}
                        className="input" style={{ width: '100px' }} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{t('hourBalances.note')}</label>
                      <input value={payoutForm.note}
                        onChange={e => setPayoutForm({ ...payoutForm, note: e.target.value })}
                        className="input" />
                    </div>
                    <div className="flex gap-xs" style={{ alignSelf: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary btn-sm">{t('common.save')}</button>
                      <button type="button" onClick={() => setShowPayout(null)} className="btn btn-secondary btn-sm">{t('common.cancel')}</button>
                    </div>
                  </form>
                ) : (
                  <button onClick={() => { setShowPayout(w.id); setPayoutForm({ payout_hours: '', note: '' }); }} className="btn btn-secondary btn-sm" style={{ marginTop: '0.75rem' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    {t('hourBalances.recordPayout')}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {workers.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div className="empty-state-text">{t('hourBalances.noData')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
