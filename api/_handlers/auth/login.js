import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../../../src/config.js';
import { withErrorHandler } from '../../_utils/handler.js';

export default withErrorHandler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body;

  if (username !== config.adminUsername) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!config.adminPasswordHash) {
    return res.status(500).json({ error: 'Server misconfigured: ADMIN_PASSWORD_HASH is not set' });
  }

  const valid = await bcrypt.compare(password, config.adminPasswordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ username, role: 'admin' }, config.jwtSecret, { expiresIn: '7d' });
  res.json({ token });
});
