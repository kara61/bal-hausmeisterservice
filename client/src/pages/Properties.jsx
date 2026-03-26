import { useState, useEffect } from 'react';
import { api } from '../api/client';
import PropertyForm from '../components/PropertyForm';

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadProperties = async () => {
    const data = await api.get('/properties');
    setProperties(data);
  };

  useEffect(() => { loadProperties(); }, []);

  const handleSubmit = async (form) => {
    if (editing) {
      await api.put(`/properties/${editing.id}`, form);
    } else {
      await api.post('/properties', form);
    }
    setShowForm(false);
    setEditing(null);
    loadProperties();
  };

  const handleDelete = async (id) => {
    if (confirm('Objekt wirklich deaktivieren?')) {
      await api.delete(`/properties/${id}`);
      loadProperties();
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Objekte</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Neues Objekt
        </button>
      </div>

      {showForm && (
        <div className="mb-lg animate-slide-in">
          <PropertyForm property={editing} onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Adresse</th>
              <th>Stadt</th>
              <th>Aufgaben</th>
              <th>Tag</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {properties.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.address}</td>
                <td>{p.city}</td>
                <td className="text-secondary">{p.standard_tasks || '—'}</td>
                <td>
                  {p.assigned_weekday !== null && p.assigned_weekday !== undefined
                    ? <span className="badge badge-accent">{DAY_NAMES[p.assigned_weekday]}</span>
                    : <span className="text-muted">—</span>}
                </td>
                <td>
                  <div className="flex gap-xs">
                    <button onClick={() => { setEditing(p); setShowForm(true); }} className="btn btn-secondary btn-sm">Bearbeiten</button>
                    <button onClick={() => handleDelete(p.id)} className="btn btn-danger btn-sm">Deaktivieren</button>
                  </div>
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr><td colSpan={5}><div className="empty-state"><div className="empty-state-text">Keine Objekte vorhanden</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
