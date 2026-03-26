import { useState } from 'react';
import { useLang } from '../context/LanguageContext';

export default function WorkerForm({ worker, onSave, onCancel }) {
  const { t } = useLang();
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
      <div className="form-card-title">{worker ? t('workers.editTitle') : t('workers.newTitle')}</div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{t('common.name')} *</label>
          <input className="input" value={form.name} onChange={e => update('name', e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label">{t('workers.phoneWhatsApp')} *</label>
          <input className="input" value={form.phone_number} onChange={e => update('phone_number', e.target.value)} placeholder="+49..." required />
        </div>

        <div className="form-group">
          <label className="form-label">{t('common.type')}</label>
          <select className="select" value={form.worker_type} onChange={e => update('worker_type', e.target.value)}>
            <option value="fulltime">{t('common.fulltime')}</option>
            <option value="minijob">{t('common.minijob')}</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t('workers.hourlyRate')}</label>
          <input className="input" type="number" step="0.01" value={form.hourly_rate} onChange={e => update('hourly_rate', e.target.value)} />
        </div>

        {form.worker_type === 'minijob' && (
          <div className="form-group">
            <label className="form-label">{t('workers.monthlySalary')}</label>
            <input className="input" type="number" step="0.01" value={form.monthly_salary} onChange={e => update('monthly_salary', e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">{t('workers.registrationDate')} *</label>
          <input className="input" type="date" value={form.registration_date} onChange={e => update('registration_date', e.target.value)} required />
        </div>

        <div className="form-group">
          <label className="form-label">{t('workers.vacationEntitlement')}</label>
          <input className="input" type="number" value={form.vacation_entitlement} onChange={e => update('vacation_entitlement', e.target.value)} />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn btn-secondary">{t('common.cancel')}</button>}
      </div>
    </form>
  );
}
