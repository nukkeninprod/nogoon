import { next } from '@vercel/edge';

export const config = { matcher: ['/'] };

export default function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  const isMac = /Macintosh/.test(ua) && !/iPhone|iPad/.test(ua);

  // Non-Mac users always get Version A
  if (!isMac) return;

  // Sticky variant cookie — user stays on the same variant across visits
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)ab=([AB])/);
  const variant = match ? match[1] : (Math.random() < 0.5 ? 'A' : 'B');
  const setCookie = match ? null : `ab=${variant}; Path=/; Max-Age=2592000; SameSite=Lax`;

  if (variant === 'B') {
    const url = new URL(request.url);
    url.pathname = '/index-b.html';
    const headers = new Headers({ Location: url.toString() });
    if (setCookie) headers.set('Set-Cookie', setCookie);
    return new Response(null, { status: 302, headers });
  }

  // Variant A — pass through, optionally set the cookie
  const response = next();
  if (setCookie) response.headers.set('Set-Cookie', setCookie);
  return response;
}
