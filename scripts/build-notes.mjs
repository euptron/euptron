#!/usr/bin/env node
// Zero-dependency compiler for my portfolio notes pipeline
//
// Walks notes/*.md, parses YAML frontmatter, extracts authoritative dates
// from Git history (first commit = created, last commit = updated), and emits:
//
//   dist/notes.json            - feed consumed by euptron.pages.dev (listing page)
//   dist/posts/<slug>/index.html - fully prerendered, crawlable post pages
//   dist/feed.xml              - Atom feed for syndication/discovery
//   dist/sitemap.xml           - complete sitemap incl. posts (if SITE_URL set)
//
// Usage: node scripts/build-notes.mjs
// Env:   NOTES_DIR (default "notes"), OUT_PATH/dist (default "dist"),
//        SITE_URL (default "https://euptron.pages.dev")

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const NOTES_DIR = process.env.NOTES_DIR || 'notes';
const DIST = process.env.OUT_DIR || process.env.OUT_PATH?.replace(/\/notes\.json$/, '') || 'dist';
const SITE_URL = (process.env.SITE_URL || 'https://euptron.pages.dev').replace(/\/$/, '');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };

  const meta = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    let value = kv[2].trim();

    if (!value && lines[i + 1] && /^\s+-\s+/.test(lines[i + 1])) {
      // Block-style YAML list:
      //   tags:
      //     - one
      value = [];
      while (++i < lines.length && /^\s+-\s+/.test(lines[i])) {
        value.push(lines[i].replace(/^\s+-\s+/, '').trim().replace(/^["']|["']$/g, ''));
      }
      i--;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      // Inline-style YAML list: ["one", "two"]
      value = value.slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      value = value.replace(/^["']|["']$/g, '');
    }
    meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

// Author date of the commit that first added the file (--follow keeps this
// stable across renames). git log prints newest-first, so take the LAST line.
function createdAt(file) {
  try {
    const lines = git('log', '--follow', '--diff-filter=A', '--format=%aI', '--', file)
      .split('\n').filter(Boolean);
    return lines.length ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}

function updatedAt(file) {
  try {
    return git('log', '-1', '--format=%aI', '--', file) || null;
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Zero-dependency Markdown -> HTML renderer (GFM subset)
// Supports: fenced code blocks, headings, hr, blockquotes, ul/ol, tables,
// paragraphs; inline: code spans, images, links, bold, italic.
// ---------------------------------------------------------------------------
function renderMarkdownInline(text) {
  let t = escapeHtml(text);
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    '<img src="$2" alt="$1" loading="lazy" />');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  return t;
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {                       // fenced code block
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^ {0,3}([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {   // horizontal rule
      out.push('<hr />'); i++; continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);     // heading
    if (h) {
      const lvl = h[1].length;
      out.push(`<h${lvl}>${renderMarkdownInline(h[2].trim())}</h${lvl}>`);
      i++; continue;
    }

    if (/^>\s?/.test(line)) {                                      // blockquote
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join(' '))}</blockquote>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1] || '')) {
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        '<table><thead><tr>' + head.map(c => `<th>${renderMarkdownInline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + r.map(c => `<td>${renderMarkdownInline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>'
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {               // unordered list
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*[-*+]\s+/, ''));
      out.push('<ul>' + items.map(x => `<li>${renderMarkdownInline(x)}</li>`).join('') + '</ul>');
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {             // ordered list
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      out.push('<ol>' + items.map(x => `<li>${renderMarkdownInline(x)}</li>`).join('') + '</ol>');
      continue;
    }

    if (!line.trim()) { i++; continue; }           // blank line

    const buf = [line];                            // paragraph
    i++;
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i])
    ) buf.push(lines[i++]);
    out.push(`<p>${renderMarkdownInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Prerendered post page — mirrors the website's exact markup conventions.
// Root-absolute paths so it works from /posts/<slug>/.
// ---------------------------------------------------------------------------
const NAV_LINKS = [
  ['/', 'home', 'Home'], ['/about.html', 'about', 'About'], ['/journey.html', 'journey', 'Journey'],
  ['/work.html', 'work', 'Work'], ['/resume.html', 'resume', 'Resume'],
  ['/notes.html', 'notes', 'Notes'], ['/contact.html', 'contact', 'Contact'],
];

const CSS_VERSION = 'v=20260823b';

function postPage(post) {
  const url = `${SITE_URL}/posts/${post.slug}`;
  const createdIso = post.created || new Date().toISOString();
  const desc = post.summary || post.title;
  const blogLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": desc,
    "url": url,
    "mainEntityOfPage": url,
    "datePublished": createdIso,
    ...(post.updated ? { "dateModified": post.updated } : {}),
    "author": {
      "@type": "Person",
      "name": "Etido Peter",
      "alternateName": "euptron",
      "url": SITE_URL + "/"
    },
    "publisher": {
      "@type": "Person",
      "name": "Etido Peter",
      "url": SITE_URL + "/"
    },
    "image": `${SITE_URL}/assets/og-image.png`,
    ...(post.tags.length ? { "keywords": post.tags.join(', ') } : {}),
    "inLanguage": "en"
  };

  const nav = NAV_LINKS.map(([href, page, label]) =>
    `    <a href="${href}" data-page="${page}"${page === 'notes' ? ' class="active"' : ''}>${label}</a>`
  ).join('\n');

  const tagsHtml = post.tags.length
    ? `<div class="tag-cloud b-tags">${post.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(post.title)} \u2014 EUPTRON</title>
<meta name="description" content="${escapeHtml(desc)}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${escapeHtml(post.title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:url" content="${url}" />
<meta property="og:site_name" content="EUPTRON" />
<meta property="article:published_time" content="${createdIso}" />
${post.updated ? `<meta property="article:modified_time" content="${post.updated}" />\n` : ''}<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(post.title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<meta name="theme-color" content="#000000" />
<meta property="og:image" content="${SITE_URL}/assets/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="EUPTRON \u2014 Etido Peter, software developer and open-source contributor" />
<link rel="alternate" type="application/atom+xml" href="/feed.xml" title="EUPTRON Notes" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<script type="application/ld+json">
${JSON.stringify(blogLd, null, 2)}
</script>
</head>
<body data-page="blog-post">

<div id="cursor-dot"></div>
<div id="cursor-ring"></div>
<div id="wipe"></div>

<header>
  <a href="/" class="brand"><span class="brand-dot"></span>EUPTRON</a>
  <nav id="nav">
${nav}
    <div id="nav-trace"></div>
  </nav>
  <div class="header-right">
    <button id="theme-toggle" aria-label="Toggle light and dark theme">
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
    </button>
    <button class="nav-toggle" id="navToggle" aria-controls="nav" aria-expanded="false">MENU</button>
  </div>
</header>

<main>
  <section class="page" style="max-width:760px;">
    <p class="eyebrow">${formatDate(createdIso)}</p>
    <h1 style="font-size:clamp(28px,5vw,44px);line-height:1.15;">${escapeHtml(post.title)}</h1>
    ${post.summary ? `<p class="blog-post-lede">${escapeHtml(post.summary)}</p>` : ''}
    ${tagsHtml}
    <link rel="stylesheet" href="/css/styles.css?${CSS_VERSION}" />
    <div class="blog-post-body markdown-body">
${renderMarkdown(post.content)}
    </div>
    <p style="margin-top:48px;"><a href="/notes.html" class="btn btn-ghost">\u2190 Back to Notes</a></p>
  </section>
</main>

<footer>\u00A9 ${new Date().getFullYear()} @euptron</footer>
<div id="toast" role="status" aria-live="polite"></div>

<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&amp;family=JetBrains+Mono:wght@400;500;600&amp;family=Inter:wght@400;500;600;700&amp;display=swap" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&amp;family=JetBrains+Mono:wght@400;500;600&amp;family=Inter:wght@400;500;600;700&amp;display=swap" /></noscript>
<script src="/js/scripts.js?${CSS_VERSION}"></script>
</body>
</html>
`;
}

function atomFeed(posts) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const newest = posts[0]?.updated || posts[0]?.created || new Date().toISOString();
  const entries = posts.map(p => `
  <entry>
    <title>${esc(p.title)}</title>
    <link href="${SITE_URL}/posts/${p.slug}" rel="alternate" />
    <id>${SITE_URL}/posts/${p.slug}</id>
    <published>${p.created || new Date().toISOString()}</published>
    <updated>${p.updated || p.created || new Date().toISOString()}</updated>
    ${p.summary ? `<summary>${esc(p.summary)}</summary>` : ''}
    <author><name>Etido Peter</name><uri>${SITE_URL}/</uri></author>
    ${p.tags.map(t => `<category term="${esc(t)}" />`).join('\n    ')}
  </entry>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>EUPTRON \u2014 Notes &amp; Thoughts</title>
  <subtitle>Writing by Etido Peter (@euptron) on software development, open source, and building under constraints.</subtitle>
  <link href="${SITE_URL}/notes.html" rel="alternate" />
  <link href="${SITE_URL}/feed.xml" rel="self" />
  <id>${SITE_URL}/feed.xml</id>
  <updated>${newest}</updated>
${entries}
</feed>
`;
}

function sitemapXml(posts) {
  const staticPages = [
    '', '/about.html', '/journey.html', '/work.html',
    '/resume.html', '/notes.html', '/contact.html',
  ];
  const urls = [
    ...staticPages.map(p => ({ loc: `${SITE_URL}${p || '/'}`, lastmod: null })),
    ...posts.map(p => ({ loc: `${SITE_URL}/posts/${p.slug}`, lastmod: p.updated || p.created })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const files = readdirSync(NOTES_DIR)
  .filter(f => f.toLowerCase().endsWith('.md'))
  .filter(f => !f.startsWith('_') && !f.startsWith('.'));

const posts = [];
for (const name of files) {
  const path = join(NOTES_DIR, name);
  const raw = readFileSync(path, 'utf8');
  const { meta, body } = parseFrontmatter(raw);

  if (!meta.title) {
    console.warn(`build-notes: skipping "${name}" \u2014 missing required "title" frontmatter.`);
    continue;
  }

  posts.push({
    slug: String(meta.slug || name.replace(/\.md$/i, '')).toLowerCase(),
    type: meta.type === 'post' ? 'post' : 'note',
    title: meta.title,
    summary: meta.summary || '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    created: createdAt(path),
    updated: updatedAt(path),
    source_file: `notes/${name}`,
    content: body,
  });
}

posts.sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'notes.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), count: posts.length, posts }, null, 2) + '\n');

for (const post of posts) {
  const dir = join(DIST, 'posts', post.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), postPage(post));
}

writeFileSync(join(DIST, 'feed.xml'), atomFeed(posts));
writeFileSync(join(DIST, 'sitemap.xml'), sitemapXml(posts));

console.log(`build-notes: wrote notes.json, ${posts.length} prerendered post page(s), feed.xml, sitemap.xml in ${DIST}/`);
