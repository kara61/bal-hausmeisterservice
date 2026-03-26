import { useState, useEffect } from 'react';
import { api } from '../api/client';
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

  const load = async () => {
    const [t, tm, w] = await Promise.all([
      api.get(`/tasks/daily?date=${date}`),
      api.get(`/teams?date=${date}`),
      api.get('/workers'),
    ]);
    setTasks(t);
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
    const reason = prompt('Grund fuer Verschiebung:');
    if (reason === null) return;
    const newDate = prompt('Neues Datum (YYYY-MM-DD):', date);
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

  const unassigned = tasks.filter(t => t.status === 'pending' && !t.team_id);
  const active = tasks.filter(t => (t.status === 'pending' && t.team_id) || t.status === 'in_progress');
  const done = tasks.filter(t => t.status === 'done');
  const other = tasks.filter(t => t.status === 'postponed' || t.status === 'carried_over');

  return (
    <div>
      <h1>Tagesansicht</h1>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }} />
        <button onClick={handleGenerate} style={{
          padding: '0.5rem 1rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
        }}>Aufgaben generieren</button>
        <button onClick={handleCarryover} style={{
          padding: '0.5rem 1rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer',
        }}>Uebertragen</button>
      </div>

      {/* Teams Section */}
      <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Teams ({date})</h3>
          <button onClick={() => setShowTeamForm(!showTeamForm)} style={{
            padding: '0.25rem 0.75rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
          }}>Team erstellen</button>
        </div>
        {teams.length > 0 ? (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {teams.map(t => (
              <div key={t.id} style={{ padding: '0.5rem 1rem', background: '#edf2f7', borderRadius: '4px' }}>
                <strong>{t.name}</strong>
                {t.members && <span style={{ fontSize: '0.85rem', marginLeft: '0.5rem' }}>({t.members.map(m => m.name).join(', ')})</span>}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#718096', margin: 0 }}>Keine Teams fuer diesen Tag.</p>
        )}
        {showTeamForm && (
          <form onSubmit={handleCreateTeam} style={{ marginTop: '1rem', padding: '1rem', background: '#f7fafc', borderRadius: '4px' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <input required value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Teamname"
                style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', marginRight: '0.5rem' }} />
            </div>
            <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {workers.map(w => (
                <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedWorkers.includes(w.id)} onChange={() => toggleWorker(w.id)} />
                  {w.name}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" style={{ padding: '0.25rem 0.75rem', background: '#1a365d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Erstellen</button>
              <button type="button" onClick={() => setShowTeamForm(false)} style={{ padding: '0.25rem 0.75rem', background: '#edf2f7', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Abbrechen</button>
            </div>
          </form>
        )}
      </div>

      {/* Unassigned Tasks */}
      {unassigned.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#c53030', marginBottom: '0.5rem' }}>Nicht zugewiesen ({unassigned.length})</h3>
          {unassigned.map(t => <TaskCard key={t.id} task={t} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {/* Active Tasks */}
      {active.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Aktiv ({active.length})</h3>
          {active.map(t => <TaskCard key={t.id} task={t} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {/* Done Tasks */}
      {done.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#276749', marginBottom: '0.5rem' }}>Erledigt ({done.length})</h3>
          {done.map(t => <TaskCard key={t.id} task={t} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {/* Postponed / Carried Over */}
      {other.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#975a16', marginBottom: '0.5rem' }}>Verschoben / Uebertragen ({other.length})</h3>
          {other.map(t => <TaskCard key={t.id} task={t} teams={teams} onAssign={handleAssign} onPostpone={handlePostpone} />)}
        </div>
      )}

      {tasks.length === 0 && (
        <p style={{ color: '#718096' }}>Keine Aufgaben fuer diesen Tag. Klicke "Aufgaben generieren" um zu starten.</p>
      )}
    </div>
  );
}
