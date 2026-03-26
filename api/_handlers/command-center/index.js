import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import { getCommandCenterData } from '../../../src/services/commandCenter.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const date = req.query.date || new Date().toISOString().split('T')[0];
  const data = await getCommandCenterData(date);
  return res.json(data);
});
