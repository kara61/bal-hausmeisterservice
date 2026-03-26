import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (username !== config.adminUsername) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, config.adminPasswordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ username, role: 'admin' }, config.jwtSecret, { expiresIn: '7d' });
  res.json({ token });
});

export default router;
