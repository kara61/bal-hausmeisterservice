import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import workersRouter from './routes/workers.js';
import webhookRouter from './routes/webhook.js';
import authRouter from './routes/auth.js';
import timeEntriesRouter from './routes/timeEntries.js';
import sickLeaveRouter from './routes/sickLeave.js';
import vacationRouter from './routes/vacation.js';
import reportsRouter from './routes/reports.js';
import propertiesRouter from './routes/properties.js';
import teamsRouter from './routes/teams.js';
import tasksRouter from './routes/tasks.js';
import extraJobsRouter from './routes/extraJobs.js';
import garbageRouter from './routes/garbage.js';
import { requireAuth } from './middleware/auth.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/webhook', webhookRouter);

// Protected routes
app.use('/api/workers', requireAuth, workersRouter);
app.use('/api/time-entries', requireAuth, timeEntriesRouter);
app.use('/api/sick-leave', requireAuth, sickLeaveRouter);
app.use('/api/vacation', requireAuth, vacationRouter);
app.use('/api/reports', requireAuth, reportsRouter);
app.use('/api/properties', requireAuth, propertiesRouter);
app.use('/api/teams', requireAuth, teamsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/extra-jobs', requireAuth, extraJobsRouter);
app.use('/api/garbage', requireAuth, garbageRouter);

// Serve built client in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, '../client/dist');

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(clientDist, 'index.html'));
    }
  });
}

const uploadsDir = join(__dirname, '../uploads');
if (existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir));
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
