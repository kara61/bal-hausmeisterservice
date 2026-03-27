import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import PropertyForm from '../components/PropertyForm';

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

  const SortHeader = ({ col, children }) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      <span className="flex items-center gap-xs">
        {children}
        {sortKey === col && <span style={{ opacity: 0.6 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );

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
        <h1 className="page-title">{t('properties.title')}</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); setError(null); }} className="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('properties.new')}
        </button>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">
          {error}
        </div>
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
              <th style={{ width: '36px' }}>#</th>
              <SortHeader col="address">{t('common.address')}</SortHeader>
              <SortHeader col="city">{t('common.city')}</SortHeader>
              <SortHeader col="tasks">{t('properties.tasks')}</SortHeader>
              <SortHeader col="weekday">{t('properties.weekday')}</SortHeader>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id}>
                <td className="mono text-muted">{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{p.address}</td>
                <td>{p.city}</td>
                <td className="text-secondary">
                  {p.tasks && p.tasks.length > 0
                    ? p.tasks.map(t => t.task_name).join(', ')
                    : '—'}
                </td>
                <td>
                  {p.assigned_weekday !== null && p.assigned_weekday !== undefined
                    ? <span className="badge badge-accent">{t(`day.${p.assigned_weekday}`)}</span>
                    : <span className="text-muted">—</span>}
                </td>
                <td>
                  <div className="flex gap-xs">
                    <button onClick={() => { setEditing(p); setShowForm(true); }} className="btn btn-secondary btn-sm">{t('common.edit')}</button>
                    <button onClick={() => handleDelete(p.id)} className="btn btn-danger btn-sm">{t('common.deactivate')}</button>
                  </div>
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <tr><td colSpan={6}><div className="empty-state"><div className="empty-state-text">{t('properties.none')}</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
