import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import '../styles/weekly-planner.css';

const DAY_SHORT_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_ICONS = {
  done: { icon: '✓', cls: 'done' },
  postponed: { icon: '⏸', cls: 'postponed' },
  missed: { icon: '✗', cls: 'missed' },
  in_progress: { icon: '⟳', cls: 'in_progress' },
};

const TYPE_KEYS = ['field', 'cleaning', 'garbage', 'extra'];

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function fmtDE(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${d}.${m}.`;
}

function fmtFullDE(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

export default function WeeklyPlanner() {
  const { t, lang } = useLang();
  const dayShort = lang === 'de' ? DAY_SHORT_DE : DAY_SHORT_EN;
  const todayStr = toDateStr(new Date());

  const [weekStart, setWeekStart] = useState(() => toDateStr(getMonday(new Date())));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [activeTypes, setActiveTypes] = useState(new Set(TYPE_KEYS));
  const [filterPropertyId, setFilterPropertyId] = useState('');
  const [filterWorkerId, setFilterWorkerId] = useState('');
  const [properties, setProperties] = useState([]);
  const [workers, setWorkers] = useState([]);

  // Load properties and workers for filter dropdowns
  useEffect(() => {
    api.get('/properties').then(setProperties).catch(() => {});
    api.get('/workers').then(setWorkers).catch(() => {});
  }, []);

  // Load weekly data
  useEffect(() => {
    setLoading(true);
    setError(null);
    api.get(`/weekly-planner?week_start=${weekStart}`)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [weekStart]);

  const navigateWeek = (offset) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + offset * 7);
    setWeekStart(toDateStr(d));
  };

  const goToday = () => setWeekStart(toDateStr(getMonday(new Date())));

  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Determine overall mode badge
  const overallMode = useMemo(() => {
    if (!data) return 'current';
    const modes = Object.values(data.days).map(d => d.mode);
    if (modes.every(m => m === 'forecast')) return 'forecast';
    if (modes.every(m => m === 'history')) return 'history';
    return 'current';
  }, [data]);

  // Collect unique workers/properties from data for smart filtering
  const filteredDays = useMemo(() => {
    if (!data) return {};
    const result = {};
    for (const [dateStr, day] of Object.entries(data.days)) {
      let tasks = day.tasks.filter(t => activeTypes.has(t.type));
      if (filterPropertyId) tasks = tasks.filter(t => String(t.property_id) === filterPropertyId);
      if (filterWorkerId) tasks = tasks.filter(t => String(t.worker_id) === filterWorkerId);
      result[dateStr] = { ...day, tasks };
    }
    return result;
  }, [data, activeTypes, filterPropertyId, filterWorkerId]);

  // Is the entire week in forecast? (hide worker filter)
  const hasHistoryDays = data && Object.values(data.days).some(d => d.mode !== 'forecast');

  // 8-week limit check
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 56);
  const isAtFutureLimit = new Date(weekStart + 'T00:00:00') >= maxDate;

  if (loading && !data) {
    return <div className="weekly-planner"><p>{t('weeklyPlanner.title')}...</p></div>;
  }

  if (error) {
    return <div className="weekly-planner"><p className="text-danger">{error}</p></div>;
  }

  if (!data) return null;

  const weekDates = Object.keys(data.days).sort();

  return (
    <div className="weekly-planner">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="week-nav">
          <button className="btn btn-sm btn-ghost" onClick={() => navigateWeek(-1)}>◀</button>
          <div className="week-label">
            KW {data.calendar_week} — {fmtFullDE(data.week_start)}–{fmtFullDE(data.week_end)}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => navigateWeek(1)} disabled={isAtFutureLimit}>▶</button>
          <button className="btn btn-sm btn-ghost" onClick={goToday}>{t('weeklyPlanner.today')}</button>
        </div>
        <span className={`mode-badge ${overallMode}`}>
          {overallMode === 'history' ? t('weeklyPlanner.history')
            : overallMode === 'forecast' ? t('weeklyPlanner.forecastBadge')
            : t('weeklyPlanner.currentBadge')}
        </span>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <span className="filter-label">Filter:</span>
        {TYPE_KEYS.map(type => (
          <span
            key={type}
            className={`type-pill ${type} ${activeTypes.has(type) ? '' : 'inactive'}`}
            onClick={() => toggleType(type)}
          >
            {activeTypes.has(type) ? '✓ ' : ''}{t(`weeklyPlanner.${type}`)}
          </span>
        ))}
        <span className="filter-sep" />
        <select value={filterPropertyId} onChange={e => setFilterPropertyId(e.target.value)}>
          <option value="">{t('weeklyPlanner.allProperties')}</option>
          {properties.filter(p => p.is_active).map(p => (
            <option key={p.id} value={p.id}>{p.address}</option>
          ))}
        </select>
        {hasHistoryDays && (
          <select value={filterWorkerId} onChange={e => setFilterWorkerId(e.target.value)}>
            <option value="">{t('weeklyPlanner.allWorkers')}</option>
            {workers.filter(w => w.is_active).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Calendar Grid */}
      <div className="calendar-grid">
        {weekDates.map(dateStr => {
          const day = filteredDays[dateStr];
          if (!day) return null;
          const d = new Date(dateStr + 'T00:00:00');
          const dayIdx = d.getDay();
          const isToday = dateStr === todayStr;
          const isForecast = day.mode === 'forecast';

          return (
            <div key={dateStr} className="day-column">
              <div className={`day-header ${isToday ? 'today' : ''}`}>
                {dayShort[dayIdx]} {fmtDE(dateStr)}
                {isToday && ' ● ' + t('weeklyPlanner.today')}
                {isForecast && !isToday && (
                  <span className="forecast-label">{t('weeklyPlanner.forecast')}</span>
                )}
              </div>
              <div className={`day-body ${isToday ? 'today-bg' : ''} ${isForecast ? 'forecast-bg' : ''}`}>
                {day.tasks.length === 0 ? (
                  <div className="no-tasks">{t('weeklyPlanner.noTasks')}</div>
                ) : (
                  day.tasks.map((task, i) => (
                    <div key={i} className={`task-card ${task.type} ${isForecast ? 'forecast-card' : ''}`}>
                      <div className="card-top">
                        <span className={`type-label ${task.type}`}>
                          {t(`weeklyPlanner.${task.type}`)}
                        </span>
                        {task.status && STATUS_ICONS[task.status] && (
                          <span className={`status-icon ${STATUS_ICONS[task.status].cls}`}>
                            {STATUS_ICONS[task.status].icon}
                          </span>
                        )}
                      </div>
                      <div className="property-name">{task.property_address}</div>
                      <div className="task-name">{task.task_name}</div>
                      {task.worker_name && (
                        <div className={`worker-name ${task.type}`}>{task.worker_name}</div>
                      )}
                      {task.status === 'postponed' && task.postponed_to && (
                        <div className="postpone-note">
                          → {t('weeklyPlanner.postponedTo')} {fmtDE(task.postponed_to)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="legend">
        <span><span className="status-icon done">✓</span> {t('weeklyPlanner.done')}</span>
        <span><span className="status-icon postponed">⏸</span> {t('weeklyPlanner.postponed')}</span>
        <span><span className="status-icon missed">✗</span> {t('weeklyPlanner.missed')}</span>
        <span><span className="status-icon in_progress">⟳</span> {t('weeklyPlanner.inProgress')}</span>
        <span className="dashed-hint">{t('weeklyPlanner.dashedHint')}</span>
      </div>
    </div>
  );
}
