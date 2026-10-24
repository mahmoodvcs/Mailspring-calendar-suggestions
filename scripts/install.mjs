// Copies the built plugin into Mailspring's packages folder. Pass --dev to target the
// Mailspring-dev config folder that `npm start` in a Mailspring checkout uses.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const builtDir = path.join(root, 'dist', pkg.name);

function appDataDir() {
  switch (process.platform) {
    case 'win32':
      return process.env.APPDATA;
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support');
    default:
      return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
}

const configDirName = process.argv.includes('--dev') ? 'Mailspring-dev' : 'Mailspring';
const targetDir = path.join(appDataDir(), configDirName, 'packages', pkg.name);

if (!fs.existsSync(path.join(builtDir, 'lib', 'main.js'))) {
  console.error(`No build found at ${builtDir}. Run "npm run build" first.`);
  process.exit(1);
}

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(targetDir), { recursive: true });
fs.cpSync(builtDir, targetDir, { recursive: true });
console.log(`Installed ${pkg.name} to ${targetDir}`);
console.log('Restart Mailspring (or reload the window with Ctrl/Cmd+R) to load it.');
