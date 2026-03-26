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
    <form onSubmit={handleSubmit} className="form-card">
      <div className="form-card-title">{property ? 'Objekt bearbeiten' : 'Neues Objekt'}</div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Adresse *</label>
          <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">Stadt *</label>
          <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">Standardaufgaben</label>
          <input value={form.standard_tasks} onChange={e => setForm({ ...form, standard_tasks: e.target.value })} placeholder="z.B. alles, TH reinigen" className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">Wochentag</label>
          <select value={form.assigned_weekday} onChange={e => setForm({ ...form, assigned_weekday: e.target.value })} className="select">
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

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">Speichern</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Abbrechen</button>
      </div>
    </form>
  );
}
