#!/usr/bin/env node
// Zero-dependency compiler for the portfolio notes pipeline.
// Walks notes/*.md, parses YAML frontmatter, extracts authoritative dates
// from Git history (first commit = created, last commit = updated), and
// emits a single notes.json consumed by my portfolio at euptron.pages.dev.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const NOTES_DIR = process.env.NOTES_DIR || 'notes';
const OUT_PATH = process.env.OUT_PATH || 'dist/notes.json';

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
      //     - two
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

const files = readdirSync(NOTES_DIR)
  .filter(f => f.toLowerCase().endsWith('.md'))
  .filter(f => !f.startsWith('_') && !f.startsWith('.'));

const posts = [];
for (const name of files) {
  const path = join(NOTES_DIR, name);
  const raw = readFileSync(path, 'utf8');
  const { meta, body } = parseFrontmatter(raw);

  if (!meta.title) {
    console.warn(`build-notes: skipping "${name}" — missing required "title" frontmatter.`);
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

const payload = {
  generated_at: new Date().toISOString(),
  count: posts.length,
  posts,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n');
console.log(`build-notes: wrote ${OUT_PATH} (${posts.length} note${posts.length === 1 ? '' : 's'}).`);
