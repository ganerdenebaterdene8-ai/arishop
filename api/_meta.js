// Facebook Graph API туслах функцууд (Messenger + сэтгэгдэл)
import crypto from 'crypto';

const G = 'https://graph.facebook.com/v21.0/';

async function post(path, body) {
  const r = await fetch(G + path + '?access_token=' + process.env.FB_PAGE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) throw new Error('Graph ' + path + ': ' + j.error.message);
  return j;
}

// Webhook-ийн гарын үсэг шалгах (хуурамч хүсэлтээс хамгаална)
export function verifySignature(raw, header) {
  const secret = process.env.FB_APP_SECRET;
  if (!secret || !header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PAGE = () => process.env.FB_PAGE_ID;

// 24 цагийн цонх дотор Messenger мессеж
export const sendText = (psid, text) =>
  post(PAGE() + '/messages', { recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text } });

// Сэтгэгдэлд нийтэд харагдах хариу
export const replyComment = (commentId, message) => post(commentId + '/comments', { message });

// Сэтгэгдэл бичсэн хүнд нэг удаагийн хувийн мессеж (Private Reply)
export const privateReply = (commentId, text) =>
  post(PAGE() + '/messages', { recipient: { comment_id: commentId }, message: { text } });

export const isPageId = (id) => !!id && id === PAGE();
