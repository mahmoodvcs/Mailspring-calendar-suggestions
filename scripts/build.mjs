// Bundles the plugin into dist/calendar-suggestions, a folder holding only what Mailspring loads at
// runtime. "Install a Plugin..." copies the folder it's given wholesale, so pointing it at the
// project root would drag node_modules along.
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const outDir = path.join(root, 'dist', pkg.name);
const watch = process.argv.includes('--watch');

function writeStaticFiles() {
  fs.mkdirSync(outDir, { recursive: true });

  const runtimeFields = ['name', 'displayName', 'version', 'description', 'main', 'license', 'engines', 'windowTypes'];
  const runtimePkg = Object.fromEntries(runtimeFields.filter((k) => k in pkg).map((k) => [k, pkg[k]]));
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(runtimePkg, null, 2) + '\n');

  fs.rmSync(path.join(outDir, 'styles'), { recursive: true, force: true });
  fs.cpSync(path.join(root, 'styles'), path.join(outDir, 'styles'), { recursive: true });
  fs.copyFileSync(path.join(root, 'README.md'), path.join(outDir, 'README.md'));
}

const options = {
  entryPoints: [path.join(root, 'src', 'main.ts')],
  outfile: path.join(outDir, 'lib', 'main.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  // Provided by Mailspring at runtime; bundling a second React or Electron would break the app
  external: ['mailspring-exports', 'mailspring-component-kit', 'electron'],
  sourcemap: 'inline',
  logLevel: 'info',
};

writeStaticFiles();

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
