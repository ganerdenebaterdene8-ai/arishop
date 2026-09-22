// Shared auth for privileged Vercel Functions.
// Scheduled requests must present CRON_SECRET; manual requests must present SYNC_KEY.
// Fail closed if the required secret is missing.
export function requireJobAuth(req) {
  const auth = String(req.headers?.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) {
    return { ok: true, type: 'cron' };
  }

  if (process.env.SYNC_KEY && token === process.env.SYNC_KEY) {
    return { ok: true, type: 'manual' };
  }

  return { ok: false, type: null };
}
