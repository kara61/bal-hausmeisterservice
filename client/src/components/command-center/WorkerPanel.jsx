import { useLang } from '../../context/LanguageContext';

const STATUS_CONFIG = {
  not_started: { badge: 'badge-neutral', key: 'cc.statusNotStarted' },
  checked_in: { badge: 'badge-info', key: 'cc.statusCheckedIn' },
  working: { badge: 'badge-warning', key: 'cc.statusWorking' },
  done: { badge: 'badge-success', key: 'cc.statusDone' },
};

export default function WorkerPanel({ workers }) {
  const { t } = useLang();

  if (workers.length === 0) {
    return (
      <div className="cc-panel">
        <h3 className="cc-panel-title">{t('cc.workerStatus')}</h3>
        <div className="empty-state">
          <div className="empty-state-text">{t('cc.noPlan')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="cc-panel">
      <h3 className="cc-panel-title">{t('cc.workerStatus')}</h3>
      <div className="cc-worker-list">
        {workers.map(worker => {
          const cfg = STATUS_CONFIG[worker.status] || STATUS_CONFIG.not_started;
          const currentProperty = worker.assignments.find(a => a.status === 'started');
          return (
            <div key={worker.id} className="cc-worker-card">
              <div className="flex items-center justify-between mb-xs">
                <strong>{worker.name}</strong>
                <span className={`badge ${cfg.badge}`}>{t(cfg.key)}</span>
              </div>
              {currentProperty && (
                <div className="text-sm text-secondary mb-xs">
                  {currentProperty.address}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted text-sm">
                  {t('cc.tasksCompleted')}: {worker.completedCount}/{worker.totalCount}
                </span>
                {worker.checkIn && (
                  <span className="text-muted text-sm">
                    {t('cc.checkedInAt')} {new Date(worker.checkIn).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
