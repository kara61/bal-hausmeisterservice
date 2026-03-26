import { useLang } from '../../context/LanguageContext';

export default function StatsBar({ stats }) {
  const { t } = useLang();

  const cards = [
    {
      label: t('cc.workersActive'),
      value: `${stats.workersActive}/${stats.workersTotal}`,
      color: stats.workersActive === stats.workersTotal ? 'var(--success)' : 'var(--warning)',
    },
    {
      label: t('cc.properties'),
      value: `${stats.propertiesCompleted}/${stats.propertiesTotal}`,
      sub: `${stats.propertiesInProgress} ${t('cc.inProgress')}`,
      color: stats.propertiesRemaining === 0 ? 'var(--success)' : 'var(--accent)',
    },
    {
      label: t('cc.alerts'),
      value: stats.alertCount,
      color: stats.alertCount > 0 ? 'var(--danger)' : 'var(--success)',
    },
    {
      label: t('cc.garbageToday'),
      value: stats.garbageCount,
      color: 'var(--info)',
    },
  ];

  return (
    <div className="cc-stats-bar">
      {cards.map((card, i) => (
        <div key={i} className="cc-stat-card">
          <div className="cc-stat-value" style={{ color: card.color }}>{card.value}</div>
          <div className="cc-stat-label">{card.label}</div>
          {card.sub && <div className="cc-stat-sub text-muted text-sm">{card.sub}</div>}
        </div>
      ))}
    </div>
  );
}
