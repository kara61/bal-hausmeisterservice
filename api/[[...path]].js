// Catch-all API router — consolidates all handlers into a single serverless function
// for Vercel Hobby plan (max 12 functions).

// Static route handlers (no dynamic params)
import healthHandler from './_handlers/health.js';
import webhookHandler from './_handlers/webhook.js';
import authLoginHandler from './_handlers/auth/login.js';
import workersIndexHandler from './_handlers/workers/index.js';
import workersIdHandler from './_handlers/workers/[id].js';
import propertiesIndexHandler from './_handlers/properties/index.js';
import propertiesIdHandler from './_handlers/properties/[id].js';
import timeEntriesIndexHandler from './_handlers/time-entries/index.js';
import timeEntriesFlaggedHandler from './_handlers/time-entries/flagged.js';
import timeEntriesIdHandler from './_handlers/time-entries/[id].js';
import sickLeaveIndexHandler from './_handlers/sick-leave/index.js';
import sickLeaveIdHandler from './_handlers/sick-leave/[id].js';
import vacationIndexHandler from './_handlers/vacation/index.js';
import reportsIndexHandler from './_handlers/reports/index.js';
import reportsGenerateHandler from './_handlers/reports/generate.js';
import reportsIdHandler from './_handlers/reports/[id]/index.js';
import reportsIdDownloadHandler from './_handlers/reports/[id]/download.js';
import teamsIndexHandler from './_handlers/teams/index.js';
import teamsIdHandler from './_handlers/teams/[id]/index.js';
import teamsIdMembersHandler from './_handlers/teams/[id]/members.js';
import tasksDaily from './_handlers/tasks/daily.js';
import tasksGenerate from './_handlers/tasks/generate.js';
import tasksCarryover from './_handlers/tasks/carryover.js';
import tasksIdAssign from './_handlers/tasks/[id]/assign.js';
import tasksIdStatus from './_handlers/tasks/[id]/status.js';
import tasksIdPostpone from './_handlers/tasks/[id]/postpone.js';
import tasksIdReassign from './_handlers/tasks/[id]/reassign.js';
import extraJobsIndexHandler from './_handlers/extra-jobs/index.js';
import extraJobsIdHandler from './_handlers/extra-jobs/[id]/index.js';
import extraJobsIdPhotosHandler from './_handlers/extra-jobs/[id]/photos.js';
import garbageUploadHandler from './_handlers/garbage/upload.js';
import garbageMapHandler from './_handlers/garbage/map.js';
import garbageSummaryHandler from './_handlers/garbage/summary.js';
import garbageGenerateHandler from './_handlers/garbage/generate.js';
import garbageUpcomingHandler from './_handlers/garbage/upcoming.js';
import garbageSchedulePropertyHandler from './_handlers/garbage/schedule/[propertyId].js';
import cronNightlyHandler from './_handlers/cron/nightly.js';
import cronMorningHandler from './_handlers/cron/morning.js';

// Route definitions: [pattern, handler, paramNames]
// Order matters — more specific routes first
const routes = [
  // Health & webhook
  ['health', healthHandler],
  ['webhook', webhookHandler],

  // Auth
  ['auth/login', authLoginHandler],

  // Workers
  ['workers', workersIndexHandler],

  // Properties
  ['properties', propertiesIndexHandler],

  // Time entries
  ['time-entries/flagged', timeEntriesFlaggedHandler],
  ['time-entries', timeEntriesIndexHandler],

  // Sick leave
  ['sick-leave', sickLeaveIndexHandler],

  // Vacation
  ['vacation', vacationIndexHandler],

  // Reports
  ['reports/generate', reportsGenerateHandler],
  ['reports', reportsIndexHandler],

  // Teams
  ['teams', teamsIndexHandler],

  // Tasks
  ['tasks/daily', tasksDaily],
  ['tasks/generate', tasksGenerate],
  ['tasks/carryover', tasksCarryover],

  // Extra jobs
  ['extra-jobs', extraJobsIndexHandler],

  // Garbage
  ['garbage/upload', garbageUploadHandler],
  ['garbage/map', garbageMapHandler],
  ['garbage/summary', garbageSummaryHandler],
  ['garbage/generate', garbageGenerateHandler],
  ['garbage/upcoming', garbageUpcomingHandler],

  // Cron
  ['cron/nightly', cronNightlyHandler],
  ['cron/morning', cronMorningHandler],
];

// Dynamic routes: [pattern, handler, paramMap]
// paramMap: { segmentIndex: paramName }
const dynamicRoutes = [
  // /workers/:id
  [/^workers\/([^/]+)$/, workersIdHandler, { id: 1 }],
  // /properties/:id
  [/^properties\/([^/]+)$/, propertiesIdHandler, { id: 1 }],
  // /time-entries/:id
  [/^time-entries\/([^/]+)$/, timeEntriesIdHandler, { id: 1 }],
  // /sick-leave/:id
  [/^sick-leave\/([^/]+)$/, sickLeaveIdHandler, { id: 1 }],
  // /reports/:id/download
  [/^reports\/([^/]+)\/download$/, reportsIdDownloadHandler, { id: 1 }],
  // /reports/:id
  [/^reports\/([^/]+)$/, reportsIdHandler, { id: 1 }],
  // /teams/:id/members
  [/^teams\/([^/]+)\/members$/, teamsIdMembersHandler, { id: 1 }],
  // /teams/:id
  [/^teams\/([^/]+)$/, teamsIdHandler, { id: 1 }],
  // /tasks/:id/assign
  [/^tasks\/([^/]+)\/assign$/, tasksIdAssign, { id: 1 }],
  // /tasks/:id/status
  [/^tasks\/([^/]+)\/status$/, tasksIdStatus, { id: 1 }],
  // /tasks/:id/postpone
  [/^tasks\/([^/]+)\/postpone$/, tasksIdPostpone, { id: 1 }],
  // /tasks/:id/reassign
  [/^tasks\/([^/]+)\/reassign$/, tasksIdReassign, { id: 1 }],
  // /extra-jobs/:id/photos
  [/^extra-jobs\/([^/]+)\/photos$/, extraJobsIdPhotosHandler, { id: 1 }],
  // /extra-jobs/:id
  [/^extra-jobs\/([^/]+)$/, extraJobsIdHandler, { id: 1 }],
  // /garbage/schedule/:propertyId
  [/^garbage\/schedule\/([^/]+)$/, garbageSchedulePropertyHandler, { propertyId: 1 }],
];

// Disable body parser so formidable (file uploads) works.
// We parse JSON manually for non-upload routes.
export const config = {
  api: { bodyParser: false },
};

function parseJsonBody(req) {
  return new Promise((resolve) => {
    // Skip if not JSON content type
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('application/json') && !ct.includes('application/x-www-form-urlencoded')) {
      return resolve();
    }
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        req.body = data ? JSON.parse(data) : {};
      } catch {
        // For URL-encoded (Twilio webhook), parse as form data
        req.body = Object.fromEntries(new URLSearchParams(data));
      }
      resolve();
    });
  });
}

// Routes that should NOT have body parsed (file uploads)
const skipBodyParse = new Set(['garbage/upload']);

export default async function handler(req, res) {
  // Extract the path after /api/
  // Try req.query.path first, then parse from URL
  let pathSegments = req.query.path || [];
  if (pathSegments.length === 0 && req.url) {
    const urlPath = req.url.replace(/\?.*$/, '').replace(/^\/api\//, '');
    if (urlPath) pathSegments = urlPath.split('/');
  }
  const routePath = pathSegments.join('/');

  // Parse JSON body for non-upload routes
  if (!skipBodyParse.has(routePath) && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
    await parseJsonBody(req);
  }

  // Try static routes first (exact match)
  for (const [pattern, routeHandler] of routes) {
    if (routePath === pattern) {
      return routeHandler(req, res);
    }
  }

  // Try dynamic routes
  for (const [regex, routeHandler, paramMap] of dynamicRoutes) {
    const match = routePath.match(regex);
    if (match) {
      // Inject dynamic params into req.query
      for (const [paramName, groupIndex] of Object.entries(paramMap)) {
        req.query[paramName] = match[groupIndex];
      }
      return routeHandler(req, res);
    }
  }

  return res.status(404).json({ error: 'Not found', path: `/api/${routePath}` });
}
