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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Mitarbeiter</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{
          padding: '0.5rem 1rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
        }}>+ Neuer Mitarbeiter</button>
      </div>

      {showForm && (
        <div style={{ marginBottom: '1.5rem' }}>
          <WorkerForm worker={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </div>
      )}

      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Name</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Telefon</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Typ</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Satz</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Urlaub</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {workers.map(w => (
            <tr key={w.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{w.name}</td>
              <td style={{ padding: '0.75rem' }}>{w.phone_number}</td>
              <td style={{ padding: '0.75rem' }}>{w.worker_type === 'fulltime' ? 'Vollzeit' : 'Minijob'}</td>
              <td style={{ padding: '0.75rem' }}>{w.hourly_rate ? `${w.hourly_rate} EUR/h` : '-'}</td>
              <td style={{ padding: '0.75rem' }}>{w.vacation_entitlement} Tage</td>
              <td style={{ padding: '0.75rem' }}>
                <button onClick={() => { setEditing(w); setShowForm(true); }}
                  style={{ marginRight: '0.5rem', padding: '0.25rem 0.75rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Bearbeiten</button>
                <button onClick={() => handleDelete(w.id)}
                  style={{ padding: '0.25rem 0.75rem', background: '#fed7d7', color: '#c53030', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Deaktivieren</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
