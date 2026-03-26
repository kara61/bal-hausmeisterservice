import { useLang } from '../../context/LanguageContext';

export default function PropertyGrid({ workers }) {
  const { t } = useLang();

  const allAssignments = workers.flatMap(w =>
    w.assignments.map(a => ({ ...a, workerName: w.name }))
  );

  const columns = [
    { key: 'pending', label: t('cc.pending'), statuses: ['assigned'], color: 'var(--text-muted)' },
    { key: 'inProgress', label: t('cc.inProgress'), statuses: ['started'], color: 'var(--warning)' },
    { key: 'completed', label: t('cc.completed'), statuses: ['completed'], color: 'var(--success)' },
  ];

  return (
    <div className="cc-panel cc-panel-wide">
      <h3 className="cc-panel-title">{t('cc.propertyGrid')}</h3>
      <div className="cc-kanban">
        {columns.map(col => {
          const items = allAssignments.filter(a => col.statuses.includes(a.status));
          return (
            <div key={col.key} className="cc-kanban-col">
              <div className="cc-kanban-header" style={{ borderBottomColor: col.color }}>
                <span>{col.label}</span>
                <span className="badge badge-neutral">{items.length}</span>
              </div>
              <div className="cc-kanban-items">
                {items.map(a => (
                  <div key={a.id} className="cc-property-card">
                    <div className="cc-property-address">{a.address}</div>
                    <div className="text-muted text-sm">{a.city}</div>
                    <div className="flex items-center justify-between mt-xs">
                      <span className="text-sm text-secondary">{a.workerName}</span>
                      {a.source === 'manual' && <span className="badge badge-accent text-sm">manual</span>}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-muted text-sm" style={{ padding: 'var(--space-sm)' }}>—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
