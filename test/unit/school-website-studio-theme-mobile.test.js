const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Website Studio theme follows the SCMS core light/dark preference', () => {
  const html = read('school-website/create.html');
  const css = read('school-website/create.css');
  assert.match(html, /localStorage\.getItem\('scms_theme'\)/);
  assert.match(html, /localStorage\.setItem\('scms_theme', theme\)/);
  assert.match(html, /id="themeToggle"/);
  assert.match(html, /Switch to dark theme/);
  assert.match(html, /Switch to light theme/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /--ws-page:#10151b/);
  assert.match(css, /--ws-surface:#19232d/);
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /website mockup/);
});

test('Website Studio header actions remain reachable on narrow mobile screens', () => {
  const html = read('school-website/create.html');
  const css = read('school-website/create.css');
  assert.match(html, /class="header-actions"/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.header-actions\{width:100%;max-width:100%;gap:7px;overflow-x:auto/);
  assert.match(css, /@media\(max-width:380px\)/);
  assert.match(css, /\.preview-panel\{inset:112px 8px 8px/);
  assert.match(css, /-webkit-overflow-scrolling:touch/);
});

test('dark theme styles editor surfaces without recoloring the public-site canvas', () => {
  const css = read('school-website/create.css');
  assert.match(css, /\.builder-header\{background:color-mix/);
  assert.match(css, /\.template-strip,.content-strip,.next-step-card\{background:var\(--ws-surface\)/);
  assert.match(css, /dialog\{background:var\(--ws-surface\);color:var\(--ws-ink\)\}/);
  assert.match(css, /central page canvas and its live preview intentionally remain a light website mockup/);
});


test('Website Studio restores hidden sections from a visible section manager', () => {
  const html = read('school-website/create.html');
  const js = read('school-website/create.js');
  assert.match(html, /id="sectionManager"/);
  assert.match(js, /function renderSectionManager\(\)/);
  assert.match(js, /data-section-toggle/);
  assert.match(js, /sectionAction\(managerToggle\.dataset\.sectionToggle,"toggle"\)/);
  assert.match(js, /if\(\(action==="hide"\|\|action==="toggle"\)&&!m\.locked\)m\.visible=!m\.visible/);
});

test('template selection updates and persists the live preview', () => {
  const html = read('school-website/create.html');
  const js = read('school-website/create.js');
  const css = read('school-website/create.css');
  assert.match(html, /class="template-swatch swatch-modern"/);
  assert.match(html, /class="template-swatch swatch-classic"/);
  assert.match(html, /class="template-swatch swatch-premium"/);
  assert.match(js, /state\.template=b\.dataset\.template;templateDialog\.close\(\);render\(\)/);
  assert.match(css, /body\[data-template="classic"\] \.hero-block/);
  assert.match(css, /body\[data-template="premium"\] \.hero-block/);
  assert.match(css, /\.preview-page h1,\.preview-page h2,\.preview-page h3\{color:#17202a\}/);
});

test('draft and domain failures provide user-facing status instead of silent offline fallback', () => {
  const js = read('school-website/create.js');
  assert.match(js, /function studioErrorMessage\(error,context\)/);
  assert.match(js, /Save failed — /);
  assert.match(js, /studioErrorMessage\(error,"domain"\)/);
  assert.match(js, /Offline backup only — SCMS sync unavailable/);
});
