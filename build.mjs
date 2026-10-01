import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('static', 'dist', { recursive: true });
cpSync('src/pages/collection.html', 'dist/collection.html');

const opts = {
  entryPoints: {
    background: 'src/background/main.ts',
    content: 'src/content/main.ts',
    collection: 'src/pages/collection.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  loader: { '.css': 'text' },
  logLevel: 'info',
};

if (watch) await (await esbuild.context(opts)).watch();
else await esbuild.build(opts);
