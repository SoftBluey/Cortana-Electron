const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const inputs = JSON.stringify({ runtime: pkg.dependencies['@microsoft/dynwinrt'],
  generator: pkg.devDependencies['@microsoft/dynwinrt-codegen'], cli: pkg.devDependencies['@microsoft/winappcli'],
  bindings: pkg.winapp.jsBindings }) + fs.readFileSync(path.join(root, 'winapp.yaml'), 'utf8');
const signature = crypto.createHash('sha256').update(inputs).digest('hex');
const directory = path.join(root, '.winapp', 'bindings');
const stamp = path.join(directory, '.cortana-bindings.json');
let matches = false;
try { matches = JSON.parse(fs.readFileSync(stamp, 'utf8')).signature === signature && fs.existsSync(path.join(directory, 'index.js')); } catch (_) {}
if (process.argv.includes('--force') || !matches) {
  const cli = path.join(path.dirname(require.resolve('@microsoft/winappcli')), 'cli.js');
  execFileSync(process.execPath, [cli, 'restore'], { cwd: root, stdio: 'inherit' });
  fs.writeFileSync(stamp, JSON.stringify({ signature }));
} else console.log('WinRT bindings match the installed speech components.');
