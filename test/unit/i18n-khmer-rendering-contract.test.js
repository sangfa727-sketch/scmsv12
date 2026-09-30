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
    const selectorPattern = selector.startsWith('.')
      ? selector.replace('.', '\\.')
      : selector;
    const pattern = new RegExp(
      'html\\[lang="km"\\][\\s\\S]*?' +
      selectorPattern +
      '[\\s\\S]*?font-family:\\s*' +
      "'Noto Sans Khmer'"
    );

    assert.match(
      source,
      pattern,
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

test('Khmer locale is registered for production switching', () => {
  const i18n = fs.readFileSync(path.join(ROOT, 'js', '00c_i18n.js'), 'utf8');
  const source = index();

  assert.match(i18n, /code:\s*'km'[^\n]*dict:\s*\(\)\s*=>\s*window\.I18N_KM/);
  assert.match(i18n, /km:\s*\['km',\s*'km-kh'\]/);
  assert.match(i18n, /km:\s*'km-KH'/);
  assert.match(source, /data-lang="km"[^>]*>ខ្មែរ<\/button>/);
  assert.match(source, /<script src="js\/00e_locales_km\.js\?v=/);
});
