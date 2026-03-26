import { useLang } from '../../context/LanguageContext';

const START_HOUR = 6;
const END_HOUR = 18;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function timeToPercent(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  const hours = d.getHours() + d.getMinutes() / 60;
  const clamped = Math.max(START_HOUR, Math.min(END_HOUR, hours));
  return ((clamped - START_HOUR) / TOTAL_HOURS) * 100;
}

export default function Timeline({ timeline }) {
  const { t } = useLang();

  const hourLabels = [];
  for (let h = START_HOUR; h <= END_HOUR; h += 2) {
    hourLabels.push(h);
  }

  return (
    <div className="cc-timeline">
      <h3 className="cc-panel-title">{t('cc.timeline')}</h3>
      <div className="cc-timeline-container">
        <div className="cc-timeline-hours">
          {hourLabels.map(h => (
            <span key={h} className="cc-timeline-hour" style={{ left: `${((h - START_HOUR) / TOTAL_HOURS) * 100}%` }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        {timeline.map(entry => {
          const startPct = timeToPercent(entry.check_in);
          const endPct = entry.check_out ? timeToPercent(entry.check_out) : timeToPercent(new Date().toISOString());
          const width = startPct !== null && endPct !== null ? Math.max(1, endPct - startPct) : 0;

          return (
            <div key={entry.worker_id} className="cc-timeline-row">
              <div className="cc-timeline-label">{entry.worker_name}</div>
              <div className="cc-timeline-track">
                {startPct !== null && (
                  <div
                    className={`cc-timeline-bar ${entry.check_out ? 'cc-timeline-bar-done' : 'cc-timeline-bar-active'}`}
                    style={{ left: `${startPct}%`, width: `${width}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}

        {timeline.length === 0 && (
          <div className="text-muted text-sm" style={{ padding: 'var(--space-sm)' }}>—</div>
        )}
      </div>
    </div>
  );
}
