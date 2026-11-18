import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 把公用浏览台打成单文件 HTML：viewer/preview.html
 * 用法：npm run viewer:build
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../node_modules/.cache/viewer-preview');

await mkdir(outDir, { recursive: true });

await build({
  root: here,
  configFile: false,
  base: './',
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

const builtHtml = await readFile(path.join(outDir, 'index.html'), 'utf8');
const match = builtHtml.match(/<script[^>]*src="\.\/([^"]+)"[^>]*><\/script>/);
if (!match) throw new Error('viewer bundle script not found');

const js = (await readFile(path.join(outDir, match[1]), 'utf8')).replace(/<\/script>/g, '<\\/script>');
const html = builtHtml.replace(match[0], () => `<script type="module">\n${js}\n</script>`);
const target = path.join(here, 'preview.html');
await writeFile(target, html);
console.log(`wrote ${target} (${(html.length / 1024).toFixed(0)} KB)`);
