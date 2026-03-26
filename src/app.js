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

export default app;
