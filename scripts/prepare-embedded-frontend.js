const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const electronDir = path.join(rootDir, 'electron');
const outputDir = path.join(electronDir, 'embedded-frontend');

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureExists(targetPath, hint) {
  if (!fs.existsSync(targetPath)) {
    console.error(`[embed] missing ${targetPath}`);
    if (hint) console.error(hint);
    process.exit(1);
  }
}

function isStandaloneRoot(dir) {
  return (
    fs.existsSync(path.join(dir, 'server.js')) &&
    fs.existsSync(path.join(dir, '.next')) &&
    fs.existsSync(path.join(dir, 'package.json'))
  );
}

function findStandaloneRoot(standaloneDir) {
  if (isStandaloneRoot(standaloneDir)) return standaloneDir;
  const entries = fs.readdirSync(standaloneDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const candidate = path.join(standaloneDir, entry.name);
    if (isStandaloneRoot(candidate)) return candidate;
  }
  return null;
}

function copyDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

if (!skipBuild) {
  console.log('[embed] building frontend (next build)');
  run('npm', ['--workspace', 'frontend', 'run', 'build'], rootDir);
}

const standaloneDir = path.join(frontendDir, '.next', 'standalone');
const staticDir = path.join(frontendDir, '.next', 'static');
const publicDir = path.join(frontendDir, 'public');

const standaloneRoot = findStandaloneRoot(standaloneDir);
if (!standaloneRoot) {
  console.error(`[embed] missing standalone server.js in ${standaloneDir}`);
  console.error(
    '[embed] run "npm --workspace frontend run build" with output: "standalone" in frontend/next.config.ts',
  );
  process.exit(1);
}
ensureExists(staticDir, '[embed] missing .next/static output');

if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

copyDir(standaloneRoot, outputDir);
if (standaloneRoot !== standaloneDir) {
  const standaloneNodeModules = path.join(standaloneDir, 'node_modules');
  const rootNodeModules = path.join(standaloneRoot, 'node_modules');
  if (fs.existsSync(standaloneNodeModules) && !fs.existsSync(rootNodeModules)) {
    copyDir(standaloneNodeModules, path.join(outputDir, 'node_modules'));
  }
}
copyDir(staticDir, path.join(outputDir, '.next', 'static'));

if (fs.existsSync(publicDir)) {
  copyDir(publicDir, path.join(outputDir, 'public'));
}

console.log(`[embed] ready at ${outputDir}`);
