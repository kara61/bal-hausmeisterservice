import { useState, useEffect, Fragment } from 'react';
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

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('hourBalances.title')}</h1>
        <div className="flex gap-sm">
          <button onClick={() => setShowSync(!showSync)} className="btn btn-secondary">
            {t('hourBalances.syncMonth')}
          </button>
          <button onClick={() => setShowInitial(!showInitial)} className="btn btn-secondary">
            {t('hourBalances.setInitial')}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger mb-md animate-fade-in">{error}</div>}
      {success && <div className="alert alert-success mb-md animate-fade-in">{success}</div>}

      {/* Sync Form */}
      {showSync && (
        <div className="form-card mb-md animate-slide-in">
          <div className="form-card-title">{t('hourBalances.syncMonth')}</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('hourBalances.year')}</label>
              <input type="number" value={syncYear} onChange={e => setSyncYear(Number(e.target.value))} className="input" style={{ width: '100px' }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.month')}</label>
              <select value={syncMonth} onChange={e => setSyncMonth(Number(e.target.value))} className="select" style={{ width: '150px' }}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{t(MONTH_KEYS[i + 1])}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button onClick={handleSync} className="btn btn-primary">{t('hourBalances.syncMonth')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Initial Balance Form */}
      {showInitial && (
        <form onSubmit={handleInitial} className="form-card mb-md animate-slide-in">
          <div className="form-card-title">{t('hourBalances.setInitial')}</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('hourBalances.worker')}</label>
              <select required value={initialForm.worker_id} onChange={e => setInitialForm({ ...initialForm, worker_id: e.target.value })} className="select">
                <option value="">--</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.year')}</label>
              <input type="number" required value={initialForm.year} onChange={e => setInitialForm({ ...initialForm, year: e.target.value })} className="input" style={{ width: '100px' }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.amount')}</label>
              <input type="number" step="0.1" required value={initialForm.surplus_hours} onChange={e => setInitialForm({ ...initialForm, surplus_hours: e.target.value })} className="input" style={{ width: '100px' }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('hourBalances.note')}</label>
              <input value={initialForm.note} onChange={e => setInitialForm({ ...initialForm, note: e.target.value })} className="input" />
            </div>
            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            </div>
          </div>
        </form>
      )}

      {/* Worker Balances Table */}
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('hourBalances.balance')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {workers.map(w => (
              <Fragment key={w.id}>
                <tr>
                  <td style={{ fontWeight: 600 }}>
                    {w.name}
                    <span className="badge badge-neutral" style={{ marginLeft: '8px', fontSize: '0.75rem' }}>{t(`workers.role.${w.worker_role}`)}</span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontWeight: 600, color: w.balance > 0 ? 'var(--success)' : w.balance < 0 ? 'var(--danger)' : 'inherit' }}>
                      {w.balance.toFixed(1)} {t('hourBalances.hours')}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => setExpanded(expanded === w.id ? null : w.id)}
                      className="btn btn-secondary btn-sm"
                    >
                      {t('hourBalances.details')}
                    </button>
                  </td>
                </tr>
                {expanded === w.id && (
                  <tr key={`${w.id}-detail`}>
                    <td colSpan={3} style={{ padding: 0 }}>
                      <div style={{ padding: '12px 24px', background: 'var(--bg-secondary)' }}>
                        <table className="data-table" style={{ marginBottom: '12px' }}>
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
                                    <td>{formatMonth(h.year, h.month)}</td>
                                    <td className="mono">{Number(h.surplus_hours).toFixed(1)}</td>
                                    <td className="mono">{Number(h.payout_hours) > 0 ? Number(h.payout_hours).toFixed(1) : '—'}</td>
                                    <td className="mono" style={{ fontWeight: 600 }}>{running.toFixed(1)}</td>
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
                          <form onSubmit={e => handlePayout(e, w.id)} className="flex gap-sm items-end">
                            <div className="form-group">
                              <label className="form-label">{t('hourBalances.amount')}</label>
                              <input type="number" step="0.1" required value={payoutForm.payout_hours}
                                onChange={e => setPayoutForm({ ...payoutForm, payout_hours: e.target.value })}
                                className="input" style={{ width: '100px' }} />
                            </div>
                            <div className="form-group">
                              <label className="form-label">{t('hourBalances.note')}</label>
                              <input value={payoutForm.note}
                                onChange={e => setPayoutForm({ ...payoutForm, note: e.target.value })}
                                className="input" style={{ width: '200px' }} />
                            </div>
                            <button type="submit" className="btn btn-primary btn-sm">{t('common.save')}</button>
                            <button type="button" onClick={() => setShowPayout(null)} className="btn btn-secondary btn-sm">{t('common.cancel')}</button>
                          </form>
                        ) : (
                          <button onClick={() => { setShowPayout(w.id); setPayoutForm({ payout_hours: '', note: '' }); }} className="btn btn-secondary btn-sm">
                            {t('hourBalances.recordPayout')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {workers.length === 0 && (
              <tr><td colSpan={3}><div className="empty-state"><div className="empty-state-text">{t('hourBalances.noData')}</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
