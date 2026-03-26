import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [flagged, setFlagged] = useState([]);
  const [pendingSick, setPendingSick] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t, lang } = useLang();

  useEffect(() => {
    Promise.all([
      api.get('/time-entries/flagged').catch(() => []),
      api.get('/sick-leave?status=pending').catch(() => []),
      api.get('/workers').catch(() => []),
      api.get(`/tasks/daily?date=${todayStr()}`).catch(() => []),
    ]).then(([f, s, w, tk]) => {
      setFlagged(f);
      setPendingSick(s);
      setWorkers(w);
      setTasks(tk);
      setLoading(false);
    });
  }, []);

  const activeTasks = tasks.filter(tk => tk.status === 'pending' || tk.status === 'in_progress');
  const doneTasks = tasks.filter(tk => tk.status === 'done');

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? t('dashboard.goodMorning') : hour < 18 ? t('dashboard.goodDay') : t('dashboard.goodEvening');
  const dateStr = now.toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
            {t('dashboard.dailyView')}
          </Link>
          <Link to="/reports" className="btn btn-secondary">
            {t('dashboard.createReport')}
          </Link>
        </div>
      </div>

      <div className="stat-grid stagger-children">
        <div className="stat-card danger">
          <div className="stat-icon danger">!</div>
          <div className="stat-label">{t('dashboard.openFlags')}</div>
          <div className="stat-value mono">{loading ? '—' : flagged.length}</div>
          <div className="stat-detail">{t('dashboard.checkTimeEntries')}</div>
        </div>

        <div className="stat-card warning">
          <div className="stat-icon warning">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div className="stat-label">{t('dashboard.sickReports')}</div>
          <div className="stat-value mono">{loading ? '—' : pendingSick.length}</div>
          <div className="stat-detail">{t('dashboard.openReports')}</div>
        </div>

        <div className="stat-card accent">
          <div className="stat-icon accent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="stat-label">{t('dashboard.employees')}</div>
          <div className="stat-value mono">{loading ? '—' : workers.length}</div>
          <div className="stat-detail">{t('dashboard.activeEmployees')}</div>
        </div>

        <div className="stat-card info">
          <div className="stat-icon info">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="stat-label">{t('dashboard.tasksToday')}</div>
          <div className="stat-value mono">{loading ? '—' : `${doneTasks.length}/${tasks.length}`}</div>
          <div className="stat-detail">{activeTasks.length} {t('dashboard.active')}</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t('dashboard.openFlags')}</div>
            <Link to="/time-entries" className="btn btn-ghost btn-sm">{t('dashboard.showAll')}</Link>
          </div>
          {flagged.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <div className="empty-state-icon">&#10003;</div>
              <div className="empty-state-text">{t('dashboard.noOpenFlags')}</div>
            </div>
          ) : (
            <div>
              {flagged.slice(0, 5).map(f => (
                <div key={f.id} style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.worker_name}</div>
                    <div className="text-sm text-muted">{f.date}</div>
                  </div>
                  <span className="badge badge-danger">{f.flag_reason}</span>
                </div>
              ))}
              {flagged.length > 5 && <div className="text-sm text-muted mt-sm">+{flagged.length - 5} {t('dashboard.more')}</div>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">{t('dashboard.pendingSickLeave')}</div>
            <Link to="/sick-leave" className="btn btn-ghost btn-sm">{t('dashboard.showAll')}</Link>
          </div>
          {pendingSick.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <div className="empty-state-icon">&#10003;</div>
              <div className="empty-state-text">{t('dashboard.noPendingSick')}</div>
            </div>
          ) : (
            <div>
              {pendingSick.slice(0, 5).map(s => (
                <div key={s.id} style={{ padding: '0.7rem 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.worker_name}</div>
                    <div className="text-sm text-muted">{t('dashboard.from')} {s.start_date}</div>
                  </div>
                  <span className="badge badge-warning">{s.declared_days} {t('common.days')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeTasks.length > 0 && (
        <div className="card mt-lg">
          <div className="card-header">
            <div className="card-title">{t('dashboard.activeTasksToday')}</div>
            <Link to="/daily-tasks" className="btn btn-ghost btn-sm">{t('dashboard.dailyView')}</Link>
          </div>
          <div>
            {activeTasks.slice(0, 6).map(tk => (
              <div key={tk.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tk.address}</span>
                  {tk.city && <span className="text-muted text-sm"> — {tk.city}</span>}
                  {tk.task_description && <div className="text-sm text-secondary">{tk.task_description}</div>}
                </div>
                <div className="flex gap-sm items-center">
                  {tk.team_name && <span className="badge badge-neutral">{tk.team_name}</span>}
                  <span className={`badge ${tk.status === 'in_progress' ? 'badge-info' : 'badge-accent'}`}>
                    {tk.status === 'in_progress' ? t('common.inProgress') : t('common.open')}
                  </span>
                </div>
              </div>
            ))}
            {activeTasks.length > 6 && <div className="text-sm text-muted mt-sm">+{activeTasks.length - 6} {t('dashboard.moreTasks')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
