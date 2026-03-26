import { useState, useEffect } from 'react';
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

  const statusBadge = { pending: 'badge-warning', approved: 'badge-success', overridden: 'badge-danger' };
  const statusLabel = (s) => t(`common.${s === 'pending' ? 'open' : s}`);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('sickLeave.title')}</h1>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">
          {error}
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
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
            {records.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.worker_name}</td>
                <td><span className="mono">{new Date(r.start_date).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE')}</span></td>
                <td><span className="mono">{r.declared_days} {t('common.days')}</span></td>
                <td>
                  {editingId === r.id
                    ? <input type="number" value={editForm.aok_approved_days} onChange={e => setEditForm(f => ({ ...f, aok_approved_days: parseInt(e.target.value) }))} className="input" style={{ width: '70px' }} />
                    : <span className="mono">{r.aok_approved_days !== null ? `${r.aok_approved_days} ${t('common.days')}` : '—'}</span>}
                </td>
                <td>
                  {editingId === r.id
                    ? <input type="number" value={editForm.vacation_deducted_days} onChange={e => setEditForm(f => ({ ...f, vacation_deducted_days: parseInt(e.target.value) }))} className="input" style={{ width: '70px' }} />
                    : <span className="mono">{r.vacation_deducted_days} {t('common.days')}</span>}
                </td>
                <td>
                  {editingId === r.id
                    ? <input type="number" value={editForm.unpaid_days} onChange={e => setEditForm(f => ({ ...f, unpaid_days: parseInt(e.target.value) }))} className="input" style={{ width: '70px' }} />
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
                      <button onClick={saveEdit} className="btn btn-success btn-sm">{t('common.save')}</button>
                      <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">{t('common.cancel')}</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(r)} className="btn btn-secondary btn-sm">{t('common.edit')}</button>
                  )}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-text">{t('sickLeave.none')}</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
