import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { getWorkerAnalytics, getPropertyAnalytics, getOperationsAnalytics, getCostAnalytics } from '../../../src/services/analytics.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const view = req.query.view;
  const from = req.query.from;
  const to = req.query.to;
  const month = req.query.month;

  if (!view) {
    return res.status(400).json({ error: 'Missing "view" parameter' });
  }

  switch (view) {
    case 'workers': {
      if (!from || !to) return res.status(400).json({ error: 'Missing "from" and "to" parameters' });
      const data = await getWorkerAnalytics(from, to);
      return res.json({ view, from, to, data });
    }
    case 'properties': {
      if (!month) return res.status(400).json({ error: 'Missing "month" parameter' });
      const data = await getPropertyAnalytics(month);
      return res.json({ view, month, data });
    }
    case 'operations': {
      if (!from || !to) return res.status(400).json({ error: 'Missing "from" and "to" parameters' });
      const data = await getOperationsAnalytics(from, to);
      return res.json({ view, from, to, data });
    }
    case 'costs': {
      if (!from || !to) return res.status(400).json({ error: 'Missing "from" and "to" parameters' });
      const data = await getCostAnalytics(from, to);
      return res.json({ view, from, to, data });
    }
    default:
      return res.status(400).json({ error: `Unknown view: ${view}` });
  }
});
