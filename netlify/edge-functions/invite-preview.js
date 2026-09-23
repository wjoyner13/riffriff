// Personalises the link-preview card (iMessage, WhatsApp, Slack…) for invite
// links. Those apps read the page's og:title without running any JavaScript,
// so the inviter's name from ?from= has to be written into the HTML here.

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function challengeTitle(from) {
  const name = (from || '').trim().slice(0, 16);
  return name ? `${name} has challenged you to a round of Riff God` : null;
}

export function personalise(html, title) {
  const safe = escapeHtml(title);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${safe}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${safe}$2`);
}

export default async (request, context) => {
  const title = challengeTitle(new URL(request.url).searchParams.get('from'));
  const response = await context.next();
  if (!title || !(response.headers.get('content-type') || '').includes('text/html')) return response;

  const html = personalise(await response.text(), title);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html, { status: response.status, headers });
};

export const config = { path: '/' };
