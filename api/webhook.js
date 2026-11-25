// Facebook Messenger + Page сэтгэгдлийн webhook.
// Meta app → Webhooks → Callback URL: https://<сайт>/api/webhook
// Орчны хувьсагч: FB_PAGE_ID, FB_PAGE_TOKEN (аль хэдийн байгаа), FB_APP_ID, FB_APP_SECRET, FB_VERIFY_TOKEN,
//                 KV_REST_API_URL, KV_REST_API_TOKEN (Upstash Redis)
import { verifySignature, sendText, replyComment, privateReply, isPageId } from './_meta.js';
import { handleMessage, commentReplies } from './_bot.js';
import { touchUser, isPaused, pauseBot, dbReady } from './_db.js';

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // Meta webhook баталгаажуулалт
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q['hub.mode'] === 'subscribe' && process.env.FB_VERIFY_TOKEN && q['hub.verify_token'] === process.env.FB_VERIFY_TOKEN) {
      return res.status(200).send(q['hub.challenge']);
    }
    return res.status(403).send('Forbidden');
  }
  if (req.method !== 'POST') return res.status(405).end();

  const raw = await readRaw(req);
  if (!verifySignature(raw, req.headers['x-hub-signature-256'])) return res.status(401).send('Bad signature');
  if (!dbReady()) return res.status(200).json({ ok: false, error: 'KV_REST_API_URL / KV_REST_API_TOKEN тохируулаагүй' });

  let body;
  try { body = JSON.parse(raw); } catch (e) { return res.status(400).end(); }
  if (body.object !== 'page') return res.status(200).json({ ok: true });

  for (const entry of body.entry || []) {
    // --- Messenger мессеж ---
    for (const ev of entry.messaging || []) {
      try {
        if (ev.message && ev.message.is_echo) {
          // Ботын мессеж манай app_id-тэй ирнэ; бусад нь та гараар бичсэн хариу → ботыг түр зогсооно
          const fromOurApp = String(ev.message.app_id || '') === String(process.env.FB_APP_ID || 'x');
          if (ev.recipient && ev.recipient.id && !fromOurApp) await pauseBot(ev.recipient.id);
          continue;
        }
        const psid = ev.sender && ev.sender.id;
        const text = (ev.message && ev.message.text) || (ev.postback && ev.postback.title);
        if (!psid || !text) continue;
        await touchUser(psid);
        if (await isPaused(psid)) continue;
        const reply = await handleMessage(psid, text);
        if (reply) await sendText(psid, reply);
      } catch (e) {
        console.error('messaging error', e);
      }
    }

    // --- Пост дээрх шинэ сэтгэгдэл ---
    for (const ch of entry.changes || []) {
      try {
        const v = ch.value || {};
        if (ch.field !== 'feed' || v.item !== 'comment' || v.verb !== 'add') continue;
        if (isPageId(v.from && v.from.id)) continue; // өөрийн сэтгэгдэлд хариулахгүй
        if (v.parent_id && v.parent_id !== v.post_id) continue; // зөвхөн үндсэн сэтгэгдэл
        const r = commentReplies(v.message);
        if (!r) continue;
        await replyComment(v.comment_id, r.publicReply);
        await privateReply(v.comment_id, r.dm);
      } catch (e) {
        console.error('comment error', e);
      }
    }
  }
  res.status(200).json({ ok: true });
}
