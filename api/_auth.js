import crypto from 'crypto';

function safeEqual(a, b) {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function requireJobAuth(req, res) {
  const authorization = String((req.headers && req.headers.authorization) || '');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && safeEqual(bearer, cronSecret)) return true;

  const syncKey = process.env.SYNC_KEY;
  const queryKey = String((req.query && req.query.key) || '');
  if (syncKey && safeEqual(queryKey, syncKey)) return true;

  res.status(401).json({ error: 'unauthorized' });
  return false;
}
