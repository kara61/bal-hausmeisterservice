import { useState, useEffect } from 'react';
import { api } from '../api/client';
import ExtraJobForm from '../components/ExtraJobForm';

const STATUS_COLORS = {
  pending: '#e2e8f0',
  in_progress: '#bee3f8',
  done: '#c6f6d5',
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
    const data = await api.get('/teams');
    setTeams(data);
  };

  useEffect(() => { loadJobs(); }, [dateFilter]);
  useEffect(() => { loadTeams(); }, []);

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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Zusatzauftraege</h1>
        <button onClick={() => setShowForm(true)} style={{
          padding: '0.5rem 1rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
        }}>+ Neuer Auftrag</button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ marginRight: '0.5rem' }}>Datum filtern:</label>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }} />
        {dateFilter && (
          <button onClick={() => setDateFilter('')} style={{
            marginLeft: '0.5rem', padding: '0.25rem 0.75rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer',
          }}>Filter entfernen</button>
        )}
      </div>

      {showForm && (
        <ExtraJobForm teams={teams} onSubmit={handleSubmit} onCancel={() => setShowForm(false)} />
      )}

      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Datum</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Beschreibung</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Adresse</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Team</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{j.date}</td>
              <td style={{ padding: '0.75rem' }}>{j.description}</td>
              <td style={{ padding: '0.75rem' }}>{j.address}</td>
              <td style={{ padding: '0.75rem' }}>{j.team_name || '-'}</td>
              <td style={{ padding: '0.75rem' }}>
                <span style={{
                  display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px',
                  background: STATUS_COLORS[j.status] || '#e2e8f0', fontSize: '0.85rem',
                }}>{STATUS_LABELS[j.status] || j.status}</span>
              </td>
              <td style={{ padding: '0.75rem' }}>
                {j.status !== 'done' && (
                  <button onClick={() => handleDone(j.id)}
                    style={{ marginRight: '0.5rem', padding: '0.25rem 0.75rem', background: '#c6f6d5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Erledigt</button>
                )}
                <button onClick={() => handleDelete(j.id)}
                  style={{ padding: '0.25rem 0.75rem', background: '#fed7d7', color: '#c53030', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Loeschen</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
