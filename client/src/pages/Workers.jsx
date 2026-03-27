import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import WorkerForm from '../components/WorkerForm';

export default function Workers() {
  const [workers, setWorkers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [filter, setFilter] = useState('all');
  const { t } = useLang();

  const loadWorkers = async () => {
    const data = await api.get('/workers');
    setWorkers(data);
  };

  useEffect(() => { loadWorkers(); }, []);

  const handleSave = async (form) => {
    try {
      setError(null);
      setWarning(null);
      let result;
      if (editing) {
        result = await api.put(`/workers/${editing.id}`, form);
      } else {
        result = await api.post('/workers', form);
      }
      if (result?._warning) {
        setWarning(result._warning);
      }
      setShowForm(false);
      setEditing(null);
      loadWorkers();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleDelete = async (id) => {
    if (confirm(t('workers.confirmDeactivate'))) {
      try {
        setError(null);
        await api.delete(`/workers/${id}`);
        loadWorkers();
      } catch (err) {
        setError(err.message || t('common.error'));
      }
    }
  };

  const handleFieldToggle = async (worker, force = false) => {
    const newValue = !worker.is_field_worker;
    try {
      setError(null);
      setWarning(null);
      const result = await api.put('/workers/field-status', {
        worker_id: worker.id,
        is_field_worker: newValue,
        force,
      });
      if (result?._warnings) {
        const messages = [];
        if (result._warnings.includes('last_field_worker')) messages.push(t('workers.lastFieldWorkerWarning'));
        if (result._warnings.includes('future_assignments')) messages.push(t('workers.futureAssignmentsWarning'));
        if (confirm(messages.join('\n\n'))) {
          await handleFieldToggle(worker, true);
        }
        return;
      }
      loadWorkers();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const filteredWorkers = workers.filter(w => {
    if (filter === 'field') return w.is_field_worker;
    if (filter === 'office') return !w.is_field_worker;
    return true;
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('workers.title')}</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); setError(null); setWarning(null); }} className="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('workers.new')}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">
          {error}
        </div>
      )}

      {warning && (
        <div className="alert alert-warning mb-md animate-fade-in">
          {warning}
        </div>
      )}

      {showForm && (
        <div className="mb-lg animate-slide-in">
          <WorkerForm worker={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </div>
      )}

      <div className="flex gap-sm mb-md">
        {['all', 'field', 'office'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t(`workers.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
          </button>
        ))}
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.phone')}</th>
              <th>{t('common.type')}</th>
              <th>{t('common.rate')}</th>
              <th>{t('workers.vacationDays')}</th>
              <th>{t('workers.fieldWorker')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredWorkers.map(w => (
              <tr key={w.id}>
                <td style={{ fontWeight: 600 }}>
                  {w.name}
                  {!w.is_field_worker && <span className="badge badge-neutral" style={{ marginLeft: '8px', fontSize: '0.75rem' }}>{t('workers.office')}</span>}
                </td>
                <td><span className="mono">{w.phone_number}</span></td>
                <td>
                  <span className={`badge ${w.worker_type === 'fulltime' ? 'badge-accent' : 'badge-neutral'}`}>
                    {w.worker_type === 'fulltime' ? t('common.fulltime') : t('common.minijob')}
                  </span>
                </td>
                <td><span className="mono">{w.hourly_rate ? `${w.hourly_rate} EUR/h` : '—'}</span></td>
                <td><span className="mono">{w.vacation_entitlement} {t('common.days')}</span></td>
                <td><input type="checkbox" checked={w.is_field_worker} onChange={() => handleFieldToggle(w)} style={{ cursor: 'pointer' }} /></td>
                <td>
                  <div className="flex gap-xs">
                    <button onClick={() => { setEditing(w); setShowForm(true); }} className="btn btn-secondary btn-sm">{t('common.edit')}</button>
                    <button onClick={() => handleDelete(w.id)} className="btn btn-danger btn-sm">{t('common.deactivate')}</button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredWorkers.length === 0 && (
              <tr><td colSpan={7}><div className="empty-state"><div className="empty-state-text">{t('workers.none')}</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
