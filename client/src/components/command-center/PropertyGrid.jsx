import { useLang } from '../../context/LanguageContext';

export default function PropertyGrid({ workers }) {
  const { t } = useLang();

  const allAssignments = workers.flatMap(w =>
    w.assignments.map(a => ({ ...a, workerName: w.name }))
  );

  const columns = [
    { key: 'pending', label: t('cc.pending'), statuses: ['assigned'], status: 'pending' },
    { key: 'inProgress', label: t('cc.inProgress'), statuses: ['started'], status: 'inProgress' },
    { key: 'completed', label: t('cc.completed'), statuses: ['completed'], status: 'completed' },
  ];

  return (
    <div className="cc-panel">
      <h3 className="cc-panel-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        {t('cc.propertyGrid')}
      </h3>
      <div className="cc-kanban">
        {columns.map(col => {
          const items = allAssignments.filter(a => col.statuses.includes(a.status));
          return (
            <div key={col.key} className="cc-kanban-col">
              <div className="cc-kanban-header" data-status={col.status}>
                <span>{col.label}</span>
                <span className="cc-kanban-count">{items.length}</span>
              </div>
              <div className="cc-kanban-items">
                {items.map(a => (
                  <div key={a.id} className="cc-property-card">
                    <div className="cc-property-address">{a.address}</div>
                    <div className="cc-property-city">{a.city}</div>
                    <div className="cc-property-worker">
                      <span>{a.workerName}</span>
                      {a.source === 'manual' && <span className="badge badge-accent">manual</span>}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="cc-kanban-empty">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
