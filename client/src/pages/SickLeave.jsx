import { useState, useEffect } from 'react';
import { api } from '../api/client';

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

  const statusColors = { pending: '#fefcbf', approved: '#c6f6d5', overridden: '#fed7d7' };
  const statusLabels = { pending: 'Offen', approved: 'Genehmigt', overridden: 'Ueberschrieben' };

  return (
    <div>
      <h1 style={{ marginBottom: '1rem' }}>Krankmeldungen</h1>
      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Mitarbeiter</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Startdatum</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Gemeldet</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>AOK</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Urlaub</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Unbezahlt</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '0.75rem' }}>{r.worker_name}</td>
              <td style={{ padding: '0.75rem' }}>{new Date(r.start_date).toLocaleDateString('de-DE')}</td>
              <td style={{ padding: '0.75rem' }}>{r.declared_days} Tage</td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id
                  ? <input type="number" value={editForm.aok_approved_days} onChange={e => setEditForm(f => ({ ...f, aok_approved_days: parseInt(e.target.value) }))} style={{ width: '60px' }} />
                  : (r.aok_approved_days !== null ? `${r.aok_approved_days} Tage` : '-')}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id
                  ? <input type="number" value={editForm.vacation_deducted_days} onChange={e => setEditForm(f => ({ ...f, vacation_deducted_days: parseInt(e.target.value) }))} style={{ width: '60px' }} />
                  : `${r.vacation_deducted_days} Tage`}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id
                  ? <input type="number" value={editForm.unpaid_days} onChange={e => setEditForm(f => ({ ...f, unpaid_days: parseInt(e.target.value) }))} style={{ width: '60px' }} />
                  : `${r.unpaid_days} Tage`}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id ? (
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="pending">Offen</option>
                    <option value="approved">Genehmigt</option>
                    <option value="overridden">Ueberschrieben</option>
                  </select>
                ) : (
                  <span style={{ padding: '0.15rem 0.5rem', borderRadius: '12px', background: statusColors[r.status], fontSize: '0.8rem' }}>
                    {statusLabels[r.status]}
                  </span>
                )}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === r.id ? (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={saveEdit} style={{ padding: '0.25rem 0.5rem', background: '#c6f6d5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Speichern</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '0.25rem 0.5rem', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Abbrechen</button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(r)} style={{ padding: '0.25rem 0.5rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Bearbeiten</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
