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

  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—';
  const formatDate = (d) => new Date(d).toLocaleDateString('de-DE');

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Zeiterfassung</h1>
        <MonthPicker month={month} year={year} onChange={handleMonthChange} />
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Mitarbeiter</th>
              <th>Einchecken</th>
              <th>Auschecken</th>
              <th>Status</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className={e.is_flagged ? 'flagged' : ''}>
                <td><span className="mono">{formatDate(e.date)}</span></td>
                <td style={{ fontWeight: 600 }}>{e.worker_name}</td>
                <td>
                  {editingId === e.id
                    ? <input type="datetime-local" value={editForm.check_in} onChange={ev => setEditForm(f => ({ ...f, check_in: ev.target.value }))} className="input" style={{ width: 'auto' }} />
                    : <span className="mono">{formatTime(e.check_in)}</span>}
                </td>
                <td>
                  {editingId === e.id
                    ? <input type="datetime-local" value={editForm.check_out} onChange={ev => setEditForm(f => ({ ...f, check_out: ev.target.value }))} className="input" style={{ width: 'auto' }} />
                    : <span className="mono">{formatTime(e.check_out)}</span>}
                </td>
                <td>{e.is_flagged && <FlagBadge reason={e.flag_reason} />}</td>
                <td>
                  {editingId === e.id ? (
                    <div className="flex gap-xs">
                      <button onClick={saveEdit} className="btn btn-success btn-sm">Speichern</button>
                      <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">Abbrechen</button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(e)} className="btn btn-secondary btn-sm">Bearbeiten</button>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-state-text">Keine Eintraege fuer diesen Monat</div>
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
