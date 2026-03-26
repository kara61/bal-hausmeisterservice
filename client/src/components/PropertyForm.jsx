import { useState, useEffect } from 'react';

export default function PropertyForm({ property, onSubmit, onCancel }) {
  const [form, setForm] = useState({ address: '', city: '', standard_tasks: '', assigned_weekday: '' });

  useEffect(() => {
    if (property) {
      setForm({
        address: property.address || '',
        city: property.city || '',
        standard_tasks: property.standard_tasks || '',
        assigned_weekday: property.assigned_weekday !== null && property.assigned_weekday !== undefined ? String(property.assigned_weekday) : '',
      });
    } else {
      setForm({ address: '', city: '', standard_tasks: '', assigned_weekday: '' });
    }
  }, [property]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      assigned_weekday: form.assigned_weekday !== '' ? Number(form.assigned_weekday) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
      <h3 style={{ marginBottom: '1rem' }}>{property ? 'Objekt bearbeiten' : 'Neues Objekt'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Adresse *</label>
          <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Stadt *</label>
          <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Standardaufgaben</label>
          <input value={form.standard_tasks} onChange={e => setForm({ ...form, standard_tasks: e.target.value })}
            placeholder="z.B. alles, TH reinigen"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Wochentag</label>
          <select value={form.assigned_weekday} onChange={e => setForm({ ...form, assigned_weekday: e.target.value })}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}>
            <option value="">-- Kein fester Tag --</option>
            <option value="1">Montag</option>
            <option value="2">Dienstag</option>
            <option value="3">Mittwoch</option>
            <option value="4">Donnerstag</option>
            <option value="5">Freitag</option>
            <option value="6">Samstag</option>
            <option value="0">Sonntag</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Speichern</button>
        <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Abbrechen</button>
      </div>
    </form>
  );
}
