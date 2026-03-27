import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import TaskCard from '../components/TaskCard';
import { todayLocal } from '../utils/date';

function todayStr() {
  return todayLocal();
}

export default function DailyTasks() {
  const [date, setDate] = useState(todayStr());
  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [error, setError] = useState(null);
  const { t, lang } = useLang();

  const load = async () => {
    try {
      const [tk, tm, w] = await Promise.all([
        api.get(`/tasks/daily?date=${date}`),
        api.get(`/teams?date=${date}`),
        api.get('/workers'),
      ]);
      setTasks(tk);
      setTeams(tm);
      setWorkers(w);
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  useEffect(() => { load(); }, [date]);

  const handleGenerate = async () => {
    try {
      setError(null);
      await api.post('/tasks/generate', { date });
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleCarryover = async () => {
    try {
      setError(null);
      const prev = new Date(date);
      prev.setDate(prev.getDate() - 1);
      const from_date = prev.toISOString().slice(0, 10);
      await api.post('/tasks/carryover', { from_date, to_date: date });
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleAssign = async (taskId, teamId) => {
    try {
      setError(null);
      await api.put(`/tasks/${taskId}/assign`, { team_id: teamId });
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handlePostpone = async (taskId) => {
    const reason = prompt(t('tasks.postponeReason'));
    if (reason === null) return;
    const newDate = prompt(t('tasks.newDate'), date);
    if (!newDate) return;
    try {
      setError(null);
      await api.put(`/tasks/${taskId}/postpone`, { reason, new_date: newDate });
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      await api.post('/teams', { name: teamName, date, worker_ids: selectedWorkers });
      setTeamName('');
      setSelectedWorkers([]);
      setShowTeamForm(false);
      load();
    } catch (err) {
      setError(err.message || t('common.error'));
    }
  };

  const toggleWorker = (id) => {
    setSelectedWorkers(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  const unassigned = tasks.filter(tk => tk.status === 'pending' && !tk.team_id);
  const active = tasks.filter(tk => (tk.status === 'pending' && tk.team_id) || tk.status === 'in_progress');
  const done = tasks.filter(tk => tk.status === 'done');
  const other = tasks.filter(tk => tk.status === 'postponed' || tk.status === 'carried_over');

  const locale = lang === 'en' ? 'en-GB' : 'de-DE';
  const isToday = date === todayStr();
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  const stats = useMemo(() => {
    const total = tasks.length;
    const doneCount = done.length;
    const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
    return { total, doneCount, pct, unassigned: unassigned.length };
  }, [tasks, done, unassigned]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('tasks.title')}</h1>
          <p className="text-secondary text-sm mt-sm">
            {dateLabel}
            {isToday && <span className="badge badge-success" style={{ marginLeft: '8px', fontSize: '0.7rem' }}>{lang === 'de' ? 'Heute' : 'Today'}</span>}
          </p>
        </div>
        <div className="page-header-actions">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" style={{ width: 'auto' }} />
          <button onClick={handleGenerate} className="btn btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {t('tasks.generate')}
          </button>
          <button onClick={handleCarryover} className="btn btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            {t('tasks.carryover')}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger mb-md animate-fade-in">{error}</div>
      )}

      {/* Stats bar */}
      {tasks.length > 0 && (
        <div className="te-stats-bar mb-md animate-fade-in">
          <div className="te-stat" data-color="accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.total}</span>
              <span className="te-stat-label">{t('tasks.totalTasks')}</span>
            </div>
          </div>
          <div className="te-stat" data-color={stats.pct === 100 ? 'success' : 'info'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.pct}%</span>
              <span className="te-stat-label">{t('tasks.completionRate')}</span>
            </div>
          </div>
          <div className="te-stat" data-color={stats.unassigned > 0 ? 'danger' : 'success'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.unassigned}</span>
              <span className="te-stat-label">{t('tasks.unassigned')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Teams section */}
      <div className="dt-teams-section mb-lg">
        <div className="dt-teams-header">
          <div className="flex items-center gap-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span className="dt-teams-title">{t('tasks.teams')}</span>
            <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{teams.length}</span>
          </div>
          <button onClick={() => { setShowTeamForm(!showTeamForm); setError(null); }} className="btn btn-primary btn-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t('tasks.createTeam')}
          </button>
        </div>

        {teams.length > 0 ? (
          <div className="dt-teams-grid">
            {teams.map(tm => (
              <div key={tm.id} className="dt-team-card">
                <div className="dt-team-name">{tm.name}</div>
                {tm.members && tm.members.length > 0 && (
                  <div className="dt-team-members">
                    {tm.members.map(m => (
                      <div key={m.id} className="dt-team-member">
                        <div className="te-worker-avatar" style={{ width: '22px', height: '22px', fontSize: '0.65rem' }}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <span>{m.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm" style={{ padding: '0.75rem 0' }}>{t('tasks.noTeams')}</p>
        )}

        {showTeamForm && (
          <form onSubmit={handleCreateTeam} className="dt-team-form animate-slide-in">
            <div className="form-row-3">
              <div className="form-group" style={{ gridColumn: 'span 3' }}>
                <label className="form-label">{t('tasks.teamName')} *</label>
                <input required value={teamName} onChange={e => setTeamName(e.target.value)} className="input" />
              </div>
            </div>
            <div className="dt-worker-checkboxes">
              {workers.map(w => (
                <label key={w.id} className={`dt-worker-checkbox ${selectedWorkers.includes(w.id) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={selectedWorkers.includes(w.id)} onChange={() => toggleWorker(w.id)} />
                  <div className="te-worker-avatar" style={{ width: '24px', height: '24px', fontSize: '0.7rem' }}>
                    {w.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{w.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-sm" style={{ marginTop: '0.75rem' }}>
              <button type="submit" className="btn btn-primary btn-sm">{t('common.create')}</button>
              <button type="button" onClick={() => setShowTeamForm(false)} className="btn btn-secondary btn-sm">{t('common.cancel')}</button>
            </div>
          </form>
        )}
      </div>

      {/* Task sections */}
      {unassigned.length > 0 && (
        <div className="task-section">
          <div className="task-section-header">
            <div className="flex items-center gap-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span className="task-section-title text-danger">{t('tasks.unassigned')}</span>
            </div>
            <span className="task-section-count">{unassigned.length}</span>
          </div>
          {unassigned.map(tk => <TaskCard key={tk.id} task={tk} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {active.length > 0 && (
        <div className="task-section">
          <div className="task-section-header">
            <div className="flex items-center gap-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span className="task-section-title" style={{ color: 'var(--info)' }}>{t('tasks.activeTitle')}</span>
            </div>
            <span className="task-section-count">{active.length}</span>
          </div>
          {active.map(tk => <TaskCard key={tk.id} task={tk} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {done.length > 0 && (
        <div className="task-section">
          <div className="task-section-header">
            <div className="flex items-center gap-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span className="task-section-title text-success">{t('tasks.doneTitle')}</span>
            </div>
            <span className="task-section-count">{done.length}</span>
          </div>
          {done.map(tk => <TaskCard key={tk.id} task={tk} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {other.length > 0 && (
        <div className="task-section">
          <div className="task-section-header">
            <div className="flex items-center gap-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>
              <span className="task-section-title text-warning">{t('tasks.postponedCarried')}</span>
            </div>
            <span className="task-section-count">{other.length}</span>
          </div>
          {other.map(tk => <TaskCard key={tk.id} task={tk} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {tasks.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="empty-state-text">{t('tasks.none')}</div>
        </div>
      )}
    </div>
  );
}
