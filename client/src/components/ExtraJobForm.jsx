import { useState } from 'react';
import { useLang } from '../context/LanguageContext';

export default function ExtraJobForm({ teams, onSubmit, onCancel }) {
  const { t } = useLang();
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
      <div className="form-card-title">{t('extraJobs.newTitle')}</div>

      <div className="form-row-3">
        <div className="form-group">
          <label className="form-label">{t('common.address')} *</label>
          <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('common.date')} *</label>
          <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('common.team')}</label>
          <select value={form.team_id} onChange={e => setForm({ ...form, team_id: e.target.value })} className="select">
            <option value="">{t('common.noTeam')}</option>
            {teams && teams.map(tm => (
              <option key={tm.id} value={tm.id}>{tm.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <div className="form-group">
          <label className="form-label">{t('common.description')} *</label>
          <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="textarea" />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">{t('common.cancel')}</button>
      </div>
    </form>
  );
}
