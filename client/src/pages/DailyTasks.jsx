import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import TaskCard from '../components/TaskCard';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function DailyTasks() {
  const [date, setDate] = useState(todayStr());
  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const { t } = useLang();

  const load = async () => {
    const [tk, tm, w] = await Promise.all([
      api.get(`/tasks/daily?date=${date}`),
      api.get(`/teams?date=${date}`),
      api.get('/workers'),
    ]);
    setTasks(tk);
    setTeams(tm);
    setWorkers(w);
  };

  useEffect(() => { load(); }, [date]);

  const handleGenerate = async () => {
    await api.post('/tasks/generate', { date });
    load();
  };

  const handleCarryover = async () => {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    const from_date = prev.toISOString().slice(0, 10);
    await api.post('/tasks/carryover', { from_date, to_date: date });
    load();
  };

  const handleAssign = async (taskId, teamId) => {
    await api.put(`/tasks/${taskId}/assign`, { team_id: teamId });
    load();
  };

  const handlePostpone = async (taskId) => {
    const reason = prompt(t('tasks.postponeReason'));
    if (reason === null) return;
    const newDate = prompt(t('tasks.newDate'), date);
    if (!newDate) return;
    await api.put(`/tasks/${taskId}/postpone`, { reason, new_date: newDate });
    load();
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    await api.post('/teams', { name: teamName, date, worker_ids: selectedWorkers });
    setTeamName('');
    setSelectedWorkers([]);
    setShowTeamForm(false);
    load();
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

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t('tasks.title')}</h1>
        <div className="page-header-actions">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" style={{ width: 'auto' }} />
          <button onClick={handleGenerate} className="btn btn-primary">{t('tasks.generate')}</button>
          <button onClick={handleCarryover} className="btn btn-secondary">{t('tasks.carryover')}</button>
        </div>
      </div>

      <div className="card mb-lg">
        <div className="card-header">
          <div className="card-title">{t('tasks.teams')} ({date})</div>
          <button onClick={() => setShowTeamForm(!showTeamForm)} className="btn btn-primary btn-sm">{t('tasks.createTeam')}</button>
        </div>

        {teams.length > 0 ? (
          <div className="flex gap-sm flex-wrap">
            {teams.map(tm => (
              <div key={tm.id} className="team-chip">
                <strong>{tm.name}</strong>
                {tm.members && <span className="text-sm text-secondary">({tm.members.map(m => m.name).join(', ')})</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm">{t('tasks.noTeams')}</p>
        )}

        {showTeamForm && (
          <form onSubmit={handleCreateTeam} className="mt-md" style={{ padding: '1rem', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-sm)' }}>
            <div className="mb-sm">
              <input required value={teamName} onChange={e => setTeamName(e.target.value)} placeholder={t('tasks.teamName')} className="input" style={{ width: 'auto', minWidth: '200px' }} />
            </div>
            <div className="flex gap-sm flex-wrap mb-sm">
              {workers.map(w => (
                <label key={w.id} className="flex items-center gap-xs" style={{ cursor: 'pointer', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={selectedWorkers.includes(w.id)} onChange={() => toggleWorker(w.id)} style={{ accentColor: 'var(--accent)' }} />
                  {w.name}
                </label>
              ))}
            </div>
            <div className="flex gap-sm">
              <button type="submit" className="btn btn-primary btn-sm">{t('common.create')}</button>
              <button type="button" onClick={() => setShowTeamForm(false)} className="btn btn-secondary btn-sm">{t('common.cancel')}</button>
            </div>
          </form>
        )}
      </div>

      {unassigned.length > 0 && (
        <div className="task-section">
          <div className="task-section-header">
            <span className="task-section-title text-danger">{t('tasks.unassigned')}</span>
            <span className="task-section-count">{unassigned.length}</span>
          </div>
          {unassigned.map(tk => <TaskCard key={tk.id} task={tk} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {active.length > 0 && (
        <div className="task-section">
          <div className="task-section-header">
            <span className="task-section-title" style={{ color: 'var(--info)' }}>{t('tasks.activeTitle')}</span>
            <span className="task-section-count">{active.length}</span>
          </div>
          {active.map(tk => <TaskCard key={tk.id} task={tk} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {done.length > 0 && (
        <div className="task-section">
          <div className="task-section-header">
            <span className="task-section-title text-success">{t('tasks.doneTitle')}</span>
            <span className="task-section-count">{done.length}</span>
          </div>
          {done.map(tk => <TaskCard key={tk.id} task={tk} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {other.length > 0 && (
        <div className="task-section">
          <div className="task-section-header">
            <span className="task-section-title text-warning">{t('tasks.postponedCarried')}</span>
            <span className="task-section-count">{other.length}</span>
          </div>
          {other.map(tk => <TaskCard key={tk.id} task={tk} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {tasks.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="empty-state-text">{t('tasks.none')}</div>
        </div>
      )}
    </div>
  );
}
