import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import MonthPicker from '../components/MonthPicker';
import FlagBadge from '../components/FlagBadge';

function calcDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const ms = new Date(checkOut) - new Date(checkIn);
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { h, m, total: ms / 3600000 };
}

export default function TimeEntries() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [entries, setEntries] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState(null);
  const { t, lang } = useLang();

  const load = async () => {
    try {
      const data = await api.get(`/time-entries?month=${month}&year=${year}`);
      setEntries(data);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  useEffect(() => { load(); }, [month, year]);

  const startEdit = (entry) => {
    setError(null);
    setEditingId(entry.id);
    setEditForm({
      check_in: entry.check_in ? entry.check_in.slice(0, 16) : '',
      check_out: entry.check_out ? entry.check_out.slice(0, 16) : '',
    });
  };

  const saveEdit = async () => {
    try {
      setError(null);
      await api.put(`/time-entries/${editingId}`, { ...editForm, resolved: true });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—';
  const formatDate = (d) => new Date(d).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' });

  const stats = useMemo(() => {
    const flagged = entries.filter(e => e.is_flagged).length;
    let totalHours = 0;
    entries.forEach(e => {
      const dur = calcDuration(e.check_in, e.check_out);
      if (dur) totalHours += dur.total;
    });
    return { total: entries.length, flagged, totalHours };
  }, [entries]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('timeEntries.title')}</h1>
          <p className="text-secondary text-sm mt-sm">{stats.total} {t('timeEntries.totalEntries').toLowerCase()}</p>
        </div>
        <MonthPicker month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">{error}</div>
      )}

      {/* Stats bar */}
      {entries.length > 0 && (
        <div className="te-stats-bar mb-md animate-fade-in">
          <div className="te-stat" data-color="info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.totalHours.toFixed(1)}h</span>
              <span className="te-stat-label">{t('timeEntries.totalHours')}</span>
            </div>
          </div>
          <div className="te-stat" data-color="accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.total}</span>
              <span className="te-stat-label">{t('timeEntries.totalEntries')}</span>
            </div>
          </div>
          <div className="te-stat" data-color={stats.flagged > 0 ? 'danger' : 'success'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.flagged > 0 ? stats.flagged : '—'}</span>
              <span className="te-stat-label">{stats.flagged > 0 ? t('timeEntries.flagged') : t('timeEntries.noFlags')}</span>
            </div>
          </div>
        </div>
      )}

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '42px' }}>#</th>
              <th>{t('common.date')}</th>
              <th>{t('timeEntries.worker')}</th>
              <th>{t('timeEntries.checkIn')}</th>
              <th>{t('timeEntries.checkOut')}</th>
              <th>{t('timeEntries.duration')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const dur = calcDuration(e.check_in, e.check_out);
              return (
                <tr key={e.id} className={e.is_flagged ? 'flagged' : ''}>
                  <td className="mono text-muted">{i + 1}</td>
                  <td><span className="mono">{formatDate(e.date)}</span></td>
                  <td>
                    <div className="te-worker-cell">
                      <div className="te-worker-avatar">
                        {(e.worker_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600 }}>{e.worker_name}</span>
                    </div>
                  </td>
                  <td>
                    {editingId === e.id
                      ? <input type="datetime-local" value={editForm.check_in} onChange={ev => setEditForm(f => ({ ...f, check_in: ev.target.value }))} className="input te-edit-input" />
                      : <span className="mono">{formatTime(e.check_in)}</span>}
                  </td>
                  <td>
                    {editingId === e.id
                      ? <input type="datetime-local" value={editForm.check_out} onChange={ev => setEditForm(f => ({ ...f, check_out: ev.target.value }))} className="input te-edit-input" />
                      : <span className="mono">{formatTime(e.check_out)}</span>}
                  </td>
                  <td>
                    {dur ? (
                      <span className={`mono ${dur.total >= 8 ? 'text-accent' : ''}`}>
                        {dur.h}h {String(dur.m).padStart(2, '0')}m
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    {e.is_flagged ? (
                      <FlagBadge reason={e.flag_reason} />
                    ) : (
                      <span className="badge badge-success">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        OK
                      </span>
                    )}
                  </td>
                  <td>
                    {editingId === e.id ? (
                      <div className="flex gap-xs">
                        <button onClick={saveEdit} className="btn btn-success btn-sm">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          {t('common.save')}
                        </button>
                        <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">{t('common.cancel')}</button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(e)} className="btn btn-secondary btn-sm">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        {t('common.edit')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <div className="empty-state-text">{t('timeEntries.none')}</div>
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
