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

function getNowPercent() {
  const now = new Date();
  const hours = now.getHours() + now.getMinutes() / 60;
  if (hours < START_HOUR || hours > END_HOUR) return null;
  return ((hours - START_HOUR) / TOTAL_HOURS) * 100;
}

export default function Timeline({ timeline }) {
  const { t } = useLang();

  const hourLabels = [];
  for (let h = START_HOUR; h <= END_HOUR; h += 2) {
    hourLabels.push(h);
  }

  const nowPct = getNowPercent();

  return (
    <div className="cc-timeline">
      <h3 className="cc-panel-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        {t('cc.timeline')}
      </h3>
      <div className="cc-timeline-container">
        <div className="cc-timeline-hours">
          {hourLabels.map(h => (
            <span key={h} className="cc-timeline-hour" style={{ left: `${((h - START_HOUR) / TOTAL_HOURS) * 100}%` }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
          {nowPct !== null && (
            <div className="cc-timeline-now" style={{ left: `${nowPct}%` }} />
          )}
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
                    title={`${entry.worker_name}: ${new Date(entry.check_in).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${entry.check_out ? ' – ' + new Date(entry.check_out).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ' →'}`}
                  />
                )}
                {nowPct !== null && (
                  <div className="cc-timeline-now" style={{ left: `${nowPct}%` }} />
                )}
              </div>
            </div>
          );
        })}

        {timeline.length === 0 && (
          <div className="cc-timeline-empty">{t('cc.noPlan')}</div>
        )}
      </div>
    </div>
  );
}
