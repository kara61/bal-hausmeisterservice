import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import ExtraJobForm from '../components/ExtraJobForm';

export default function ExtraJobs() {
  const [jobs, setJobs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [dateFilter, setDateFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const { t, lang } = useLang();

  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const statusBadge = { pending: 'badge-neutral', in_progress: 'badge-info', done: 'badge-success' };
  const statusLabel = (s) => s === 'pending' ? t('common.open') : s === 'in_progress' ? t('common.inProgress') : t('common.done');

  const loadJobs = async () => {
    try {
      const query = dateFilter ? `?date=${dateFilter}` : '';
      const data = await api.get(`/extra-jobs${query}`);
      setJobs(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const loadTeams = async () => {
    try {
      const d = dateFilter || new Date().toISOString().split('T')[0];
      const data = await api.get(`/teams?date=${d}`);
      setTeams(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  useEffect(() => { loadJobs(); loadTeams(); }, [dateFilter]);

  const handleSubmit = async (form) => {
    try {
      setError(null);
      await api.post('/extra-jobs', form);
      setShowForm(false);
      loadJobs();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleDone = async (id) => {
    try {
      setError(null);
      await api.put(`/extra-jobs/${id}`, { status: 'done' });
      loadJobs();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleDelete = async (id) => {
    if (confirm(t('extraJobs.confirmDelete'))) {
      try {
        setError(null);
        await api.delete(`/extra-jobs/${id}`);
        loadJobs();
      } catch (err) {
        setError(err.message || t('common.error'));
      }
    }
  };

  const stats = useMemo(() => {
    const pending = jobs.filter(j => j.status === 'pending').length;
    const doneCount = jobs.filter(j => j.status === 'done').length;
    return { total: jobs.length, pending, done: doneCount };
  }, [jobs]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('extraJobs.title')}</h1>
          <p className="text-secondary text-sm mt-sm">{jobs.length} {t('extraJobs.title').toLowerCase()}</p>
        </div>
        <button onClick={() => { setShowForm(true); setError(null); }} className="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('extraJobs.new')}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">{error}</div>
      )}

      {/* Stats bar */}
      {jobs.length > 0 && (
        <div className="te-stats-bar mb-md animate-fade-in">
          <div className="te-stat" data-color="accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.total}</span>
              <span className="te-stat-label">{t('extraJobs.title')}</span>
            </div>
          </div>
          <div className="te-stat" data-color={stats.pending > 0 ? 'warning' : 'success'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.pending}</span>
              <span className="te-stat-label">{t('common.open')}</span>
            </div>
          </div>
          <div className="te-stat" data-color="success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.done}</span>
              <span className="te-stat-label">{t('common.done')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Date filter */}
      <div className="ej-filter-bar mb-md">
        <div className="flex gap-sm items-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          <span className="form-label" style={{ marginBottom: 0 }}>{t('common.filterByDate')}</span>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="input" style={{ width: 'auto' }} />
          {dateFilter && (
            <button onClick={() => setDateFilter('')} className="btn btn-ghost btn-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              {t('common.removeFilter')}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <div className="mb-lg animate-slide-in">
          <ExtraJobForm teams={teams} onSubmit={handleSubmit} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '42px' }}>#</th>
              <th>{t('common.date')}</th>
              <th>{t('common.description')}</th>
              <th>{t('common.address')}</th>
              <th>{t('common.team')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j, i) => (
              <tr key={j.id}>
                <td className="mono text-muted">{i + 1}</td>
                <td><span className="mono">{new Date(j.date).toLocaleDateString(locale)}</span></td>
                <td style={{ fontWeight: 600 }}>{j.description}</td>
                <td className="text-secondary">{j.address}</td>
                <td>
                  {j.team_name
                    ? <span className="badge badge-accent">{j.team_name}</span>
                    : <span className="text-muted">—</span>}
                </td>
                <td><span className={`badge ${statusBadge[j.status] || 'badge-neutral'}`}>{statusLabel(j.status)}</span></td>
                <td>
                  <div className="flex gap-xs">
                    {j.status !== 'done' && (
                      <button onClick={() => handleDone(j.id)} className="btn btn-success btn-sm">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        {t('common.done')}
                      </button>
                    )}
                    <button onClick={() => handleDelete(j.id)} className="btn btn-danger btn-sm">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                    </div>
                    <div className="empty-state-text">{t('extraJobs.none')}</div>
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
