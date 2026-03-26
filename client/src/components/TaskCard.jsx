import { useState } from 'react';

const STATUS_LABELS = {
  pending: 'Offen',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
  postponed: 'Verschoben',
  carried_over: 'Uebertragen',
};

const STATUS_BADGE_CLASS = {
  pending: 'badge-neutral',
  in_progress: 'badge-info',
  done: 'badge-success',
  postponed: 'badge-warning',
  carried_over: 'badge-accent',
};

export default function TaskCard({ task, teams, onAssign, onPostpone }) {
  const [selectedTeam, setSelectedTeam] = useState('');

  return (
    <div className={`task-card status-${task.status}`}>
      <div className="flex justify-between items-center">
        <div className="task-card-title">
          {task.address} {task.city && <span className="text-secondary"> — {task.city}</span>}
        </div>
        <span className={`badge ${STATUS_BADGE_CLASS[task.status] || 'badge-neutral'}`}>
          {STATUS_LABELS[task.status] || task.status}
        </span>
      </div>

      {task.task_description && <div className="task-card-meta">{task.task_description}</div>}

      {task.team_name && (
        <div className="task-card-meta">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px' }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          {task.team_name}
        </div>
      )}

      {task.postpone_reason && <div className="task-card-reason">Grund: {task.postpone_reason}</div>}

      {task.photo_url && (
        <div className="task-card-meta">
          <a href={task.photo_url} target="_blank" rel="noreferrer" className="text-accent" style={{ textDecoration: 'none' }}>
            Foto ansehen
          </a>
        </div>
      )}

      <div className="task-card-actions">
        {task.status === 'pending' && !task.team_id && teams && teams.length > 0 && (
          <>
            <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="select" style={{ width: 'auto', minWidth: '140px' }}>
              <option value="">-- Team zuweisen --</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button disabled={!selectedTeam} onClick={() => { onAssign(task.id, Number(selectedTeam)); setSelectedTeam(''); }} className="btn btn-primary btn-sm">
              Zuweisen
            </button>
          </>
        )}
        {(task.status === 'pending' || task.status === 'in_progress') && (
          <button onClick={() => onPostpone(task.id)} className="btn btn-secondary btn-sm">Verschieben</button>
        )}
      </div>
    </div>
  );
}
