import { useLang } from '../../context/LanguageContext';

const STATUS_CONFIG = {
  not_started: { badge: 'badge-neutral', key: 'cc.statusNotStarted' },
  checked_in: { badge: 'badge-info', key: 'cc.statusCheckedIn' },
  working: { badge: 'badge-warning', key: 'cc.statusWorking' },
  done: { badge: 'badge-success', key: 'cc.statusDone' },
};

export default function WorkerPanel({ workers }) {
  const { t } = useLang();

  return (
    <div className="cc-panel">
      <h3 className="cc-panel-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        {t('cc.workerStatus')}
      </h3>

      {workers.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem 1rem' }}>
          <div className="empty-state-text">{t('cc.noPlan')}</div>
        </div>
      ) : (
        <div className="cc-worker-list">
          {workers.map(worker => {
            const cfg = STATUS_CONFIG[worker.status] || STATUS_CONFIG.not_started;
            const currentProperty = worker.assignments.find(a => a.status === 'started');
            const pct = worker.totalCount > 0 ? Math.round((worker.completedCount / worker.totalCount) * 100) : 0;

            return (
              <div key={worker.id} className="cc-worker-card" data-status={worker.status}>
                <div className="flex items-center justify-between">
                  <span className="cc-worker-name">{worker.name}</span>
                  <span className={`badge ${cfg.badge}`}>{t(cfg.key)}</span>
                </div>
                {currentProperty && (
                  <div className="cc-worker-property">{currentProperty.address}</div>
                )}
                <div className="cc-worker-meta">
                  <div className="cc-worker-progress">
                    <div className="cc-worker-progress-bar">
                      <div className="cc-worker-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="cc-worker-progress-text">{worker.completedCount}/{worker.totalCount}</span>
                  </div>
                  {worker.checkIn && (
                    <span className="cc-worker-time">
                      {new Date(worker.checkIn).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
