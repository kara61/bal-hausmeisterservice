import { useLang } from '../../context/LanguageContext';

const ALERT_CONFIG = {
  flagged_entry: { icon: '⚠️', key: 'cc.alertFlaggedEntry', badgeClass: 'badge-warning' },
  sick_leave: { icon: '🤒', key: 'cc.alertSickLeave', badgeClass: 'badge-danger' },
  plan_gap: { icon: '🔴', key: 'cc.alertPlanGap', badgeClass: 'badge-danger' },
};

export default function AlertsPanel({ alerts, onAction }) {
  const { t } = useLang();

  return (
    <div className="cc-panel">
      <h3 className="cc-panel-title">
        {t('cc.alerts')}
        {alerts.length > 0 && <span className="badge badge-danger ml-sm">{alerts.length}</span>}
      </h3>
      {alerts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-text">{t('cc.noAlerts')}</div>
        </div>
      ) : (
        <div className="cc-alert-list">
          {alerts.map((alert, i) => {
            const cfg = ALERT_CONFIG[alert.type] || { icon: '❓', key: alert.type, badgeClass: 'badge-neutral' };
            return (
              <div key={`${alert.type}-${alert.id || alert.propertyId}-${i}`} className="cc-alert-item">
                <div className="flex items-center gap-sm">
                  <span>{cfg.icon}</span>
                  <div>
                    <span className={`badge ${cfg.badgeClass} text-sm`}>{t(cfg.key)}</span>
                    <div className="text-sm mt-xs">
                      {alert.workerName || alert.address || ''}
                      {alert.reason && <span className="text-muted"> — {alert.reason}</span>}
                    </div>
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
