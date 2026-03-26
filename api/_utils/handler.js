/**
 * Wrap a serverless handler with error handling.
 * @param {Function} fn - async (req, res) => void
 */
export function withErrorHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
