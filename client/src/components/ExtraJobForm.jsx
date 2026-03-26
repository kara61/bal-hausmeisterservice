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
    <form onSubmit={handleSubmit} className="form-card">
      <div className="form-card-title">Neuer Zusatzauftrag</div>

      <div className="form-row">
        <div className="form-group col-span-full">
          <label className="form-label">Beschreibung *</label>
          <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="textarea" />
        </div>
        <div className="form-group">
          <label className="form-label">Adresse *</label>
          <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">Datum *</label>
          <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">Team</label>
          <select value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value })} className="select">
            <option value="">-- Kein Team --</option>
            {teams && teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
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
