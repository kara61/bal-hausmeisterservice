import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import PropertyForm from '../components/PropertyForm';

const WEEKDAY_COLORS = {
  1: 'badge-info',     // Monday
  2: 'badge-accent',   // Tuesday
  3: 'badge-success',  // Wednesday
  4: 'badge-warning',  // Thursday
  5: 'badge-danger',   // Friday
  6: 'badge-neutral',  // Saturday
  0: 'badge-neutral',  // Sunday
};

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('address');
  const [sortDir, setSortDir] = useState('asc');
  const { t } = useLang();

  const loadProperties = async () => {
    try {
      const data = await api.get('/properties');
      setProperties(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  useEffect(() => { loadProperties(); }, []);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    const arr = [...properties];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let va, vb;
      if (sortKey === 'weekday') {
        va = a.assigned_weekday ?? 99;
        vb = b.assigned_weekday ?? 99;
      } else if (sortKey === 'tasks') {
        va = (a.tasks || []).length;
        vb = (b.tasks || []).length;
      } else {
        va = (a[sortKey] || '').toLowerCase();
        vb = (b[sortKey] || '').toLowerCase();
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return arr;
  }, [properties, sortKey, sortDir]);

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return null;
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
        {sortDir === 'asc'
          ? <polyline points="18 15 12 9 6 15" />
          : <polyline points="6 9 12 15 18 9" />
        }
      </svg>
    );
  };

  const handleSubmit = async (form) => {
    try {
      setError(null);
      if (editing) {
        await api.put(`/properties/${editing.id}`, form);
      } else {
        await api.post('/properties', form);
      }
      setShowForm(false);
      setEditing(null);
      loadProperties();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleDelete = async (id) => {
    if (confirm(t('properties.confirmDeactivate'))) {
      try {
        setError(null);
        await api.delete(`/properties/${id}`);
        loadProperties();
      } catch (err) {
        setError(err.message || t('common.error'));
      }
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('properties.title')}</h1>
          <p className="text-secondary text-sm mt-sm">{properties.length} {t('properties.title').toLowerCase()}</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); setError(null); }} className="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('properties.new')}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">{error}</div>
      )}

      {showForm && (
        <div className="mb-lg animate-slide-in">
          <PropertyForm property={editing} onSubmit={handleSubmit} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '42px' }}>#</th>
              <th onClick={() => toggleSort('address')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <span className="flex items-center gap-xs">{t('common.address')} <SortIcon col="address" /></span>
              </th>
              <th onClick={() => toggleSort('city')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <span className="flex items-center gap-xs">{t('common.city')} <SortIcon col="city" /></span>
              </th>
              <th onClick={() => toggleSort('tasks')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <span className="flex items-center gap-xs">{t('properties.tasks')} <SortIcon col="tasks" /></span>
              </th>
              <th onClick={() => toggleSort('weekday')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <span className="flex items-center gap-xs">{t('properties.weekday')} <SortIcon col="weekday" /></span>
              </th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id}>
                <td className="mono text-muted">{i + 1}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{p.address}</div>
                </td>
                <td className="text-secondary">{p.city}</td>
                <td>
                  {p.tasks && p.tasks.length > 0 ? (
                    <div className="flex flex-wrap gap-xs">
                      {p.tasks.map((task, ti) => (
                        <span key={ti} className="badge badge-neutral">{task.task_name}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td>
                  {p.assigned_weekday !== null && p.assigned_weekday !== undefined
                    ? <span className={`badge ${WEEKDAY_COLORS[p.assigned_weekday] || 'badge-accent'}`}>{t(`day.${p.assigned_weekday}`)}</span>
                    : <span className="text-muted">—</span>}
                </td>
                <td>
                  <div className="flex gap-xs">
                    <button onClick={() => { setEditing(p); setShowForm(true); }} className="btn btn-secondary btn-sm">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      {t('common.edit')}
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="btn btn-danger btn-sm">
                      {t('common.deactivate')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <div className="empty-state-text">{t('properties.none')}</div>
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
