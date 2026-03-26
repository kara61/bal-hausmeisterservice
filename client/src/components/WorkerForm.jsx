import { useState } from 'react';
import { useLang } from '../context/LanguageContext';

function calcVacationDays(registrationDate) {
  if (!registrationDate) return 0;
  const start = new Date(registrationDate);
  const now = new Date();
  if (isNaN(start.getTime()) || start > now) return 0;
  const daysWorked = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return Math.min(Math.floor(daysWorked / 15), 22);
}

export default function WorkerForm({ worker, onSave, onCancel }) {
  const { t } = useLang();
  const [manualVacation, setManualVacation] = useState(false);
  const [form, setForm] = useState(() => {
    if (!worker) return {
      name: '', phone_number: '', worker_type: 'fulltime', hourly_rate: '', monthly_salary: '',
      registration_date: '', vacation_entitlement: '',
    };
    return {
      ...worker,
      registration_date: worker.registration_date ? worker.registration_date.split('T')[0] : '',
      hourly_rate: worker.hourly_rate || '',
      monthly_salary: worker.monthly_salary || '',
      vacation_entitlement: worker.vacation_entitlement || '',
    };
  });

  const update = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-calculate vacation when registration date changes (unless manually set)
      if (field === 'registration_date' && !manualVacation) {
        next.vacation_entitlement = calcVacationDays(value);
      }
      return next;
    });
  };

  const handleVacationChange = (value) => {
    setManualVacation(true);
    setForm(prev => ({ ...prev, vacation_entitlement: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const calculatedDays = calcVacationDays(form.registration_date);

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
          <input className="input" type="number" value={form.vacation_entitlement} onChange={e => handleVacationChange(e.target.value)} />
          {form.registration_date && (
            <small style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Berechnet: {calculatedDays} Tage (1 Tag / 15 Arbeitstage, max. 22)
              {manualVacation && Number(form.vacation_entitlement) !== calculatedDays && (
                <> — <a href="#" onClick={e => { e.preventDefault(); setManualVacation(false); setForm(prev => ({ ...prev, vacation_entitlement: calculatedDays })); }} style={{ color: 'var(--accent)' }}>Zurücksetzen</a></>
              )}
            </small>
          )}
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        {onCancel && <button type="button" onClick={onCancel} className="btn btn-secondary">{t('common.cancel')}</button>}
      </div>
    </form>
  );
}
