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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Objekte</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{
          padding: '0.5rem 1rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
        }}>+ Neues Objekt</button>
      </div>

      {showForm && (
        <div style={{ marginBottom: '1.5rem' }}>
          <PropertyForm property={editing} onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </div>
      )}

      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Adresse</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Stadt</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aufgaben</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Tag</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {properties.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{p.address}</td>
              <td style={{ padding: '0.75rem' }}>{p.city}</td>
              <td style={{ padding: '0.75rem' }}>{p.standard_tasks || '-'}</td>
              <td style={{ padding: '0.75rem' }}>{p.assigned_weekday !== null && p.assigned_weekday !== undefined ? DAY_NAMES[p.assigned_weekday] : '-'}</td>
              <td style={{ padding: '0.75rem' }}>
                <button onClick={() => { setEditing(p); setShowForm(true); }}
                  style={{ marginRight: '0.5rem', padding: '0.25rem 0.75rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Bearbeiten</button>
                <button onClick={() => handleDelete(p.id)}
                  style={{ padding: '0.25rem 0.75rem', background: '#fed7d7', color: '#c53030', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Deaktivieren</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
