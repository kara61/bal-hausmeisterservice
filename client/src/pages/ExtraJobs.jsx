import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import ExtraJobForm from '../components/ExtraJobForm';

export default function ExtraJobs() {
  const [jobs, setJobs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [dateFilter, setDateFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useLang();

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

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('extraJobs.title')}</h1>
        <button onClick={() => { setShowForm(true); setError(null); }} className="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('extraJobs.new')}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">
          {error}
        </div>
      )}

      <div className="flex gap-sm items-center mb-lg">
        <span className="form-label" style={{ marginBottom: 0 }}>{t('common.filterByDate')}</span>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="input" style={{ width: 'auto' }} />
        {dateFilter && <button onClick={() => setDateFilter('')} className="btn btn-ghost btn-sm">{t('common.removeFilter')}</button>}
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
              <th>{t('common.date')}</th>
              <th>{t('common.description')}</th>
              <th>{t('common.address')}</th>
              <th>{t('common.team')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id}>
                <td><span className="mono">{j.date}</span></td>
                <td style={{ fontWeight: 600 }}>{j.description}</td>
                <td>{j.address}</td>
                <td>{j.team_name || <span className="text-muted">—</span>}</td>
                <td><span className={`badge ${statusBadge[j.status] || 'badge-neutral'}`}>{statusLabel(j.status)}</span></td>
                <td>
                  <div className="flex gap-xs">
                    {j.status !== 'done' && <button onClick={() => handleDone(j.id)} className="btn btn-success btn-sm">{t('common.done')}</button>}
                    <button onClick={() => handleDelete(j.id)} className="btn btn-danger btn-sm">{t('common.delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={6}><div className="empty-state"><div className="empty-state-text">{t('extraJobs.none')}</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
