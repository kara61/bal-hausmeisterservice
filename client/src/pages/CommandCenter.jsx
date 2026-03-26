import { useState, useEffect, useRef } from 'react';
import { useLang } from '../context/LanguageContext';
import { api } from '../api/client';
import StatsBar from '../components/command-center/StatsBar.jsx';
import WorkerPanel from '../components/command-center/WorkerPanel.jsx';
import PropertyGrid from '../components/command-center/PropertyGrid.jsx';
import AlertsPanel from '../components/command-center/AlertsPanel.jsx';
import Timeline from '../components/command-center/Timeline.jsx';
import '../styles/command-center.css';

const POLL_INTERVAL = 30000;

export default function CommandCenter() {
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);

  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? t('dashboard.goodMorning') : hour < 18 ? t('dashboard.goodDay') : t('dashboard.goodEvening');
  const dateStr = now.toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function fetchData() {
    try {
      const result = await api.get(`/command-center?date=${today}`);
      setData(result);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []);

  function handleAlertAction(action) {
    if (action === 'approve_sick') {
      window.open('/sick-leave', '_self');
    } else if (action === 'reassign_gap') {
      window.open('/daily-plan', '_self');
    } else if (action === 'dismiss_flag') {
      window.open('/time-entries', '_self');
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="cc-header">
          <div className="cc-header-left">
            <h1 className="cc-header-title">{greeting}</h1>
            <span className="cc-header-date">{dateStr}</span>
          </div>
        </div>
        <div className="cc-skeleton-stats">
          {[1,2,3,4].map(i => <div key={i} className="cc-skeleton cc-skeleton-stat" />)}
        </div>
        <div className="cc-skeleton-grid">
          <div className="cc-skeleton cc-skeleton-panel" />
          <div className="cc-skeleton cc-skeleton-panel" />
          <div className="cc-skeleton cc-skeleton-panel" />
        </div>
        <div className="cc-skeleton cc-skeleton-timeline" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in">
        <div className="cc-header">
          <div className="cc-header-left">
            <h1 className="cc-header-title">{t('cc.title')}</h1>
          </div>
        </div>
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  const planBadge = {
    none: 'badge-neutral',
    draft: 'badge-warning',
    approved: 'badge-success',
    in_progress: 'badge-info',
    completed: 'badge-neutral',
  };

  return (
    <div className="animate-fade-in">
      <div className="cc-header">
        <div className="cc-header-left">
          <h1 className="cc-header-title">{greeting}</h1>
          <span className="cc-header-date">{dateStr}</span>
        </div>
        <div className="cc-header-right">
          <div className="cc-live-dot" />
          <span className="cc-live-label">Live</span>
          <span className={`badge ${planBadge[data.planStatus] || 'badge-neutral'}`} style={{ marginLeft: '0.75rem' }}>
            {t('cc.planStatus')}: {t(`plan.status.${data.planStatus}`) || data.planStatus}
          </span>
        </div>
      </div>

      <div className="stagger-children">
        <StatsBar stats={data.stats} />

        <div className="cc-grid">
          <WorkerPanel workers={data.workers} />
          <PropertyGrid workers={data.workers} />
          <AlertsPanel alerts={data.alerts} onAction={handleAlertAction} />
        </div>

        <Timeline timeline={data.timeline} />
      </div>
    </div>
  );
}
