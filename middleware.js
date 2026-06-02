export const config = { matcher: ['/'] };

export default function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  const isMac = /Macintosh/.test(ua) && !/iPhone|iPad/.test(ua);

  // Non-Mac users always get Version A
  if (!isMac) return;

  // Mac users: 50/50 split between A and B
  const showB = Math.random() < 0.5;
  if (showB) {
    const url = new URL(request.url);
    url.pathname = '/index-b.html';
    return Response.redirect(url, 302);
  }
}
