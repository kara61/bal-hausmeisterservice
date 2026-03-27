import { useState, useEffect } from 'react';
import { useLang } from '../context/LanguageContext';
import { api } from '../api/client';
import { todayLocal } from '../utils/date';

const STATUS_BADGE = {
  draft: 'badge-warning',
  approved: 'badge-success',
  in_progress: 'badge-info',
  completed: 'badge-neutral',
};

export default function DailyPlan() {
  const { t } = useLang();
  const [date, setDate] = useState(todayLocal());
  const [plan, setPlan] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [reassigning, setReassigning] = useState(null);

  useEffect(() => {
    loadPlan();
    loadWorkers();
  }, [date]);

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
      setWorkers(data.filter(w => w.is_active !== false));
    } catch (err) {
      // Non-critical
    }
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

  const byWorker = new Map();
  if (plan?.assignments) {
    for (const a of plan.assignments) {
      if (!byWorker.has(a.worker_id)) {
        byWorker.set(a.worker_id, { name: a.worker_name, assignments: [] });
      }
      byWorker.get(a.worker_id).assignments.push(a);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>{t('plan.title')}</h1>
        <div className="page-header-actions">
          <input
            type="date"
            className="input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          {!plan && !loading && (
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? t('plan.generating') : t('plan.generatePlan')}
            </button>
          )}
          {plan && plan.status === 'draft' && (
            <button
              className="btn btn-primary"
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? t('plan.approving') : t('plan.approveSend')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger mb-md">{error}</div>}

      {loading && <div className="text-muted">...</div>}

      {!loading && !plan && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="empty-state-text">{t('plan.noAssignments')}</div>
        </div>
      )}

      {plan && (
        <>
          <div className="flex items-center gap-sm mb-md">
            <span className={`badge ${STATUS_BADGE[plan.status] || 'badge-neutral'}`}>
              {t(`plan.status.${plan.status}`)}
            </span>
            {plan.approved_at && (
              <span className="text-muted text-sm">
                {t('plan.approvedAt')}: {new Date(plan.approved_at).toLocaleString('de-DE')}
              </span>
            )}
          </div>

          <div className="stagger-children">
            {[...byWorker.entries()].map(([workerId, worker]) => (
              <div key={workerId} className="card mb-md">
                <div className="card-header">
                  <h3 className="card-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                    {' '}{worker.name}
                    <span className="text-muted ml-sm">({worker.assignments.length} {t('plan.properties')})</span>
                  </h3>
                </div>
                <div style={{ padding: 'var(--space-md)' }}>
                  {worker.assignments.map((a, i) => (
                    <div key={a.id} className="flex items-center justify-between mb-sm" style={{ padding: 'var(--space-sm)', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <span className="mono text-muted" style={{ marginRight: 'var(--space-sm)' }}>{i + 1}.</span>
                        <strong>{a.address}</strong>, {a.city}
                        <div className="text-muted text-sm">{a.standard_tasks}</div>
                      </div>
                      <div className="flex items-center gap-xs">
                        {a.source === 'manual' && <span className="badge badge-accent">manuell</span>}
                        {plan.status === 'draft' && (
                          reassigning === a.id ? (
                            <select
                              className="select"
                              onChange={e => {
                                if (e.target.value) handleReassign(a.id, e.target.value);
                                else setReassigning(null);
                              }}
                              defaultValue=""
                              autoFocus
                              onBlur={() => setReassigning(null)}
                            >
                              <option value="">{t('plan.selectWorker')}</option>
                              {workers.filter(w => w.id !== workerId).map(w => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                            </select>
                          ) : (
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => setReassigning(a.id)}
                            >
                              {t('plan.reassign')}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {plan.unassigned_properties && plan.unassigned_properties.length > 0 && (
            <div className="card mb-md" style={{ borderColor: 'var(--danger)' }}>
              <div className="card-header">
                <h3 className="card-title text-danger">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  {' '}{t('plan.unassigned')} ({plan.unassigned_properties.length})
                </h3>
              </div>
              <div style={{ padding: 'var(--space-md)' }}>
                {plan.unassigned_properties.map(p => (
                  <div key={p.id} className="flex items-center justify-between mb-sm" style={{ padding: 'var(--space-sm)', background: 'var(--danger-soft)', borderRadius: 'var(--radius-sm)' }}>
                    <div>
                      <strong>{p.address}</strong>, {p.city}
                      <div className="text-muted text-sm">{p.standard_tasks}</div>
                    </div>
                    <span className="text-danger text-sm">{t('plan.gap')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
