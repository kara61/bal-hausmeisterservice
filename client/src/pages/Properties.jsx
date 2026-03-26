import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import PropertyForm from '../components/PropertyForm';

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
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
              <th>{t('common.address')}</th>
              <th>{t('common.city')}</th>
              <th>{t('properties.tasks')}</th>
              <th>{t('properties.weekday')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {properties.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.address}</td>
                <td>{p.city}</td>
                <td className="text-secondary">{p.standard_tasks || '—'}</td>
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
              <tr><td colSpan={5}><div className="empty-state"><div className="empty-state-text">{t('properties.none')}</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
