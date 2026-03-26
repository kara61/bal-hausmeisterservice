import { useState, useEffect } from 'react';
import { api } from '../api/client';
import WorkerForm from '../components/WorkerForm';

export default function Workers() {
  const [workers, setWorkers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadWorkers = async () => {
    const data = await api.get('/workers');
    setWorkers(data);
  };

  useEffect(() => { loadWorkers(); }, []);

  const handleSave = async (form) => {
    if (editing) {
      await api.put(`/workers/${editing.id}`, form);
    } else {
      await api.post('/workers', form);
    }
    setShowForm(false);
    setEditing(null);
    loadWorkers();
  };

  const handleDelete = async (id) => {
    if (confirm('Mitarbeiter wirklich deaktivieren?')) {
      await api.delete(`/workers/${id}`);
      loadWorkers();
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Mitarbeiter</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Neuer Mitarbeiter
        </button>
      </div>

      {showForm && (
        <div className="mb-lg animate-slide-in">
          <WorkerForm worker={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Telefon</th>
              <th>Typ</th>
              <th>Satz</th>
              <th>Urlaub</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {workers.map(w => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>{w.name}</td>
                <td><span className="mono">{w.phone_number}</span></td>
                <td>
                  <span className={`badge ${w.worker_type === 'fulltime' ? 'badge-accent' : 'badge-neutral'}`}>
                    {w.worker_type === 'fulltime' ? 'Vollzeit' : 'Minijob'}
                  </span>
                </td>
                <td><span className="mono">{w.hourly_rate ? `${w.hourly_rate} EUR/h` : '—'}</span></td>
                <td><span className="mono">{w.vacation_entitlement} Tage</span></td>
                <td>
                  <div className="flex gap-xs">
                    <button onClick={() => { setEditing(w); setShowForm(true); }} className="btn btn-secondary btn-sm">
                      Bearbeiten
                    </button>
                    <button onClick={() => handleDelete(w.id)} className="btn btn-danger btn-sm">
                      Deaktivieren
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-text">Keine Mitarbeiter vorhanden</div>
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
