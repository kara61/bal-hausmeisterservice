import { useState, useEffect } from 'react';
import { api } from '../api/client';
import MonthPicker from '../components/MonthPicker';
import FlagBadge from '../components/FlagBadge';

export default function TimeEntries() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = async () => {
    const data = await api.get(`/time-entries?month=${month}&year=${year}`);
    setEntries(data);
  };

  useEffect(() => { load(); }, [month, year]);

  const handleMonthChange = (m, y) => { setMonth(m); setYear(y); };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditForm({
      check_in: entry.check_in ? entry.check_in.slice(0, 16) : '',
      check_out: entry.check_out ? entry.check_out.slice(0, 16) : '',
    });
  };

  const saveEdit = async () => {
    await api.put(`/time-entries/${editingId}`, { ...editForm, resolved: true });
    setEditingId(null);
    load();
  };

  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '-';
  const formatDate = (d) => new Date(d).toLocaleDateString('de-DE');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Zeiterfassung</h1>
        <MonthPicker month={month} year={year} onChange={handleMonthChange} />
      </div>
      <table style={{ width: '100%', background: 'white', borderRadius: '8px', borderCollapse: 'collapse', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Datum</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Mitarbeiter</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Einchecken</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Auschecken</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id} style={{ borderBottom: '1px solid #e2e8f0', background: e.is_flagged ? '#fff5f5' : 'white' }}>
              <td style={{ padding: '0.75rem' }}>{formatDate(e.date)}</td>
              <td style={{ padding: '0.75rem' }}>{e.worker_name}</td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === e.id
                  ? <input type="datetime-local" value={editForm.check_in} onChange={ev => setEditForm(f => ({ ...f, check_in: ev.target.value }))} />
                  : formatTime(e.check_in)}
              </td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === e.id
                  ? <input type="datetime-local" value={editForm.check_out} onChange={ev => setEditForm(f => ({ ...f, check_out: ev.target.value }))} />
                  : formatTime(e.check_out)}
              </td>
              <td style={{ padding: '0.75rem' }}>{e.is_flagged && <FlagBadge reason={e.flag_reason} />}</td>
              <td style={{ padding: '0.75rem' }}>
                {editingId === e.id ? (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={saveEdit} style={{ padding: '0.25rem 0.5rem', background: '#c6f6d5', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Speichern</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '0.25rem 0.5rem', background: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Abbrechen</button>
                  </div>
                ) : (
                  <button onClick={() => startEdit(e)} style={{ padding: '0.25rem 0.5rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Bearbeiten</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
