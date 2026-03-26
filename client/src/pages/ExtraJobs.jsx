import { useState, useEffect } from 'react';
import { api } from '../api/client';
import ExtraJobForm from '../components/ExtraJobForm';

const STATUS_BADGES = {
  pending: 'badge-neutral',
  in_progress: 'badge-info',
  done: 'badge-success',
};

const STATUS_LABELS = {
  pending: 'Offen',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
};

export default function ExtraJobs() {
  const [jobs, setJobs] = useState([]);
  const [teams, setTeams] = useState([]);
  const [dateFilter, setDateFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const loadJobs = async () => {
    const query = dateFilter ? `?date=${dateFilter}` : '';
    const data = await api.get(`/extra-jobs${query}`);
    setJobs(data);
  };

  const loadTeams = async () => {
    const d = dateFilter || new Date().toISOString().split('T')[0];
    const data = await api.get(`/teams?date=${d}`);
    setTeams(data);
  };

  useEffect(() => { loadJobs(); loadTeams(); }, [dateFilter]);

  const handleSubmit = async (form) => {
    await api.post('/extra-jobs', form);
    setShowForm(false);
    loadJobs();
  };

  const handleDone = async (id) => {
    await api.put(`/extra-jobs/${id}`, { status: 'done' });
    loadJobs();
  };

  const handleDelete = async (id) => {
    if (confirm('Zusatzauftrag wirklich loeschen?')) {
      await api.delete(`/extra-jobs/${id}`);
      loadJobs();
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Zusatzauftraege</h1>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Neuer Auftrag
        </button>
      </div>

      <div className="flex gap-sm items-center mb-lg">
        <span className="form-label" style={{ marginBottom: 0 }}>Datum filtern:</span>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="input" style={{ width: 'auto' }} />
        {dateFilter && (
          <button onClick={() => setDateFilter('')} className="btn btn-ghost btn-sm">Filter entfernen</button>
        )}
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
              <th>Datum</th>
              <th>Beschreibung</th>
              <th>Adresse</th>
              <th>Team</th>
              <th>Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id}>
                <td><span className="mono">{j.date}</span></td>
                <td style={{ fontWeight: 600 }}>{j.description}</td>
                <td>{j.address}</td>
                <td>{j.team_name || <span className="text-muted">—</span>}</td>
                <td><span className={`badge ${STATUS_BADGES[j.status] || 'badge-neutral'}`}>{STATUS_LABELS[j.status] || j.status}</span></td>
                <td>
                  <div className="flex gap-xs">
                    {j.status !== 'done' && (
                      <button onClick={() => handleDone(j.id)} className="btn btn-success btn-sm">Erledigt</button>
                    )}
                    <button onClick={() => handleDelete(j.id)} className="btn btn-danger btn-sm">Loeschen</button>
                  </div>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={6}><div className="empty-state"><div className="empty-state-text">Keine Zusatzauftraege vorhanden</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
