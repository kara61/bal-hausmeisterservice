const imports = [
  ['health', () => import('./_handlers/health.js')],
  ['auth/login', () => import('./_handlers/auth/login.js')],
  ['workers/index', () => import('./_handlers/workers/index.js')],
  ['workers/[id]', () => import('./_handlers/workers/[id].js')],
  ['properties/index', () => import('./_handlers/properties/index.js')],
  ['properties/[id]', () => import('./_handlers/properties/[id].js')],
  ['time-entries/index', () => import('./_handlers/time-entries/index.js')],
  ['time-entries/flagged', () => import('./_handlers/time-entries/flagged.js')],
  ['time-entries/[id]', () => import('./_handlers/time-entries/[id].js')],
  ['sick-leave/index', () => import('./_handlers/sick-leave/index.js')],
  ['sick-leave/[id]', () => import('./_handlers/sick-leave/[id].js')],
  ['vacation/index', () => import('./_handlers/vacation/index.js')],
  ['reports/index', () => import('./_handlers/reports/index.js')],
  ['reports/generate', () => import('./_handlers/reports/generate.js')],
  ['reports/[id]/index', () => import('./_handlers/reports/[id]/index.js')],
  ['reports/[id]/download', () => import('./_handlers/reports/[id]/download.js')],
  ['teams/index', () => import('./_handlers/teams/index.js')],
  ['teams/[id]/index', () => import('./_handlers/teams/[id]/index.js')],
  ['teams/[id]/members', () => import('./_handlers/teams/[id]/members.js')],
  ['tasks/daily', () => import('./_handlers/tasks/daily.js')],
  ['tasks/generate', () => import('./_handlers/tasks/generate.js')],
  ['tasks/carryover', () => import('./_handlers/tasks/carryover.js')],
  ['tasks/[id]/assign', () => import('./_handlers/tasks/[id]/assign.js')],
  ['tasks/[id]/status', () => import('./_handlers/tasks/[id]/status.js')],
  ['tasks/[id]/postpone', () => import('./_handlers/tasks/[id]/postpone.js')],
  ['tasks/[id]/reassign', () => import('./_handlers/tasks/[id]/reassign.js')],
  ['extra-jobs/index', () => import('./_handlers/extra-jobs/index.js')],
  ['extra-jobs/[id]/index', () => import('./_handlers/extra-jobs/[id]/index.js')],
  ['extra-jobs/[id]/photos', () => import('./_handlers/extra-jobs/[id]/photos.js')],
  ['garbage/upload', () => import('./_handlers/garbage/upload.js')],
  ['garbage/map', () => import('./_handlers/garbage/map.js')],
  ['garbage/summary', () => import('./_handlers/garbage/summary.js')],
  ['garbage/generate', () => import('./_handlers/garbage/generate.js')],
  ['garbage/upcoming', () => import('./_handlers/garbage/upcoming.js')],
  ['garbage/schedule/[propertyId]', () => import('./_handlers/garbage/schedule/[propertyId].js')],
  ['webhook', () => import('./_handlers/webhook.js')],
  ['cron/nightly', () => import('./_handlers/cron/nightly.js')],
  ['cron/morning', () => import('./_handlers/cron/morning.js')],
];

export default async function handler(req, res) {
  const results = [];
  for (const [name, fn] of imports) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
    }
  }
  const failed = results.filter(r => !r.ok);
  res.json({ total: results.length, passed: results.length - failed.length, failed });
}
