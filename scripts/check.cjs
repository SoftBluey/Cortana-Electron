const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const files = ['main.js', 'renderer.js'];
for (const folder of ['lib', 'scripts', 'test']) {
  if (fs.existsSync(folder)) for (const name of fs.readdirSync(folder)) {
    if (/\.(?:js|cjs)$/.test(name)) files.push(`${folder}/${name}`);
  }
}
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Syntax checks passed for ${files.length} JavaScript files.`);
