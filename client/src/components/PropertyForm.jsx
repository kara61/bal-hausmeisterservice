import { useState, useEffect } from 'react';
import { useLang } from '../context/LanguageContext';

const EMPTY_TASK = { task_name: '', worker_role: 'field', schedule_type: 'property_default', schedule_day: '', biweekly_start_date: '' };

const WEEKDAY_OPTIONS = [
  { value: '0', labelKey: 'properties.sunday' },
  { value: '1', labelKey: 'properties.monday' },
  { value: '2', labelKey: 'properties.tuesday' },
  { value: '3', labelKey: 'properties.wednesday' },
  { value: '4', labelKey: 'properties.thursday' },
  { value: '5', labelKey: 'properties.friday' },
  { value: '6', labelKey: 'properties.saturday' },
];

export default function PropertyForm({ property, onSubmit, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState({ address: '', city: '', standard_tasks: '', assigned_weekday: '' });
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (property) {
      setForm({
        address: property.address || '',
        city: property.city || '',
        standard_tasks: property.standard_tasks || '',
        assigned_weekday: property.assigned_weekday !== null && property.assigned_weekday !== undefined ? String(property.assigned_weekday) : '',
      });
      setTasks(
        (property.tasks || []).map(t => ({
          id: t.id,
          task_name: t.task_name || '',
          worker_role: t.worker_role || 'field',
          schedule_type: t.schedule_type || 'property_default',
          schedule_day: t.schedule_day !== null && t.schedule_day !== undefined ? String(t.schedule_day) : '',
          biweekly_start_date: t.biweekly_start_date || '',
        }))
      );
    } else {
      setForm({ address: '', city: '', standard_tasks: '', assigned_weekday: '' });
      setTasks([]);
    }
  }, [property]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const submittedTasks = tasks
      .filter(t => t.task_name.trim())
      .map(t => ({
        ...(t.id ? { id: t.id } : {}),
        task_name: t.task_name.trim(),
        worker_role: t.worker_role,
        schedule_type: t.schedule_type,
        schedule_day: t.schedule_day !== '' ? Number(t.schedule_day) : null,
        biweekly_start_date: t.biweekly_start_date || null,
      }));
    onSubmit({
      ...form,
      assigned_weekday: form.assigned_weekday !== '' ? Number(form.assigned_weekday) : null,
      tasks: submittedTasks,
    });
  };

  const addTask = () => setTasks([...tasks, { ...EMPTY_TASK }]);
  const removeTask = (index) => setTasks(tasks.filter((_, i) => i !== index));
  const updateTask = (index, field, value) => {
    const updated = [...tasks];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'schedule_type') {
      updated[index].schedule_day = '';
      updated[index].biweekly_start_date = '';
    }
    setTasks(updated);
  };

  return (
    <form onSubmit={handleSubmit} className="form-card">
      <div className="form-card-title">{property ? t('properties.editTitle') : t('properties.newTitle')}</div>

      <div className="form-row-3">
        <div className="form-group">
          <label className="form-label">{t('common.address')} *</label>
          <input required value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" />
        </div>
        <div className="form-group">
          <label className="form-label">{t('common.city')} *</label>
          <input required value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="input" />
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

      {/* Tasks Section */}
      <div className="prop-tasks-section">
        <div className="prop-tasks-header">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            {t('properties.tasks')} ({tasks.length})
          </div>
          <button type="button" onClick={addTask} className="btn btn-secondary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('properties.addTask')}
          </button>
        </div>

        {tasks.length === 0 && (
          <div className="prop-tasks-empty">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            {t('properties.noTasks')}
          </div>
        )}

        {tasks.length > 0 && (
          <div className="prop-tasks-list">
            {/* Column headers */}
            <div className="prop-task-row prop-task-row-header">
              <div className="prop-task-col-name">{t('properties.taskName')}</div>
              <div className="prop-task-col-role">{t('properties.role')}</div>
              <div className="prop-task-col-schedule">{t('properties.schedule')}</div>
              <div className="prop-task-col-extra">{t('properties.scheduleDay')}</div>
              <div className="prop-task-col-action" />
            </div>

            {tasks.map((task, i) => (
              <div key={i} className="prop-task-row">
                <div className="prop-task-col-name">
                  <input
                    value={task.task_name}
                    onChange={e => updateTask(i, 'task_name', e.target.value)}
                    placeholder={t('properties.taskName')}
                    className="input"
                  />
                </div>

                <div className="prop-task-col-role">
                  <select value={task.worker_role} onChange={e => updateTask(i, 'worker_role', e.target.value)} className="select">
                    <option value="field">{t('workers.role.field')}</option>
                    <option value="cleaning">{t('workers.role.cleaning')}</option>
                    <option value="office">{t('workers.role.office')}</option>
                  </select>
                </div>

                <div className="prop-task-col-schedule">
                  <select value={task.schedule_type} onChange={e => updateTask(i, 'schedule_type', e.target.value)} className="select">
                    <option value="property_default">{t('properties.scheduleDefault')}</option>
                    <option value="weekly">{t('properties.scheduleWeekly')}</option>
                    <option value="biweekly">{t('properties.scheduleBiweekly')}</option>
                    <option value="monthly">{t('properties.scheduleMonthly')}</option>
                  </select>
                </div>

                <div className="prop-task-col-extra">
                  {(task.schedule_type === 'weekly' || task.schedule_type === 'biweekly') && (
                    <select value={task.schedule_day} onChange={e => updateTask(i, 'schedule_day', e.target.value)} className="select">
                      <option value="">{t('properties.scheduleDay')}</option>
                      {WEEKDAY_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                      ))}
                    </select>
                  )}
                  {task.schedule_type === 'monthly' && (
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={task.schedule_day}
                      onChange={e => updateTask(i, 'schedule_day', e.target.value)}
                      placeholder="1–31"
                      className="input"
                    />
                  )}
                  {task.schedule_type === 'biweekly' && (
                    <input
                      type="date"
                      value={task.biweekly_start_date}
                      onChange={e => updateTask(i, 'biweekly_start_date', e.target.value)}
                      className="input"
                    />
                  )}
                  {task.schedule_type === 'property_default' && (
                    <span className="text-muted text-sm">—</span>
                  )}
                </div>

                <div className="prop-task-col-action">
                  <button type="button" onClick={() => removeTask(i)} className="btn btn-danger btn-icon btn-sm" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">{t('common.cancel')}</button>
      </div>
    </form>
  );
}
