import { useLang } from '../../context/LanguageContext';

const ALERT_CONFIG = {
  flagged_entry: { icon: '!', key: 'cc.alertFlaggedEntry', severity: 'warning' },
  sick_leave:    { icon: '+', key: 'cc.alertSickLeave',    severity: 'critical' },
  plan_gap:      { icon: '?', key: 'cc.alertPlanGap',      severity: 'critical' },
};

export default function AlertsPanel({ alerts, onAction }) {
  const { t } = useLang();

  return (
    <div className="cc-panel">
      <h3 className="cc-panel-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        {t('cc.alerts')}
        {alerts.length > 0 && <span className="badge badge-danger">{alerts.length}</span>}
      </h3>

      {alerts.length === 0 ? (
        <div className="empty-state" style={{ padding: '2rem 1rem' }}>
          <div className="empty-state-icon" style={{ fontSize: '1.5rem' }}>&#10003;</div>
          <div className="empty-state-text">{t('cc.noAlerts')}</div>
        </div>
      ) : (
        <div className="cc-alert-list">
          {alerts.map((alert, i) => {
            const cfg = ALERT_CONFIG[alert.type] || { icon: '?', key: alert.type, severity: 'warning' };
            return (
              <div key={`${alert.type}-${alert.id || alert.propertyId}-${i}`} className="cc-alert-item" data-severity={cfg.severity}>
                <div className="cc-alert-icon" data-type={alert.type}>
                  {cfg.icon}
                </div>
                <div className="cc-alert-body">
                  <div className="cc-alert-type">{t(cfg.key)}</div>
                  <div className="cc-alert-detail">
                    {alert.workerName || alert.address || ''}
                    {alert.reason && <span className="text-muted"> — {alert.reason}</span>}
                  </div>
                </div>
                <div className="cc-alert-actions">
                  {alert.type === 'sick_leave' && (
                    <button className="btn btn-sm btn-primary" onClick={() => onAction('approve_sick', alert)}>
                      {t('cc.approve')}
                    </button>
                  )}
                  {alert.type === 'plan_gap' && (
                    <button className="btn btn-sm btn-primary" onClick={() => onAction('reassign_gap', alert)}>
                      {t('cc.reassign')}
                    </button>
                  )}
                  {alert.type === 'flagged_entry' && (
                    <button className="btn btn-sm btn-ghost" onClick={() => onAction('dismiss_flag', alert)}>
                      {t('cc.dismiss')}
                    </button>
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
