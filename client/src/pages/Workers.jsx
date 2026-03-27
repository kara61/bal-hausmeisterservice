import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import WorkerForm from '../components/WorkerForm';

const ROLE_BADGE = {
  field: 'badge-info',
  cleaning: 'badge-accent',
  office: 'badge-neutral',
};

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

  const handleRoleChange = async (worker, newRole, force = false) => {
    try {
      setError(null);
      setWarning(null);
      const result = await api.put('/workers/role', {
        worker_id: worker.id,
        role: newRole,
        force,
      });
      if (result?._warnings) {
        const messages = [];
        if (result._warnings.includes('last_field_worker')) messages.push(t('workers.lastFieldWorkerWarning'));
        if (result._warnings.includes('future_assignments')) messages.push(t('workers.futureAssignmentsWarning'));
        if (confirm(messages.join('\n\n'))) {
          await handleRoleChange(worker, newRole, true);
        }
        return;
      }
      loadWorkers();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const filteredWorkers = workers.filter(w => {
    if (filter === 'all') return true;
    return w.worker_role === filter;
  });

  const roleCounts = {
    all: workers.length,
    field: workers.filter(w => w.worker_role === 'field').length,
    cleaning: workers.filter(w => w.worker_role === 'cleaning').length,
    office: workers.filter(w => w.worker_role === 'office').length,
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('workers.title')}</h1>
          <p className="text-secondary text-sm mt-sm">{workers.length} {t('workers.title').toLowerCase()}</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); setError(null); setWarning(null); }} className="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          {t('workers.new')}
        </button>
      </div>

      {error && <div className="alert alert-danger mb-md animate-fade-in">{error}</div>}
      {warning && <div className="alert alert-warning mb-md animate-fade-in">{warning}</div>}

      {showForm && (
        <div className="mb-lg animate-slide-in">
          <WorkerForm worker={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </div>
      )}

      {/* Filter tabs */}
      <div className="worker-filter-tabs mb-md">
        {['all', 'field', 'cleaning', 'office'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`worker-filter-tab${filter === f ? ' active' : ''}`}
          >
            {t(`workers.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
            <span className="worker-filter-count">{roleCounts[f]}</span>
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
              <th>{t('workers.role')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredWorkers.map(w => (
              <tr key={w.id}>
                <td>
                  <div className="worker-name-cell">
                    <div className="worker-avatar" data-role={w.worker_role}>
                      {w.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600 }}>{w.name}</span>
                  </div>
                </td>
                <td><span className="mono">{w.phone_number}</span></td>
                <td>
                  <span className={`badge ${w.worker_type === 'fulltime' ? 'badge-accent' : 'badge-neutral'}`}>
                    {w.worker_type === 'fulltime' ? t('common.fulltime') : t('common.minijob')}
                  </span>
                </td>
                <td>
                  <span className="mono">
                    {w.hourly_rate ? `${Number(w.hourly_rate).toFixed(2)} €/h` : '—'}
                  </span>
                </td>
                <td>
                  <span className="mono">{w.vacation_entitlement} {t('common.days')}</span>
                </td>
                <td>
                  <select
                    className="select worker-role-select"
                    value={w.worker_role}
                    onChange={e => handleRoleChange(w, e.target.value)}
                  >
                    <option value="field">{t('workers.role.field')}</option>
                    <option value="cleaning">{t('workers.role.cleaning')}</option>
                    <option value="office">{t('workers.role.office')}</option>
                  </select>
                </td>
                <td>
                  <div className="flex gap-xs">
                    <button onClick={() => { setEditing(w); setShowForm(true); }} className="btn btn-secondary btn-sm">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      {t('common.edit')}
                    </button>
                    <button onClick={() => handleDelete(w.id)} className="btn btn-danger btn-sm">{t('common.deactivate')}</button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredWorkers.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </div>
                    <div className="empty-state-text">{t('workers.none')}</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
