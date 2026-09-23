// Personalises the link-preview card (iMessage, WhatsApp, Slack…) for invite
// links. Those apps read the page's og:title without running any JavaScript,
// so the inviter's name from ?from= has to be written into the HTML here.
// Wording comes from src/copy.js, the same file the game uses.

import { t } from '../../src/copy.js';

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function challengeTitle(from) {
  const name = (from || '').trim().slice(0, 16);
  return name ? t('preview.title', { name }) : t('preview.titleNoName');
}

export function personalise(html, title, description) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${safeTitle}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${safeTitle}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${safeDescription}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${safeDescription}$2`);
}

export default async (request, context) => {
  const params = new URL(request.url).searchParams;
  const response = await context.next();
  // Only invite links get the challenge card; the plain home page keeps its title.
  if (!params.has('room') || !(response.headers.get('content-type') || '').includes('text/html')) return response;

  const html = personalise(await response.text(), challengeTitle(params.get('from')), t('preview.description'));
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, { status: response.status, headers });
};

export const config = { path: '/' };
