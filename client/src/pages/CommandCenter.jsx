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

const PLAN_STATUS_BADGE = {
  none: 'badge-neutral',
  draft: 'badge-warning',
  approved: 'badge-success',
  in_progress: 'badge-info',
  completed: 'badge-neutral',
};

export default function CommandCenter() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);

  const today = new Date().toISOString().split('T')[0];

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

  function handleAlertAction(action, alert) {
    if (action === 'approve_sick') {
      window.open(`/sick-leave`, '_self');
    } else if (action === 'reassign_gap') {
      window.open(`/daily-plan`, '_self');
    } else if (action === 'dismiss_flag') {
      window.open(`/time-entries`, '_self');
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header"><h1>{t('cc.title')}</h1></div>
        <div className="text-muted">...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in">
        <div className="page-header"><h1>{t('cc.title')}</h1></div>
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>{t('cc.title')}</h1>
        <div className="cc-plan-status">
          <span className={`badge ${PLAN_STATUS_BADGE[data.planStatus] || 'badge-neutral'}`}>
            {t('cc.planStatus')}: {data.planStatus}
          </span>
        </div>
      </div>

      <StatsBar stats={data.stats} />

      <div className="cc-grid">
        <WorkerPanel workers={data.workers} />
        <PropertyGrid workers={data.workers} />
        <AlertsPanel alerts={data.alerts} onAction={handleAlertAction} />
      </div>

      <Timeline timeline={data.timeline} />
    </div>
  );
}
