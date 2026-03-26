import { useState } from 'react';

const inputStyle = { width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', marginBottom: '0.75rem' };
const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' };

export default function WorkerForm({ worker, onSave, onCancel }) {
  const [form, setForm] = useState(worker || {
    name: '', phone_number: '', worker_type: 'fulltime', hourly_rate: '', monthly_salary: '',
    registration_date: '', vacation_entitlement: '',
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
      <label style={labelStyle}>Name</label>
      <input style={inputStyle} value={form.name} onChange={e => update('name', e.target.value)} required />

      <label style={labelStyle}>Telefon (WhatsApp)</label>
      <input style={inputStyle} value={form.phone_number} onChange={e => update('phone_number', e.target.value)} placeholder="+49..." required />

      <label style={labelStyle}>Typ</label>
      <select style={inputStyle} value={form.worker_type} onChange={e => update('worker_type', e.target.value)}>
        <option value="fulltime">Vollzeit</option>
        <option value="minijob">Minijob</option>
      </select>

      <label style={labelStyle}>Stundensatz (EUR)</label>
      <input style={inputStyle} type="number" step="0.01" value={form.hourly_rate} onChange={e => update('hourly_rate', e.target.value)} />

      {form.worker_type === 'minijob' && (
        <>
          <label style={labelStyle}>Monatliches Gehalt (EUR)</label>
          <input style={inputStyle} type="number" step="0.01" value={form.monthly_salary} onChange={e => update('monthly_salary', e.target.value)} />
        </>
      )}

      <label style={labelStyle}>Registrierungsdatum</label>
      <input style={inputStyle} type="date" value={form.registration_date} onChange={e => update('registration_date', e.target.value)} required />

      <label style={labelStyle}>Urlaubsanspruch (Tage/Jahr)</label>
      <input style={inputStyle} type="number" value={form.vacation_entitlement} onChange={e => update('vacation_entitlement', e.target.value)} />

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button type="submit" style={{ padding: '0.5rem 1.5rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Speichern
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1.5rem', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}
