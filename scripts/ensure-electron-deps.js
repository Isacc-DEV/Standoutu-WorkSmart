const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const exePath = path.join(
  rootDir,
  'node_modules',
  '7zip-bin',
  'win',
  'x64',
  '7za.exe',
);

console.log('[electron] installing 7zip-bin if needed');
const result = spawnSync(
  'npm',
  ['install', '--no-save', '--workspaces=false', '7zip-bin@^5.2.0'],
  {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(exePath)) {
  console.error('[electron] 7za.exe still missing after install');
  process.exit(1);
}
