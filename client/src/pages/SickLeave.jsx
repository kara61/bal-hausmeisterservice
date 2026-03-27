import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';

export default function SickLeave() {
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState(null);
  const { t, lang } = useLang();

  const load = async () => {
    try {
      const data = await api.get('/sick-leave');
      setRecords(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (record) => {
    setError(null);
    setEditingId(record.id);
    setEditForm({
      aok_approved_days: record.aok_approved_days || '',
      vacation_deducted_days: record.vacation_deducted_days || 0,
      unpaid_days: record.unpaid_days || 0,
      status: record.status,
    });
  };

  const saveEdit = async () => {
    try {
      setError(null);
      await api.put(`/sick-leave/${editingId}`, editForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const statusBadge = { pending: 'badge-warning', approved: 'badge-success', overridden: 'badge-danger' };
  const statusLabel = (s) => t(`common.${s === 'pending' ? 'open' : s}`);

  const stats = useMemo(() => {
    const pending = records.filter(r => r.status === 'pending').length;
    const totalDays = records.reduce((sum, r) => sum + (r.declared_days || 0), 0);
    return { total: records.length, pending, totalDays };
  }, [records]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('sickLeave.title')}</h1>
          <p className="text-secondary text-sm mt-sm">{stats.total} {t('sickLeave.totalRecords').toLowerCase()}</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">{error}</div>
      )}

      {/* Stats bar */}
      {records.length > 0 && (
        <div className="te-stats-bar mb-md animate-fade-in">
          <div className="te-stat" data-color="danger">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.totalDays}</span>
              <span className="te-stat-label">{t('sickLeave.totalDays')}</span>
            </div>
          </div>
          <div className="te-stat" data-color="accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.total}</span>
              <span className="te-stat-label">{t('sickLeave.totalRecords')}</span>
            </div>
          </div>
          <div className="te-stat" data-color={stats.pending > 0 ? 'warning' : 'success'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.pending > 0 ? stats.pending : '0'}</span>
              <span className="te-stat-label">{t('sickLeave.pendingCount')}</span>
            </div>
          </div>
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '42px' }}>#</th>
              <th>{t('sickLeave.worker')}</th>
              <th>{t('sickLeave.startDate')}</th>
              <th>{t('sickLeave.declared')}</th>
              <th>{t('sickLeave.aok')}</th>
              <th>{t('sickLeave.vacationDeducted')}</th>
              <th>{t('sickLeave.unpaid')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={r.id} className={r.status === 'pending' ? 'flagged' : ''}>
                <td className="mono text-muted">{i + 1}</td>
                <td>
                  <div className="te-worker-cell">
                    <div className="te-worker-avatar">
                      {(r.worker_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600 }}>{r.worker_name}</span>
                  </div>
                </td>
                <td><span className="mono">{new Date(r.start_date).toLocaleDateString(locale)}</span></td>
                <td><span className="mono">{r.declared_days} {t('common.days')}</span></td>
                <td>
                  {editingId === r.id
                    ? <input type="number" value={editForm.aok_approved_days} onChange={e => setEditForm(f => ({ ...f, aok_approved_days: parseInt(e.target.value) }))} className="input te-edit-input" style={{ width: '70px' }} />
                    : <span className="mono">{r.aok_approved_days !== null ? `${r.aok_approved_days} ${t('common.days')}` : '—'}</span>}
                </td>
                <td>
                  {editingId === r.id
                    ? <input type="number" value={editForm.vacation_deducted_days} onChange={e => setEditForm(f => ({ ...f, vacation_deducted_days: parseInt(e.target.value) }))} className="input te-edit-input" style={{ width: '70px' }} />
                    : <span className="mono">{r.vacation_deducted_days} {t('common.days')}</span>}
                </td>
                <td>
                  {editingId === r.id
                    ? <input type="number" value={editForm.unpaid_days} onChange={e => setEditForm(f => ({ ...f, unpaid_days: parseInt(e.target.value) }))} className="input te-edit-input" style={{ width: '70px' }} />
                    : <span className="mono">{r.unpaid_days} {t('common.days')}</span>}
                </td>
                <td>
                  {editingId === r.id ? (
                    <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className="select" style={{ width: 'auto' }}>
                      <option value="pending">{t('common.open')}</option>
                      <option value="approved">{t('common.approved')}</option>
                      <option value="overridden">{t('common.overridden')}</option>
                    </select>
                  ) : (
                    <span className={`badge ${statusBadge[r.status] || 'badge-neutral'}`}>{statusLabel(r.status)}</span>
                  )}
                </td>
                <td>
                  {editingId === r.id ? (
                    <div className="flex gap-xs">
                      <button onClick={saveEdit} className="btn btn-success btn-sm">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        {t('common.save')}
                      </button>
                      <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">{t('common.cancel')}</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(r)} className="btn btn-secondary btn-sm">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      {t('common.edit')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    </div>
                    <div className="empty-state-text">{t('sickLeave.none')}</div>
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
