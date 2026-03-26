import { useState, useEffect } from 'react';
import { api } from '../api/client';

const STATUS_BADGES = {
  pending: 'badge-warning',
  approved: 'badge-success',
  overridden: 'badge-danger',
};

const STATUS_LABELS = {
  pending: 'Offen',
  approved: 'Genehmigt',
  overridden: 'Ueberschrieben',
};

export default function SickLeave() {
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = async () => {
    const data = await api.get('/sick-leave');
    setRecords(data);
  };

  useEffect(() => { load(); }, []);

  const startEdit = (record) => {
    setEditingId(record.id);
    setEditForm({
      aok_approved_days: record.aok_approved_days || '',
      vacation_deducted_days: record.vacation_deducted_days || 0,
      unpaid_days: record.unpaid_days || 0,
      status: record.status,
    });
  };

  const saveEdit = async () => {
    await api.put(`/sick-leave/${editingId}`, editForm);
    setEditingId(null);
    load();
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Krankmeldungen</h1>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mitarbeiter</th>
              <th>Startdatum</th>
              <th>Gemeldet</th>
              <th>AOK</th>
              <th>Urlaub</th>
              <th>Unbezahlt</th>
              <th>Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.worker_name}</td>
                <td><span className="mono">{new Date(r.start_date).toLocaleDateString('de-DE')}</span></td>
                <td><span className="mono">{r.declared_days} Tage</span></td>
                <td>
                  {editingId === r.id
                    ? <input type="number" value={editForm.aok_approved_days} onChange={e => setEditForm(f => ({ ...f, aok_approved_days: parseInt(e.target.value) }))} className="input" style={{ width: '70px' }} />
                    : <span className="mono">{r.aok_approved_days !== null ? `${r.aok_approved_days} Tage` : '—'}</span>}
                </td>
                <td>
                  {editingId === r.id
                    ? <input type="number" value={editForm.vacation_deducted_days} onChange={e => setEditForm(f => ({ ...f, vacation_deducted_days: parseInt(e.target.value) }))} className="input" style={{ width: '70px' }} />
                    : <span className="mono">{r.vacation_deducted_days} Tage</span>}
                </td>
                <td>
                  {editingId === r.id
                    ? <input type="number" value={editForm.unpaid_days} onChange={e => setEditForm(f => ({ ...f, unpaid_days: parseInt(e.target.value) }))} className="input" style={{ width: '70px' }} />
                    : <span className="mono">{r.unpaid_days} Tage</span>}
                </td>
                <td>
                  {editingId === r.id ? (
                    <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className="select" style={{ width: 'auto' }}>
                      <option value="pending">Offen</option>
                      <option value="approved">Genehmigt</option>
                      <option value="overridden">Ueberschrieben</option>
                    </select>
                  ) : (
                    <span className={`badge ${STATUS_BADGES[r.status] || 'badge-neutral'}`}>{STATUS_LABELS[r.status]}</span>
                  )}
                </td>
                <td>
                  {editingId === r.id ? (
                    <div className="flex gap-xs">
                      <button onClick={saveEdit} className="btn btn-success btn-sm">Speichern</button>
                      <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">Abbrechen</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(r)} className="btn btn-secondary btn-sm">Bearbeiten</button>
                  )}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-text">Keine Krankmeldungen vorhanden</div></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
