import { useLang } from '../../context/LanguageContext';

export default function StatsBar({ stats }) {
  const { t } = useLang();

  const cards = [
    {
      label: t('cc.workersActive'),
      value: `${stats.workersActive}/${stats.workersTotal}`,
      color: stats.workersActive === stats.workersTotal ? 'success' : 'warning',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
    {
      label: t('cc.properties'),
      value: `${stats.propertiesCompleted}/${stats.propertiesTotal}`,
      sub: `${stats.propertiesInProgress} ${t('cc.inProgress')}`,
      color: stats.propertiesRemaining === 0 ? 'success' : 'accent',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
    {
      label: t('cc.alerts'),
      value: stats.alertCount,
      color: stats.alertCount > 0 ? 'danger' : 'success',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
    },
    {
      label: t('cc.garbageToday'),
      value: stats.garbageCount,
      color: 'info',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="cc-stats-bar">
      {cards.map((card, i) => (
        <div key={i} className="cc-stat-card" data-color={card.color}>
          <div className="cc-stat-icon" data-color={card.color}>
            {card.icon}
          </div>
          <div className="cc-stat-value">{card.value}</div>
          <div className="cc-stat-label">{card.label}</div>
          {card.sub && <div className="cc-stat-sub">{card.sub}</div>}
        </div>
      ))}
    </div>
  );
}
