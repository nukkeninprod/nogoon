import { rewrite } from '@vercel/edge';

export const config = { matcher: ['/', '/block-porn-permanently', '/block-porn-permanently.html'] };

// A/B testing is paused: all traffic uses the existing software landing pages.
// Keep the original pages available so the experiment can be resumed later.
const SOFTWARE_PAGES = {
  '/': '/index-b.html',
  '/block-porn-permanently': '/block-porn-permanently-b.html',
  '/block-porn-permanently.html': '/block-porn-permanently-b.html',
};

export default function middleware(request) {
  const url = new URL(request.url);
  const page = SOFTWARE_PAGES[url.pathname];
  if (!page) return;
  url.pathname = page;
  return rewrite(url);
}
