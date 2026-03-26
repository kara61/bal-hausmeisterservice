import { useState } from 'react';

const STATUS_COLORS = {
  pending: '#e2e8f0',
  in_progress: '#bee3f8',
  done: '#c6f6d5',
  postponed: '#fed7d7',
  carried_over: '#fefcbf',
};

const STATUS_LABELS = {
  pending: 'Offen',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
  postponed: 'Verschoben',
  carried_over: 'Uebertragen',
};

export default function TaskCard({ task, teams, onAssign, onPostpone }) {
  const [selectedTeam, setSelectedTeam] = useState('');

  const bg = STATUS_COLORS[task.status] || '#e2e8f0';

  return (
    <div style={{ background: bg, padding: '1rem', borderRadius: '8px', marginBottom: '0.5rem' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{task.address} {task.city && `- ${task.city}`}</div>
      {task.task_description && <div style={{ marginBottom: '0.25rem' }}>{task.task_description}</div>}
      <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
        Status: {STATUS_LABELS[task.status] || task.status}
        {task.team_name && ` | Team: ${task.team_name}`}
      </div>
      {task.postpone_reason && (
        <div style={{ fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '0.25rem' }}>Grund: {task.postpone_reason}</div>
      )}
      {task.photo_url && (
        <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
          <a href={task.photo_url} target="_blank" rel="noreferrer" style={{ color: '#2b6cb0' }}>Foto ansehen</a>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
        {task.status === 'pending' && !task.team_id && teams && teams.length > 0 && (
          <>
            <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)}
              style={{ padding: '0.25rem', border: '1px solid #ccc', borderRadius: '4px' }}>
              <option value="">-- Team zuweisen --</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button disabled={!selectedTeam} onClick={() => { onAssign(task.id, Number(selectedTeam)); setSelectedTeam(''); }}
              style={{ padding: '0.25rem 0.75rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Zuweisen</button>
          </>
        )}
        {(task.status === 'pending' || task.status === 'in_progress') && (
          <button onClick={() => onPostpone(task.id)}
            style={{ padding: '0.25rem 0.75rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Verschieben</button>
        )}
      </div>
    </div>
  );
}
