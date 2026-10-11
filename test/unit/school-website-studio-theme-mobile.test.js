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
