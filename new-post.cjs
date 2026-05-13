#!/usr/bin/env node
/**
 * new-post.js — Scaffold a new blog post from _template.html
 *
 * Usage:
 *   node new-post.js "my-slug" "My Blog Title" "Short meta description"
 *
 * What it does:
 *   1. Copies _template.html → public/blog/<slug>.html with placeholders replaced
 *   2. Adds a clean-URL rewrite to vercel.json
 *   3. Adds the URL to public/sitemap.xml
 *   4. Prints a reminder to add the post card to blog/index.html
 */

const fs = require('fs');
const path = require('path');

const [,, slug, title, description] = process.argv;

if (!slug || !title) {
  console.error('\n  Usage: node new-post.js <slug> "<title>" "<description>"\n');
  console.error('  Example:');
  console.error('    node new-post.js nogoon-vs-cold-turkey "NoGoon vs Cold Turkey" "Which porn blocker actually stays on? Side-by-side comparison."\n');
  process.exit(1);
}

const desc = description || title;
const today = new Date().toISOString().split('T')[0]; // 2026-03-02
const humanDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); // March 2, 2026

const root = __dirname;
const templatePath = path.join(root, 'public', 'blog', '_template.html');
const outputPath   = path.join(root, 'public', 'blog', `${slug}.html`);
const vercelPath   = path.join(root, 'vercel.json');
const sitemapPath  = path.join(root, 'public', 'sitemap.xml');

// ── 1. Check template exists ──
if (!fs.existsSync(templatePath)) {
  console.error('❌ Template not found at:', templatePath);
  process.exit(1);
}

// ── 2. Check output doesn't already exist ──
if (fs.existsSync(outputPath)) {
  console.error(`❌ Post already exists: public/blog/${slug}.html`);
  process.exit(1);
}

// ── 3. Generate post from template ──
let html = fs.readFileSync(templatePath, 'utf8');

// Context-aware escaping: HTML attributes need &quot;, JSON-LD needs \"
const htmlAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const jsonStr  = (s) => JSON.stringify(String(s)).slice(1, -1); // escapes " and \ for JSON

// Split out the JSON-LD block so we can apply different escaping inside it
const jsonldRe = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;
const m = html.match(jsonldRe);
if (!m) { console.error('❌ Template missing JSON-LD block'); process.exit(1); }
const [, openTag, jsonldBody, closeTag] = m;

// Replace inside JSON-LD with JSON-escaped values
let jsonld = jsonldBody
  .replace(/TITLE/g, jsonStr(title))
  .replace(/META_DESCRIPTION/g, jsonStr(desc))
  .replace(/OG_DESCRIPTION/g, jsonStr(desc))
  .replace(/SLUG/g, jsonStr(slug))
  .replace(/"datePublished": ".*?"/, `"datePublished": "${today}"`)
  .replace(/"dateModified": ".*?"/, `"dateModified": "${today}"`);

// Replace outside JSON-LD with HTML-attribute-escaped values (but leave body H1/breadcrumb plain — handled below)
const htmlBefore = html.slice(0, m.index);
const htmlAfter  = html.slice(m.index + m[0].length);

const escapeOutside = (chunk) => chunk
  .replace(/META_DESCRIPTION/g, htmlAttr(desc))
  .replace(/OG_DESCRIPTION/g, htmlAttr(desc))
  .replace(/SLUG/g, slug);

// TITLE appears in HTML attrs AND in plain body text (h1, <title>, breadcrumb).
// Use HTML-escaped form; raw " will become &quot; which renders correctly in body too.
const escapeTitle = (chunk) => chunk.replace(/TITLE/g, htmlAttr(title));

html = escapeTitle(escapeOutside(htmlBefore)) + openTag + jsonld + closeTag + escapeTitle(escapeOutside(htmlAfter));

// Replace the dummy breadcrumb label
html = html.replace(/Best Permanent Porn Blocker 2026<\/div>/, `${title}</div>`);

// Replace dummy H1 and meta date
html = html.replace(
  'Best Permanent Porn Blocker for Mac &amp; PC in 2026 (The "No-Uninstall" Guide)',
  title
);
html = html.replace(
  'Best Permanent Porn Blocker for Mac & PC in 2026 (The "No-Uninstall" Guide)',
  title
);
html = html.replace('March 2, 2026 · 6 min read', `${humanDate} · 5 min read`);

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`✅ Created: public/blog/${slug}.html`);

// ── 4. Add rewrite to vercel.json ──
const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
const rewriteSource = `/blog/${slug}`;
const alreadyExists = vercel.rewrites.some(r => r.source === rewriteSource);

if (!alreadyExists) {
  vercel.rewrites.push({
    source: rewriteSource,
    destination: `/blog/${slug}.html`
  });
  fs.writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + '\n', 'utf8');
  console.log(`✅ Added rewrite: /blog/${slug} → /blog/${slug}.html`);
} else {
  console.log(`⚠️  Rewrite already exists for /blog/${slug}`);
}

// ── 5. Add to sitemap ──
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
const sitemapUrl = `https://nogoon.io/blog/${slug}`;

if (!sitemap.includes(sitemapUrl)) {
  const entry = `  <url>\n    <loc>${sitemapUrl}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
  sitemap = sitemap.replace('</urlset>', `${entry}\n</urlset>`);
  fs.writeFileSync(sitemapPath, sitemap, 'utf8');
  console.log(`✅ Added to sitemap.xml`);
} else {
  console.log(`⚠️  Already in sitemap.xml`);
}

// ── 6. Reminder ──
console.log(`\n📝 Don't forget to:`);
console.log(`   1. Edit the article body in public/blog/${slug}.html`);
console.log(`   2. Add a post card to public/blog/index.html`);
console.log(`   3. Deploy: cd ~/unfap && git add -A && git commit -m "post: ${slug}" && npx vercel --prod`);
console.log('');
