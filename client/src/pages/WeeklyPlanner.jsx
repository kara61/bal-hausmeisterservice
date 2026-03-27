import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useLang } from '../context/LanguageContext';
import '../styles/weekly-planner.css';

const DAY_SHORT_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DAY_LONG_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TYPE_KEYS = ['field', 'cleaning', 'garbage', 'extra'];

const TYPE_LABELS_DE = { field: 'Außendienst', cleaning: 'Reinigung', garbage: 'Müll', extra: 'Sonder' };
const TYPE_LABELS_EN = { field: 'Field', cleaning: 'Cleaning', garbage: 'Garbage', extra: 'Extra' };

const TYPE_ICONS = {
  field: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  cleaning: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6m0 0l4 4m-4-4l-4 4"/><circle cx="12" cy="18" r="4"/></svg>,
  garbage: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>,
  extra: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

const STATUS_ICONS = {
  done: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  postponed: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  missed: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  in_progress: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
};

const DAYS_PER_VIEW = 3;

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
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
  const dayLong = lang === 'de' ? DAY_LONG_DE : DAY_LONG_EN;
  const typeLabels = lang === 'de' ? TYPE_LABELS_DE : TYPE_LABELS_EN;
  const todayStr = toDateStr(new Date());

  const [weekStart, setWeekStart] = useState(() => toDateStr(getMonday(new Date())));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewOffset, setViewOffset] = useState(0);

  // Filters
  const [activeTypes, setActiveTypes] = useState(new Set(TYPE_KEYS));
  const [filterPropertyId, setFilterPropertyId] = useState('');
  const [filterWorkerId, setFilterWorkerId] = useState('');
  const [properties, setProperties] = useState([]);
  const [workers, setWorkers] = useState([]);

  // Collapsed state: { "2026-03-27:field": true, ... }
  const [collapsed, setCollapsed] = useState({});

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

  // Reset view offset when week changes
  useEffect(() => { setViewOffset(0); }, [weekStart]);

  const navigateWeek = (offset) => {
    const d = parseDate(weekStart);
    d.setDate(d.getDate() + offset * 7);
    setWeekStart(toDateStr(d));
  };

  const goToday = () => {
    setWeekStart(toDateStr(getMonday(new Date())));
    // Find which offset shows today
    setViewOffset(0);
  };

  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleCollapse = (dateStr, type) => {
    const key = `${dateStr}:${type}`;
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
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
  const isAtFutureLimit = parseDate(weekStart) >= maxDate;

  // Stats
  const stats = useMemo(() => {
    if (!data) return { total: 0, done: 0, pct: 0 };
    const allTasks = Object.values(data.days).flatMap(d => d.tasks);
    const total = allTasks.length;
    const done = allTasks.filter(t => t.status === 'done').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [data]);

  // Paginated days
  const weekDates = data ? Object.keys(data.days).sort() : [];
  const visibleDates = weekDates.slice(viewOffset, viewOffset + DAYS_PER_VIEW);
  const canGoBack = viewOffset > 0;
  const canGoForward = viewOffset + DAYS_PER_VIEW < weekDates.length;

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

  // Group tasks by type for a given day
  const groupByType = (tasks) => {
    const groups = {};
    for (const type of TYPE_KEYS) {
      const typeTasks = tasks.filter(t => t.type === type);
      if (typeTasks.length > 0) groups[type] = typeTasks;
    }
    return groups;
  };

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

      {/* Day pagination nav */}
      <div className="wp-day-nav">
        <button className="btn btn-ghost btn-sm" disabled={!canGoBack} onClick={() => setViewOffset(v => Math.max(0, v - DAYS_PER_VIEW))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className="wp-day-nav-dots">
          {weekDates.map((dateStr, i) => (
            <button
              key={dateStr}
              className={`wp-day-dot ${i >= viewOffset && i < viewOffset + DAYS_PER_VIEW ? 'active' : ''} ${dateStr === todayStr ? 'today' : ''}`}
              onClick={() => setViewOffset(Math.min(i, weekDates.length - DAYS_PER_VIEW))}
              title={`${dayShort[parseDate(dateStr).getDay()]} ${fmtDE(dateStr)}`}
            >
              {dayShort[parseDate(dateStr).getDay()]}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" disabled={!canGoForward} onClick={() => setViewOffset(v => Math.min(weekDates.length - DAYS_PER_VIEW, v + DAYS_PER_VIEW))}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Day Cards */}
      <div className="wp-days-grid">
        {visibleDates.map(dateStr => {
          const day = filteredDays[dateStr];
          if (!day) return null;
          const d = parseDate(dateStr);
          const dayIdx = d.getDay();
          const isToday = dateStr === todayStr;
          const isForecast = day.mode === 'forecast';
          const typeGroups = groupByType(day.tasks);
          const doneCount = day.tasks.filter(t => t.status === 'done').length;

          return (
            <div key={dateStr} className={`wp-day-card ${isToday ? 'is-today' : ''} ${isForecast ? 'is-forecast' : ''}`}>
              {/* Day Header */}
              <div className="wp-day-card-header">
                <div className="wp-day-card-title">
                  <span className="wp-day-long">{dayLong[dayIdx]}</span>
                  <span className="wp-day-date-lg">{fmtDE(dateStr)}</span>
                  {isToday && <span className="wp-today-badge">{t('weeklyPlanner.today')}</span>}
                  {isForecast && !isToday && <span className="wp-forecast-tag">{t('weeklyPlanner.forecast')}</span>}
                </div>
                <div className="wp-day-card-meta">
                  <span className="wp-day-count">{day.tasks.length} {t('ops.tasks')}</span>
                  {day.tasks.length > 0 && (
                    <span className={`wp-day-pct ${doneCount === day.tasks.length ? 'complete' : ''}`}>
                      {doneCount}/{day.tasks.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Category Groups */}
              <div className="wp-day-card-body">
                {day.tasks.length === 0 ? (
                  <div className="wp-no-tasks">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {t('weeklyPlanner.noTasks')}
                  </div>
                ) : (
                  TYPE_KEYS.map(type => {
                    const tasks = typeGroups[type];
                    if (!tasks) return null;
                    const key = `${dateStr}:${type}`;
                    const isCollapsed = collapsed[key];
                    const typeDone = tasks.filter(t => t.status === 'done').length;

                    return (
                      <div key={type} className={`wp-category ${type}`}>
                        <button className="wp-category-header" onClick={() => toggleCollapse(dateStr, type)}>
                          <div className="wp-category-left">
                            <span className={`wp-category-icon ${type}`}>{TYPE_ICONS[type]}</span>
                            <span className="wp-category-label">{typeLabels[type]}</span>
                            <span className="wp-category-count">{tasks.length}</span>
                          </div>
                          <div className="wp-category-right">
                            {typeDone > 0 && (
                              <span className="wp-category-done">{typeDone}/{tasks.length}</span>
                            )}
                            <svg className={`wp-category-chevron ${isCollapsed ? 'collapsed' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                          </div>
                        </button>

                        {!isCollapsed && (
                          <div className="wp-category-tasks">
                            {tasks.map((task, i) => (
                              <div key={i} className={`wp-task ${type} ${isForecast ? 'forecast' : ''} ${task.status === 'done' ? 'is-done' : ''}`}>
                                <div className="wp-task-row">
                                  <div className="wp-task-info">
                                    <div className="wp-task-property">{task.property_address}</div>
                                    <div className="wp-task-name">{task.task_name}</div>
                                    {task.worker_name && (
                                      <div className={`wp-task-worker ${type}`}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
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
                                  {task.status && (
                                    <span className={`wp-task-status ${task.status}`}>
                                      {STATUS_ICONS[task.status]}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="wp-legend">
        <span className="wp-legend-item"><span className="wp-task-status done">{STATUS_ICONS.done}</span> {t('weeklyPlanner.done')}</span>
        <span className="wp-legend-item"><span className="wp-task-status postponed">{STATUS_ICONS.postponed}</span> {t('weeklyPlanner.postponed')}</span>
        <span className="wp-legend-item"><span className="wp-task-status missed">{STATUS_ICONS.missed}</span> {t('weeklyPlanner.missed')}</span>
        <span className="wp-legend-item"><span className="wp-task-status in_progress">{STATUS_ICONS.in_progress}</span> {t('weeklyPlanner.inProgress')}</span>
        <span className="wp-legend-dashed">{t('weeklyPlanner.dashedHint')}</span>
      </div>
    </div>
  );
}
