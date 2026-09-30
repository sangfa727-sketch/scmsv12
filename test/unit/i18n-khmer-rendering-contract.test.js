const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX_FILE = path.join(ROOT, 'index.html');
const CSS_FILE = path.join(ROOT, 'style.css');

const index = () => fs.readFileSync(INDEX_FILE, 'utf8');
const css = () => fs.readFileSync(CSS_FILE, 'utf8');

test('Khmer rendering foundation is explicitly loaded', () => {
  const source = index();

  assert.match(
    source,
    /family=Noto\+Sans\+Khmer:wght@400;500;600;700&display=swap/,
    'index.html must load a Khmer-capable font'
  );
});

test('Khmer locale receives an explicit script-aware font stack', () => {
  const source = css();

  assert.match(
    source,
    /html\[lang="km"\]\s+body\s*\{[\s\S]*?font-family:\s*'Noto Sans Khmer'/,
    'html[lang="km"] body must use the Khmer-capable font'
  );

  for (const selector of [
    'button',
    'input',
    'textarea',
    'select',
    'option',
    '.modal-sheet',
    '.toast',
    '.tab-label',
  ]) {
    assert.match(
      source,
      new RegExp('html\\[lang="km"\\][\\s\\S]*?' + selector.replace('.', '\\.') + '[\\s\\S]*?font-family:\\s*\\'Noto Sans Khmer\\''),
      'Khmer UI selector must retain the Khmer-capable font: ' + selector
    );
  }
});

test('Khmer baseline allows additional vertical room for script shaping', () => {
  const source = css();
  assert.match(
    source,
    /html\[lang="km"\]\s+body\s*\{[\s\S]*?line-height:\s*1\.65/,
    'Khmer baseline must use a script-safe line-height'
  );
});

test('Khmer sample strings contain actual Khmer Unicode characters', () => {
  const samples = ['ខ្មែរ', 'ការគ្រប់គ្រង', 'សិស្ស'];
  for (const sample of samples) {
    assert.match(sample, /[\u1780-\u17FF]/, 'sample must contain Khmer Unicode code points');
  }
});
