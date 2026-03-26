import app from './app.js';
import { config } from './config.js';
import { startScheduler } from './services/scheduler.js';

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  startScheduler();
});
