import { checkAuth } from '../../_utils/auth.js';
import { withErrorHandler } from '../../_utils/handler.js';
import {
  getScheduleForProperty,
  deleteScheduleForProperty,
} from '../../../src/services/garbageScheduling.js';

export default withErrorHandler(async (req, res) => {
  if (checkAuth(req, res)) return;

  const propertyId = parseInt(req.query.propertyId, 10);

  if (req.method === 'GET') {
    const schedule = await getScheduleForProperty(propertyId);
    return res.json(schedule);
  }

  if (req.method === 'DELETE') {
    await deleteScheduleForProperty(propertyId);
    return res.json({ deleted: true, property_id: propertyId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
