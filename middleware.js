import { next, rewrite } from '@vercel/edge';

export const config = { matcher: ['/', '/block-porn-permanently', '/block-porn-permanently.html'] };

// Each entry point is its own A/B test with its own sticky cookie and B page.
const TESTS = {
  '/':                            { cookie: 'ab_home', bPath: '/index-b.html' },
  '/block-porn-permanently':      { cookie: 'ab_bpp',  bPath: '/block-porn-permanently-b.html' },
  '/block-porn-permanently.html': { cookie: 'ab_bpp',  bPath: '/block-porn-permanently-b.html' },
};

export default function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  const isMac = /Macintosh/.test(ua) && !/iPhone|iPad/.test(ua);

  // Non-Mac users always get Version A
  if (!isMac) return;

  const url = new URL(request.url);
  const test = TESTS[url.pathname];
  if (!test) return;

  // Sticky variant cookie — user stays on the same variant across visits
  const cookie = request.headers.get('cookie') || '';
  const re = new RegExp(`(?:^|;\\s*)${test.cookie}=([AB])`);
  const match = cookie.match(re);
  const variant = match ? match[1] : (Math.random() < 0.5 ? 'A' : 'B');
  const setCookie = match ? null : `${test.cookie}=${variant}; Path=/; Max-Age=2592000; SameSite=Lax`;

  // B = transparent rewrite (URL stays the same in the browser)
  // A = pass through
  const url_b = new URL(request.url);
  url_b.pathname = test.bPath;
  const response = variant === 'B' ? rewrite(url_b) : next();
  if (setCookie) response.headers.set('Set-Cookie', setCookie);
  return response;
}
