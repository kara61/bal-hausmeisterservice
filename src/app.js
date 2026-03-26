import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import workersRouter from './routes/workers.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/workers', workersRouter);

export default app;
