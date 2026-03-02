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

// Replace all placeholder tokens
html = html.replace(/TITLE/g, title);
html = html.replace(/META_DESCRIPTION/g, desc);
html = html.replace(/OG_DESCRIPTION/g, desc);
html = html.replace(/SLUG/g, slug);
html = html.replace(/"datePublished": ".*?"/, `"datePublished": "${today}"`);
html = html.replace(/"dateModified": ".*?"/, `"dateModified": "${today}"`);

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
