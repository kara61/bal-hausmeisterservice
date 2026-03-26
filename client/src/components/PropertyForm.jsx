import { useState, useEffect } from 'react';
import { useLang } from '../context/LanguageContext';

export default function PropertyForm({ property, onSubmit, onCancel }) {
  const { t } = useLang();
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
      <div className="form-card-title">{property ? t('properties.editTitle') : t('properties.newTitle')}</div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{t('common.address')} *</label>
          <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('common.city')} *</label>
          <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('properties.standardTasks')}</label>
          <input value={form.standard_tasks} onChange={e => setForm({ ...form, standard_tasks: e.target.value })} placeholder={t('properties.standardTasksPlaceholder')} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('properties.weekdayLabel')}</label>
          <select value={form.assigned_weekday} onChange={e => setForm({ ...form, assigned_weekday: e.target.value })} className="select">
            <option value="">{t('properties.noFixedDay')}</option>
            <option value="1">{t('properties.monday')}</option>
            <option value="2">{t('properties.tuesday')}</option>
            <option value="3">{t('properties.wednesday')}</option>
            <option value="4">{t('properties.thursday')}</option>
            <option value="5">{t('properties.friday')}</option>
            <option value="6">{t('properties.saturday')}</option>
            <option value="0">{t('properties.sunday')}</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">{t('common.cancel')}</button>
      </div>
    </form>
  );
}
