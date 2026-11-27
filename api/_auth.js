// Cron болон гар ажиллуулалтын эрх шалгах.
// Vercel Cron нь CRON_SECRET тохируулсан үед `Authorization: Bearer <CRON_SECRET>` толгой илгээдэг.
// Хуучин `x-vercel-cron` толгойг хэн ч хуурамчаар илгээж болох тул CRON_SECRET байвал түүнийг шаардана.
// Гараар: ?key=<SYNC_KEY>
export function allowed(req) {
  const h = (req && req.headers) || {};
  const q = (req && req.query) || {};
  const secret = process.env.CRON_SECRET;
  if (secret && h.authorization === 'Bearer ' + secret) return true;
  if (!secret && h['x-vercel-cron']) return true;
  if (process.env.SYNC_KEY && q.key === process.env.SYNC_KEY) return true;
  if (!secret && !process.env.SYNC_KEY) return true; // юу ч тохируулаагүй бол нээлттэй (хуучин зан төлөв)
  return false;
}
