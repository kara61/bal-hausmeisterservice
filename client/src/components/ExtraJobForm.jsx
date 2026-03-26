import { useState } from 'react';

export default function ExtraJobForm({ teams, onSubmit, onCancel }) {
  const [form, setForm] = useState({ description: '', address: '', date: '', team_id: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      team_id: form.team_id ? Number(form.team_id) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>Neuer Zusatzauftrag</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Beschreibung *</label>
          <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', minHeight: '80px' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Adresse *</label>
          <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Datum *</label>
          <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 'bold' }}>Team</label>
          <select value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value })}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}>
            <option value="">-- Kein Team --</option>
            {teams && teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
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
