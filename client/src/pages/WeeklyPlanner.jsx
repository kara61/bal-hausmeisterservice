import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import '../styles/weekly-planner.css';

const DAY_SHORT_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_KEYS = ['field', 'cleaning', 'garbage', 'extra'];

const TYPE_ICONS = {
  field: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  cleaning: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6m0 0l4 4m-4-4l-4 4"/><circle cx="12" cy="18" r="4"/></svg>,
  garbage: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>,
  extra: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

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

  useEffect(() => {
    api.get('/properties').then(setProperties).catch(() => {});
    api.get('/workers').then(setWorkers).catch(() => {});
  }, []);

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

  const overallMode = useMemo(() => {
    if (!data) return 'current';
    const modes = Object.values(data.days).map(d => d.mode);
    if (modes.every(m => m === 'forecast')) return 'forecast';
    if (modes.every(m => m === 'history')) return 'history';
    return 'current';
  }, [data]);

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

  const hasHistoryDays = data && Object.values(data.days).some(d => d.mode !== 'forecast');

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 56);
  const isAtFutureLimit = new Date(weekStart + 'T00:00:00') >= maxDate;

  // Stats
  const stats = useMemo(() => {
    if (!data) return { total: 0, done: 0, pct: 0 };
    const allTasks = Object.values(data.days).flatMap(d => d.tasks);
    const total = allTasks.length;
    const done = allTasks.filter(t => t.status === 'done').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="weekly-planner animate-fade-in">
        <div className="ops-loading">
          <div className="ops-loading-dot" /><div className="ops-loading-dot" /><div className="ops-loading-dot" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="weekly-planner animate-fade-in">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const weekDates = Object.keys(data.days).sort();

  return (
    <div className="weekly-planner animate-fade-in">
      {/* Header */}
      <div className="wp-header">
        <div>
          <h1 className="page-title">{t('weeklyPlanner.title')}</h1>
          <p className="text-secondary text-sm mt-sm">
            KW {data.calendar_week} — {fmtFullDE(data.week_start)} – {fmtFullDE(data.week_end)}
          </p>
        </div>
        <div className="wp-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => navigateWeek(-1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button className="btn btn-ghost btn-sm wp-today-btn" onClick={goToday}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {t('weeklyPlanner.today')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigateWeek(1)} disabled={isAtFutureLimit}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <span className={`wp-mode-badge ${overallMode}`}>
            {overallMode === 'history' ? t('weeklyPlanner.history')
              : overallMode === 'forecast' ? t('weeklyPlanner.forecastBadge')
              : t('weeklyPlanner.currentBadge')}
          </span>
        </div>
      </div>

      {/* Stats bar */}
      {stats.total > 0 && (
        <div className="te-stats-bar mb-md animate-fade-in">
          <div className="te-stat" data-color="info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.total}</span>
              <span className="te-stat-label">{t('ops.tasks')}</span>
            </div>
          </div>
          <div className="te-stat" data-color={stats.pct === 100 ? 'success' : stats.pct > 50 ? 'info' : 'accent'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{stats.pct}%</span>
              <span className="te-stat-label">{stats.done}/{stats.total}</span>
            </div>
          </div>
          <div className="te-stat" data-color="accent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <div className="te-stat-content">
              <span className="te-stat-value">{weekDates.length}</span>
              <span className="te-stat-label">{lang === 'de' ? 'Tage' : 'Days'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="wp-filter-bar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        <div className="wp-type-pills">
          {TYPE_KEYS.map(type => (
            <button
              key={type}
              className={`wp-type-pill ${type} ${activeTypes.has(type) ? 'active' : ''}`}
              onClick={() => toggleType(type)}
            >
              {TYPE_ICONS[type]}
              {t(`weeklyPlanner.${type}`)}
            </button>
          ))}
        </div>
        <span className="wp-filter-sep" />
        <select value={filterPropertyId} onChange={e => setFilterPropertyId(e.target.value)} className="select wp-filter-select">
          <option value="">{t('weeklyPlanner.allProperties')}</option>
          {properties.filter(p => p.is_active).map(p => (
            <option key={p.id} value={p.id}>{p.address}</option>
          ))}
        </select>
        {hasHistoryDays && (
          <select value={filterWorkerId} onChange={e => setFilterWorkerId(e.target.value)} className="select wp-filter-select">
            <option value="">{t('weeklyPlanner.allWorkers')}</option>
            {workers.filter(w => w.is_active).map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Calendar Grid */}
      <div className="wp-calendar-grid">
        {weekDates.map(dateStr => {
          const day = filteredDays[dateStr];
          if (!day) return null;
          const d = new Date(dateStr + 'T00:00:00');
          const dayIdx = d.getDay();
          const isToday = dateStr === todayStr;
          const isForecast = day.mode === 'forecast';

          return (
            <div key={dateStr} className={`wp-day-column ${isToday ? 'is-today' : ''} ${isForecast ? 'is-forecast' : ''}`}>
              <div className="wp-day-header">
                <span className="wp-day-name">{dayShort[dayIdx]}</span>
                <span className="wp-day-date">{fmtDE(dateStr)}</span>
                {isToday && (
                  <span className="wp-today-dot" />
                )}
                {isForecast && !isToday && (
                  <span className="wp-forecast-tag">{t('weeklyPlanner.forecast')}</span>
                )}
              </div>
              <div className="wp-day-body">
                {day.tasks.length === 0 ? (
                  <div className="wp-no-tasks">{t('weeklyPlanner.noTasks')}</div>
                ) : (
                  day.tasks.map((task, i) => (
                    <div key={i} className={`wp-task ${task.type} ${isForecast ? 'forecast' : ''} ${task.status === 'done' ? 'is-done' : ''}`}>
                      <div className="wp-task-top">
                        <span className={`wp-task-type ${task.type}`}>
                          {TYPE_ICONS[task.type]}
                        </span>
                        {task.status && (
                          <span className={`wp-task-status ${task.status}`}>
                            {task.status === 'done' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            {task.status === 'postponed' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>}
                            {task.status === 'missed' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                            {task.status === 'in_progress' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                          </span>
                        )}
                      </div>
                      <div className="wp-task-property">{task.property_address}</div>
                      <div className="wp-task-name">{task.task_name}</div>
                      {task.worker_name && (
                        <div className={`wp-task-worker ${task.type}`}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          {task.worker_name}
                        </div>
                      )}
                      {task.status === 'postponed' && task.postponed_to && (
                        <div className="wp-task-postpone">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>
                          {t('weeklyPlanner.postponedTo')} {fmtDE(task.postponed_to)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="wp-day-footer">
                <span className="mono">{day.tasks.length}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="wp-legend">
        <span className="wp-legend-item"><span className="wp-task-status done"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> {t('weeklyPlanner.done')}</span>
        <span className="wp-legend-item"><span className="wp-task-status postponed"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></span> {t('weeklyPlanner.postponed')}</span>
        <span className="wp-legend-item"><span className="wp-task-status missed"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span> {t('weeklyPlanner.missed')}</span>
        <span className="wp-legend-item"><span className="wp-task-status in_progress"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></span> {t('weeklyPlanner.inProgress')}</span>
        <span className="wp-legend-dashed">{t('weeklyPlanner.dashedHint')}</span>
      </div>
    </div>
  );
}
