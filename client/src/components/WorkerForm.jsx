import { useState } from 'react';

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
    <form onSubmit={handleSubmit} className="form-card">
      <div className="form-card-title">{worker ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input className="input" value={form.name} onChange={e => update('name', e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label">Telefon (WhatsApp) *</label>
          <input className="input" value={form.phone_number} onChange={e => update('phone_number', e.target.value)} placeholder="+49..." required />
        </div>

        <div className="form-group">
          <label className="form-label">Typ</label>
          <select className="select" value={form.worker_type} onChange={e => update('worker_type', e.target.value)}>
            <option value="fulltime">Vollzeit</option>
            <option value="minijob">Minijob</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Stundensatz (EUR)</label>
          <input className="input" type="number" step="0.01" value={form.hourly_rate} onChange={e => update('hourly_rate', e.target.value)} />
        </div>

        {form.worker_type === 'minijob' && (
          <div className="form-group">
            <label className="form-label">Monatliches Gehalt (EUR)</label>
            <input className="input" type="number" step="0.01" value={form.monthly_salary} onChange={e => update('monthly_salary', e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Registrierungsdatum *</label>
          <input className="input" type="date" value={form.registration_date} onChange={e => update('registration_date', e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label">Urlaubsanspruch (Tage/Jahr)</label>
          <input className="input" type="number" value={form.vacation_entitlement} onChange={e => update('vacation_entitlement', e.target.value)} />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">Speichern</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn btn-secondary">Abbrechen</button>}
      </div>
    </form>
  );
}
