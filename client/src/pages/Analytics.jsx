import { useState, useEffect, useCallback } from 'react';
import { useLang } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import '../styles/analytics.css';

function getDateRange(preset) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const dow = now.getDay();

  switch (preset) {
    case 'thisWeek': {
      const mon = new Date(y, m, d - (dow === 0 ? 6 : dow - 1));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { from: fmt(mon), to: fmt(sun) };
    }
    case 'thisMonth':
      return { from: `${y}-${pad(m + 1)}-01`, to: fmt(now) };
    case 'lastMonth': {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { from: fmt(first), to: fmt(last) };
    }
    default:
      return { from: `${y}-${pad(m + 1)}-01`, to: fmt(now) };
  }
}

function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function valClass(val, goodThreshold, badThreshold, higherIsBetter = true) {
  if (higherIsBetter) {
    if (val >= goodThreshold) return 'val-good';
    if (val <= badThreshold) return 'val-bad';
  } else {
    if (val <= goodThreshold) return 'val-good';
    if (val >= badThreshold) return 'val-bad';
  }
  return 'val-warn';
}

export default function Analytics() {
  const { t } = useLang();
  const { token } = useAuth();
  const [tab, setTab] = useState('workers');
  const [range, setRange] = useState(() => getDateRange('thisMonth'));
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preset, setPreset] = useState('thisMonth');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let params;
      if (tab === 'properties') {
        params = `view=${tab}&month=${month}-01`;
      } else {
        params = `view=${tab}&from=${range.from}&to=${range.to}`;
      }
      const res = await api.get(`/analytics?${params}`, token);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tab, range, month, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePreset = (p) => {
    setPreset(p);
    setRange(getDateRange(p));
  };

  const handleExport = async () => {
    const monthParam = tab === 'properties' ? `&month=${month}-01` : '';
    const url = `/api/analytics/export?from=${range.from}&to=${range.to}${monthParam}`;
    window.open(url, '_blank');
  };

  const tabs = ['workers', 'properties', 'operations', 'costs'];

  return (
    <div className="analytics-page animate-fade-in">
      <div className="analytics-header">
        <h1>{t('analytics.title')}</h1>
        <button className="btn btn-primary analytics-export-btn" onClick={handleExport}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {t('analytics.export')}
        </button>
      </div>

      <div className="analytics-tabs">
        {tabs.map(tb => (
          <button
            key={tb}
            className={`analytics-tab${tab === tb ? ' active' : ''}`}
            onClick={() => setTab(tb)}
          >
            {t(`analytics.${tb}`)}
          </button>
        ))}
      </div>

      <div className="analytics-controls">
        {tab === 'properties' ? (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        ) : (
          <>
            <div className="analytics-quick-ranges">
              {['thisWeek', 'thisMonth', 'lastMonth'].map(p => (
                <button
                  key={p}
                  className={preset === p ? 'active' : ''}
                  onClick={() => handlePreset(p)}
                >
                  {t(`analytics.${p}`)}
                </button>
              ))}
            </div>
            <label>{t('analytics.from')}</label>
            <input type="date" value={range.from} onChange={(e) => { setPreset(null); setRange(r => ({ ...r, from: e.target.value })); }} />
            <label>{t('analytics.to')}</label>
            <input type="date" value={range.to} onChange={(e) => { setPreset(null); setRange(r => ({ ...r, to: e.target.value })); }} />
          </>
        )}
      </div>

      {loading && <div className="analytics-empty">{t('analytics.loading')}</div>}
      {!loading && !data && <div className="analytics-empty">{t('analytics.noData')}</div>}
      {!loading && data && tab === 'workers' && <WorkersView data={data} t={t} />}
      {!loading && data && tab === 'properties' && <PropertiesView data={data} t={t} />}
      {!loading && data && tab === 'operations' && <OperationsView data={data} t={t} />}
      {!loading && data && tab === 'costs' && <CostsView data={data} t={t} />}
    </div>
  );
}

function WorkersView({ data, t }) {
  if (!data || data.length === 0) return <div className="analytics-empty">{t('analytics.noData')}</div>;

  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table">
        <thead>
          <tr>
            <th>{t('analytics.workers')}</th>
            <th>{t('analytics.worker.completed')}</th>
            <th>{t('analytics.worker.scheduled')}</th>
            <th>{t('analytics.worker.daysWorked')}</th>
            <th>{t('analytics.worker.avgDuration')}</th>
            <th>{t('analytics.worker.photoCompliance')}</th>
            <th>{t('analytics.worker.overtime')}</th>
            <th>{t('analytics.worker.sickDays')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map(w => (
            <tr key={w.workerId}>
              <td><strong>{w.name}</strong></td>
              <td>{w.totalCompleted}</td>
              <td>{w.totalScheduled}</td>
              <td>{w.daysWorked}</td>
              <td>{w.avgDurationMinutes} {t('analytics.worker.min')}</td>
              <td className={valClass(w.photoCompliance, 90, 70)}>{w.photoCompliance}%</td>
              <td className={valClass(w.totalOvertimeMinutes, 30, 120, false)}>{w.totalOvertimeMinutes} {t('analytics.worker.min')}</td>
              <td className={valClass(w.sickDays, 1, 3, false)}>{w.sickDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PropertiesView({ data, t }) {
  if (!data || data.length === 0) return <div className="analytics-empty">{t('analytics.noData')}</div>;

  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table">
        <thead>
          <tr>
            <th>{t('analytics.properties')}</th>
            <th>{t('analytics.property.avgDuration')}</th>
            <th>{t('analytics.property.completionRate')}</th>
            <th>{t('analytics.property.visits')}</th>
            <th>{t('analytics.property.postponements')}</th>
            <th>{t('analytics.property.topWorker')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map(p => (
            <tr key={p.propertyId}>
              <td><strong>{p.address}</strong>, {p.city}</td>
              <td>{p.avgDurationMinutes} {t('analytics.worker.min')}</td>
              <td className={valClass(p.completionRate, 90, 70)}>{p.completionRate}%</td>
              <td>{p.visitCount}</td>
              <td className={valClass(p.postponementCount, 1, 3, false)}>{p.postponementCount}</td>
              <td>{p.topWorker || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationsView({ data, t }) {
  if (!data) return <div className="analytics-empty">{t('analytics.noData')}</div>;

  const stats = [
    { label: t('analytics.ops.planAdherence'), value: `${data.planAdherence}%`, cls: valClass(data.planAdherence, 90, 70) },
    { label: t('analytics.ops.completed'), value: data.totalCompleted },
    { label: t('analytics.ops.scheduled'), value: data.totalScheduled },
    { label: t('analytics.ops.avgWorkers'), value: data.avgWorkersPerDay },
    { label: t('analytics.ops.overtime'), value: `${data.totalOvertimeMinutes} min` },
    { label: t('analytics.ops.sickLeave'), value: data.sickLeaveCount },
    { label: t('analytics.ops.daysTracked'), value: data.daysTracked },
  ];

  return (
    <div className="analytics-stats">
      {stats.map(s => (
        <div className="analytics-stat" key={s.label}>
          <div className={`analytics-stat-value ${s.cls || ''}`}>{s.value}</div>
          <div className="analytics-stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function CostsView({ data, t }) {
  if (!data || data.length === 0) return <div className="analytics-empty">{t('analytics.noData')}</div>;

  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table">
        <thead>
          <tr>
            <th>{t('analytics.workers')}</th>
            <th>{t('analytics.cost.totalHours')}</th>
            <th>{t('analytics.cost.overtimeHours')}</th>
            <th>{t('analytics.cost.regularCost')}</th>
            <th>{t('analytics.cost.overtimeCost')}</th>
            <th>{t('analytics.cost.totalCost')}</th>
            <th>{t('analytics.cost.costPerProperty')}</th>
            <th>{t('analytics.cost.utilization')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map(c => (
            <tr key={c.workerId}>
              <td><strong>{c.name}</strong></td>
              <td>{c.totalHours.toFixed(1)}h</td>
              <td className={valClass(c.overtimeHours, 2, 10, false)}>{c.overtimeHours.toFixed(1)}h</td>
              <td>{c.regularCost.toFixed(2)}€</td>
              <td>{c.overtimeCost.toFixed(2)}€</td>
              <td><strong>{c.totalCost.toFixed(2)}€</strong></td>
              <td>{c.costPerProperty.toFixed(2)}€</td>
              <td className={valClass(c.utilization, 80, 50)}>{c.utilization}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
