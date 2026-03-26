import { useState } from 'react';
import { useLang } from '../context/LanguageContext';

const STATUS_KEYS = {
  pending: 'common.open',
  in_progress: 'common.inProgress',
  done: 'common.done',
  postponed: 'common.postponed',
  carried_over: 'common.carriedOver',
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
  const { t } = useLang();

  return (
    <div className={`task-card status-${task.status}`}>
      <div className="flex justify-between items-center">
        <div className="task-card-title">
          {task.address} {task.city && <span className="text-secondary"> — {task.city}</span>}
        </div>
        <span className={`badge ${STATUS_BADGE_CLASS[task.status] || 'badge-neutral'}`}>
          {t(STATUS_KEYS[task.status]) || task.status}
        </span>
      </div>

      {task.task_description && <div className="task-card-meta">{task.task_description}</div>}

      {task.team_name && (
        <div className="task-card-meta">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: '-1px', marginRight: '4px' }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          {task.team_name}
        </div>
      )}

      {task.postpone_reason && <div className="task-card-reason">{t('common.reason')}: {task.postpone_reason}</div>}

      {task.photo_url && (
        <div className="task-card-meta">
          <a href={task.photo_url} target="_blank" rel="noreferrer" className="text-accent" style={{ textDecoration: 'none' }}>
            {t('common.viewPhoto')}
          </a>
        </div>
      )}

      <div className="task-card-actions">
        {task.status === 'pending' && !task.team_id && teams && teams.length > 0 && (
          <>
            <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="select" style={{ width: 'auto', minWidth: '140px' }}>
              <option value="">{t('common.selectTeam')}</option>
              {teams.map(tm => (
                <option key={tm.id} value={tm.id}>{tm.name}</option>
              ))}
            </select>
            <button disabled={!selectedTeam} onClick={() => { onAssign(task.id, Number(selectedTeam)); setSelectedTeam(''); }} className="btn btn-primary btn-sm">
              {t('common.assign')}
            </button>
          </>
        )}
        {(task.status === 'pending' || task.status === 'in_progress') && (
          <button onClick={() => onPostpone(task.id)} className="btn btn-secondary btn-sm">{t('common.postpone')}</button>
        )}
      </div>
    </div>
  );
}
