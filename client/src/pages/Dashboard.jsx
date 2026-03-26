import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [flagged, setFlagged] = useState([]);
  const [pendingSick, setPendingSick] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/time-entries/flagged').catch(() => []),
      api.get('/sick-leave?status=pending').catch(() => []),
      api.get('/workers').catch(() => []),
      api.get(`/tasks/daily?date=${todayStr()}`).catch(() => []),
    ]).then(([f, s, w, t]) => {
      setFlagged(f);
      setPendingSick(s);
      setWorkers(w);
      setTasks(t);
      setLoading(false);
    });
  }, []);

  const activeTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'done');

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Guten Morgen' : now.getHours() < 18 ? 'Guten Tag' : 'Guten Abend';
  const dateStr = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting}</h1>
          <p className="text-secondary mt-sm" style={{ fontSize: '0.88rem' }}>{dateStr}</p>
        </div>
        <div className="page-header-actions">
          <Link to="/daily-tasks" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Tagesansicht
          </Link>
          <Link to="/reports" className="btn btn-secondary">
            Bericht erstellen
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stat-grid stagger-children">
        <div className="stat-card danger">
          <div className="stat-icon danger">!</div>
          <div className="stat-label">Offene Flags</div>
          <div className="stat-value mono">{loading ? '—' : flagged.length}</div>
          <div className="stat-detail">Zeiteintraege pruefen</div>
        </div>

        <div className="stat-card warning">
          <div className="stat-icon warning">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div className="stat-label">Krankmeldungen</div>
          <div className="stat-value mono">{loading ? '—' : pendingSick.length}</div>
          <div className="stat-detail">Offene Meldungen</div>
        </div>

        <div className="stat-card accent">
          <div className="stat-icon accent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-label">Mitarbeiter</div>
          <div className="stat-value mono">{loading ? '—' : workers.length}</div>
          <div className="stat-detail">Aktive Mitarbeiter</div>
        </div>

        <div className="stat-card info">
          <div className="stat-icon info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="stat-label">Aufgaben heute</div>
          <div className="stat-value mono">{loading ? '—' : `${doneTasks.length}/${tasks.length}`}</div>
          <div className="stat-detail">{activeTasks.length} aktiv</div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Flagged Entries */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
              Offene Flags
            </div>
            <Link to="/time-entries" className="btn btn-ghost btn-sm">Alle anzeigen</Link>
          </div>
          {flagged.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <div className="empty-state-icon">&#10003;</div>
              <div className="empty-state-text">Keine offenen Flags</div>
            </div>
          ) : (
            <div>
              {flagged.slice(0, 5).map(f => (
                <div key={f.id} style={{
                  padding: '0.7rem 0',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.worker_name}</div>
                    <div className="text-sm text-muted">{f.date}</div>
                  </div>
                  <span className="badge badge-danger">{f.flag_reason}</span>
                </div>
              ))}
              {flagged.length > 5 && (
                <div className="text-sm text-muted mt-sm">+{flagged.length - 5} weitere</div>
              )}
            </div>
          )}
        </div>

        {/* Pending Sick Leave */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              Offene Krankmeldungen
            </div>
            <Link to="/sick-leave" className="btn btn-ghost btn-sm">Alle anzeigen</Link>
          </div>
          {pendingSick.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <div className="empty-state-icon">&#10003;</div>
              <div className="empty-state-text">Keine offenen Krankmeldungen</div>
            </div>
          ) : (
            <div>
              {pendingSick.slice(0, 5).map(s => (
                <div key={s.id} style={{
                  padding: '0.7rem 0',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.worker_name}</div>
                    <div className="text-sm text-muted">ab {s.start_date}</div>
                  </div>
                  <span className="badge badge-warning">{s.declared_days} Tage</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Today's Active Tasks */}
      {activeTasks.length > 0 && (
        <div className="card mt-lg">
          <div className="card-header">
            <div className="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Aktive Aufgaben heute
            </div>
            <Link to="/daily-tasks" className="btn btn-ghost btn-sm">Tagesansicht</Link>
          </div>
          <div>
            {activeTasks.slice(0, 6).map(t => (
              <div key={t.id} style={{
                padding: '0.6rem 0',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.address}</span>
                  {t.city && <span className="text-muted text-sm"> — {t.city}</span>}
                  {t.task_description && (
                    <div className="text-sm text-secondary">{t.task_description}</div>
                  )}
                </div>
                <div className="flex gap-sm items-center">
                  {t.team_name && <span className="badge badge-neutral">{t.team_name}</span>}
                  <span className={`badge ${t.status === 'in_progress' ? 'badge-info' : 'badge-accent'}`}>
                    {t.status === 'in_progress' ? 'In Bearbeitung' : 'Offen'}
                  </span>
                </div>
              </div>
            ))}
            {activeTasks.length > 6 && (
              <div className="text-sm text-muted mt-sm">+{activeTasks.length - 6} weitere Aufgaben</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
