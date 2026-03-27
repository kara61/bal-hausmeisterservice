import { useState, useEffect } from 'react';
import { useLang } from '../context/LanguageContext';
import { api } from '../api/client';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const STATUS_ICON = {
  pending: '☐',
  in_progress: '◷',
  done: '✓',
  postponed: '⏸',
  carried_over: '↩',
};

const STATUS_COLOR = {
  pending: 'var(--text-muted)',
  in_progress: 'var(--info)',
  done: 'var(--success)',
  postponed: 'var(--warning)',
  carried_over: 'var(--warning)',
};

export default function DailyOperations() {
  const { t } = useLang();
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

  // Carried-over assignments
  const carriedOver = plan?.assignments?.filter(a => a.carried_from_id) || [];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>{t('ops.title')}</h1>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, -1))}>←</button>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, 1))}>→</button>

          {!plan && !loading && (
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? t('ops.generating') : t('ops.generate')}
            </button>
          )}
          {plan && plan.status === 'draft' && (
            <button className="btn btn-primary" onClick={handleApprove} disabled={approving}>
              {approving ? t('ops.approving') : t('ops.approve')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger mb-md">{error}</div>}

      {plan && (
        <div className="flex items-center gap-sm mb-md">
          <span className={`badge ${plan.status === 'draft' ? 'badge-warning' : 'badge-success'}`}>
            {plan.auto_approved ? t('ops.status.autoApproved') : t(`ops.status.${plan.status}`)}
          </span>
          {plan.approved_at && (
            <span className="text-muted text-sm">
              {t('ops.approvedAt')}: {new Date(plan.approved_at).toLocaleString('de-DE')}
            </span>
          )}
        </div>
      )}

      {loading && <div className="text-muted">...</div>}

      {!loading && !plan && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="empty-state-text">{t('ops.noplan')}</div>
        </div>
      )}

      {plan && (
        <div className="stagger-children">
          {[...byWorker.entries()].map(([workerId, worker]) => (
            <div key={workerId} className="card mb-md">
              <div className="card-header">
                <h3 className="card-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  {' '}{worker.name}
                </h3>
              </div>
              <div style={{ padding: 'var(--space-md)' }}>
                {[...worker.properties.entries()].map(([propId, prop]) => {
                  const partners = partnersByProperty.get(propId);
                  const partnerNames = partners
                    ? [...partners.entries()].filter(([id]) => id !== workerId).map(([, name]) => name)
                    : [];

                  return (
                    <div key={propId} className="mb-md">
                      <div className="flex items-center gap-sm mb-xs">
                        <strong>{prop.address}, {prop.city}</strong>
                        {partnerNames.length > 0 && (
                          <span className="text-muted text-sm">{t('ops.withPartner')} {partnerNames.join(', ')}</span>
                        )}
                      </div>
                      {prop.assignments.map(a => (
                        <div key={a.id} className="flex items-center justify-between mb-xs"
                          style={{ padding: 'var(--space-xs) var(--space-sm)', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-sm)' }}>
                          <div className="flex items-center gap-sm">
                            <span style={{ color: STATUS_COLOR[a.status] }}>{STATUS_ICON[a.status]}</span>
                            <span>{a.task_name}</span>
                            {a.carried_from_id && <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>↩</span>}
                          </div>
                          <div className="flex items-center gap-xs">
                            {a.status === 'pending' && (
                              <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(a.id, 'in_progress')}>▶</button>
                            )}
                            {a.status === 'in_progress' && (
                              <button className="btn btn-sm btn-ghost" onClick={() => handleStatusChange(a.id, 'done')}>✓</button>
                            )}
                            {(a.status === 'pending' || a.status === 'in_progress') && (
                              <button className="btn btn-sm btn-ghost" onClick={() => handlePostpone(a.id)}>{t('ops.postpone')}</button>
                            )}
                            {plan.status === 'draft' && (
                              reassigning === a.id ? (
                                <select className="select" style={{ width: 'auto', fontSize: '0.8rem' }}
                                  onChange={e => { if (e.target.value) handleReassign(a.id, e.target.value); else setReassigning(null); }}
                                  defaultValue="" autoFocus onBlur={() => setReassigning(null)}>
                                  <option value="">{t('ops.selectWorker')}</option>
                                  {workers.filter(w => w.id !== workerId).map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <button className="btn btn-sm btn-ghost" onClick={() => setReassigning(a.id)}>
                                  {t('ops.reassign')}
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
          ))}

          {plan.unassigned_properties && plan.unassigned_properties.length > 0 && (
            <div className="card mb-md" style={{ borderColor: 'var(--danger)' }}>
              <div className="card-header">
                <h3 className="card-title text-danger">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  {' '}{t('ops.unassigned')} ({plan.unassigned_properties.length})
                </h3>
              </div>
              <div style={{ padding: 'var(--space-md)' }}>
                {plan.unassigned_properties.map(p => (
                  <div key={p.id} className="flex items-center justify-between mb-sm"
                    style={{ padding: 'var(--space-sm)', background: 'var(--danger-soft)', borderRadius: 'var(--radius-sm)' }}>
                    <strong>{p.address}, {p.city}</strong>
                    <span className="text-danger text-sm">{t('ops.unassigned')}</span>
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
