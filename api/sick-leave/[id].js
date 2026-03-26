import { checkAuth } from '../_utils/auth.js';
import { withErrorHandler } from '../_utils/handler.js';
import { adjustSickLeave } from '../../src/services/sickLeave.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const result = await adjustSickLeave(parseInt(req.query.id), req.body);
  res.json(result);
});
