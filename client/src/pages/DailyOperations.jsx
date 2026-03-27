import { useState, useEffect, useMemo } from 'react';
import { useLang } from '../context/LanguageContext';
import { api } from '../api/client';
import { todayLocal } from '../utils/date';

function todayStr() {
  return todayLocal();
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const STATUS_BADGE = {
  pending: 'badge-neutral',
  in_progress: 'badge-info',
  done: 'badge-success',
  postponed: 'badge-warning',
  carried_over: 'badge-accent',
};

export default function DailyOperations() {
  const { t, lang } = useLang();
  const [date, setDate] = useState(todayStr());
  const [plan, setPlan] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [reassigning, setReassigning] = useState(null);

  useEffect(() => { loadPlan(); loadWorkers(); }, [date]);

  async function loadPlan() {
    setLoading(true);
    setError('');
    try {
      const plans = await api.get('/daily-plans');
      const found = plans.find(p => {
        const pDate = new Date(p.plan_date).toISOString().split('T')[0];
        return pDate === date;
      });
      if (found) {
        const full = await api.get(`/daily-plans/${found.id}`);
        setPlan(full);
      } else {
        setPlan(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkers() {
    try {
      const data = await api.get('/workers');
      setWorkers(data.filter(w => w.is_active !== false && ['field', 'cleaning', 'joker'].includes(w.worker_role)));
    } catch {}
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      await api.post('/daily-plans', { date });
      await loadPlan();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!plan) return;
    setApproving(true);
    setError('');
    try {
      await api.post(`/daily-plans/${plan.id}/approve`);
      await loadPlan();
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handleReassign(assignmentId, newWorkerId) {
    setError('');
    try {
      await api.put(`/plan-assignments/${assignmentId}`, { worker_id: parseInt(newWorkerId, 10) });
      await loadPlan();
      setReassigning(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePostpone(assignmentId) {
    const reason = prompt(t('ops.postponeReason'));
    if (reason === null) return;
    const newDate = prompt(t('ops.postponeDate'), shiftDate(date, 1));
    if (!newDate) return;
    try {
      setError('');
      await api.put(`/plan-assignments/${assignmentId}/postpone`, { reason, new_date: newDate });
      await loadPlan();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStatusChange(assignmentId, newStatus) {
    try {
      setError('');
      await api.put(`/plan-assignments/${assignmentId}`, { status: newStatus });
      await loadPlan();
    } catch (err) {
      setError(err.message);
    }
  }

  // Group assignments by worker, then by property
  const byWorker = new Map();
  if (plan?.assignments) {
    for (const a of plan.assignments) {
      if (!byWorker.has(a.worker_id)) {
        byWorker.set(a.worker_id, { name: a.worker_name, properties: new Map() });
      }
      const worker = byWorker.get(a.worker_id);
      if (!worker.properties.has(a.property_id)) {
        worker.properties.set(a.property_id, { address: a.address, city: a.city, assignments: [] });
      }
      worker.properties.get(a.property_id).assignments.push(a);
    }
  }

  // Find partner names per property
  const partnersByProperty = new Map();
  if (plan?.assignments) {
    for (const a of plan.assignments) {
      if (!partnersByProperty.has(a.property_id)) {
        partnersByProperty.set(a.property_id, new Map());
      }
      partnersByProperty.get(a.property_id).set(a.worker_id, a.worker_name);
    }
  }

  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const isToday = date === todayStr();
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  const stats = useMemo(() => {
    if (!plan?.assignments) return { total: 0, done: 0, pending: 0, pct: 0, workers: 0 };
    const total = plan.assignments.length;
    const done = plan.assignments.filter(a => a.status === 'done').length;
    const pending = plan.assignments.filter(a => a.status === 'pending').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pending, pct, workers: byWorker.size };
  }, [plan, byWorker]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('ops.title')}</h1>
          <p className="text-secondary text-sm mt-sm">
            {dateLabel}
            {isToday && <span className="badge badge-success" style={{ marginLeft: '8px', fontSize: '0.7rem' }}>{lang === 'de' ? 'Heute' : 'Today'}</span>}
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, -1))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, 1))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          {!plan && !loading && (
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {generating ? t('ops.generating') : t('ops.generate')}
            </button>
          )}
          {plan && plan.status === 'draft' && (
            <button className="btn btn-primary" onClick={handleApprove} disabled={approving}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {approving ? t('ops.approving') : t('ops.approve')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger mb-md animate-fade-in">{error}</div>}

      {/* Plan status + stats */}
      {plan && (
        <div className="ops-status-row mb-md animate-fade-in">
          <div className="ops-plan-badge">
            <span className={`badge ${plan.status === 'draft' ? 'badge-warning' : 'badge-success'}`}>
              {plan.auto_approved ? t('ops.status.autoApproved') : t(`ops.status.${plan.status}`)}
            </span>
            {plan.approved_at && (
              <span className="text-muted text-sm">
                {t('ops.approvedAt')}: {new Date(plan.approved_at).toLocaleString(locale)}
              </span>
            )}
          </div>
        </div>
      )}

      {plan && plan.assignments && plan.assignments.length > 0 && (
        <div className="te-stats-bar mb-md animate-fade-in">
          <div className="te-stat" data-color="accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.workers}</span>
              <span className="te-stat-label">{lang === 'de' ? 'Mitarbeiter' : 'Workers'}</span>
            </div>
          </div>
          <div className="te-stat" data-color="info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.total}</span>
              <span className="te-stat-label">{t('ops.tasks')}</span>
            </div>
          </div>
          <div className="te-stat" data-color={stats.pct === 100 ? 'success' : stats.pct > 50 ? 'info' : 'warning'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.pct}%</span>
              <span className="te-stat-label">{stats.done}/{stats.total}</span>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="ops-loading">
          <div className="ops-loading-dot" /><div className="ops-loading-dot" /><div className="ops-loading-dot" />
        </div>
      )}

      {!loading && !plan && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="empty-state-text">{t('ops.noplan')}</div>
        </div>
      )}

      {plan && (
        <div className="ops-worker-grid stagger-children">
          {[...byWorker.entries()].map(([workerId, worker]) => {
            const workerAssignments = [...worker.properties.values()].flatMap(p => p.assignments);
            const workerDone = workerAssignments.filter(a => a.status === 'done').length;
            const workerTotal = workerAssignments.length;
            const workerPct = workerTotal > 0 ? Math.round((workerDone / workerTotal) * 100) : 0;

            return (
              <div key={workerId} className="ops-worker-card">
                <div className="ops-worker-header">
                  <div className="ops-worker-info">
                    <div className="te-worker-avatar">{worker.name.charAt(0).toUpperCase()}</div>
                    <div>
                      <div className="ops-worker-name">{worker.name}</div>
                      <div className="ops-worker-meta">{workerDone}/{workerTotal} {t('ops.tasks').toLowerCase()}</div>
                    </div>
                  </div>
                  <div className="ops-worker-progress-ring" data-pct={workerPct}>
                    <svg viewBox="0 0 36 36" width="38" height="38">
                      <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="var(--bg-surface-3)" strokeWidth="3" />
                      <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={workerPct === 100 ? 'var(--success)' : workerPct > 50 ? 'var(--info)' : 'var(--accent)'}
                        strokeWidth="3"
                        strokeDasharray={`${workerPct}, 100`}
                        strokeLinecap="round" />
                    </svg>
                    <span className="ops-pct-text">{workerPct}%</span>
                  </div>
                </div>

                <div className="ops-properties">
                  {[...worker.properties.entries()].map(([propId, prop]) => {
                    const partners = partnersByProperty.get(propId);
                    const partnerNames = partners
                      ? [...partners.entries()].filter(([id]) => id !== workerId).map(([, name]) => name)
                      : [];

                    return (
                      <div key={propId} className="ops-property">
                        <div className="ops-property-header">
                          <div className="ops-property-address">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                            <strong>{prop.address}</strong>
                            {prop.city && <span className="text-muted">, {prop.city}</span>}
                          </div>
                          {partnerNames.length > 0 && (
                            <span className="ops-partner-badge">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                              {t('ops.withPartner')} {partnerNames.join(', ')}
                            </span>
                          )}
                        </div>

                        {prop.assignments.map(a => (
                          <div key={a.id} className={`ops-task-row status-${a.status}`}>
                            <div className="ops-task-left">
                              <span className={`badge ${STATUS_BADGE[a.status]} ops-task-badge`}>
                                {a.status === 'done' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                {a.status === 'pending' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>}
                                {a.status === 'in_progress' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                                {a.status === 'postponed' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>}
                                {a.status === 'carried_over' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>}
                              </span>
                              <span className={a.status === 'done' ? 'text-muted' : ''}>{a.task_name}</span>
                              {a.carried_from_id && <span className="badge badge-warning" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>↩</span>}
                            </div>
                            <div className="ops-task-actions">
                              {a.status === 'pending' && (
                                <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(a.id, 'in_progress')} title="Start">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                </button>
                              )}
                              {a.status === 'in_progress' && (
                                <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(a.id, 'done')} title="Done">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </button>
                              )}
                              {(a.status === 'pending' || a.status === 'in_progress') && (
                                <button className="btn btn-sm btn-ghost" onClick={() => handlePostpone(a.id)} title={t('ops.postpone')}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                </button>
                              )}
                              {plan.status === 'draft' && (
                                reassigning === a.id ? (
                                  <select className="select ops-reassign-select"
                                    onChange={e => { if (e.target.value) handleReassign(a.id, e.target.value); else setReassigning(null); }}
                                    defaultValue="" autoFocus onBlur={() => setReassigning(null)}>
                                    <option value="">{t('ops.selectWorker')}</option>
                                    {workers.filter(w => w.id !== workerId).map(w => (
                                      <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <button className="btn btn-sm btn-ghost" onClick={() => setReassigning(a.id)} title={t('ops.reassign')}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {plan.unassigned_properties && plan.unassigned_properties.length > 0 && (
            <div className="ops-worker-card ops-unassigned-card">
              <div className="ops-worker-header">
                <div className="ops-worker-info">
                  <div className="te-worker-avatar" style={{ background: 'var(--danger-soft)', borderColor: 'var(--danger-border)', color: 'var(--danger)' }}>!</div>
                  <div>
                    <div className="ops-worker-name" style={{ color: 'var(--danger)' }}>{t('ops.unassigned')}</div>
                    <div className="ops-worker-meta">{plan.unassigned_properties.length} {lang === 'de' ? 'Objekte' : 'properties'}</div>
                  </div>
                </div>
              </div>
              <div className="ops-properties">
                {plan.unassigned_properties.map(p => (
                  <div key={p.id} className="ops-unassigned-prop">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <strong>{p.address}</strong>
                    {p.city && <span className="text-muted">, {p.city}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
