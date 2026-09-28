const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'js');
const files = fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort();

for (const file of files) {
  execFileSync(process.execPath, ['--check', path.join(JS_DIR, file)], { stdio: 'inherit' });
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
