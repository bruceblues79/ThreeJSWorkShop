import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 把公用浏览台打成单文件 HTML：viewer/preview.html
 * 用法：npm run viewer:build -- <assetId>
 * 带 assetId 时构建期只为该资产生成注册表，其它资产的模型代码不进入产物。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../node_modules/.cache/viewer-preview');
const asset = process.argv[2]?.trim() ?? '';

const registryPath = path.join(here, 'assets.ts');
const registrySource = await readFile(registryPath, 'utf8');

const VIRTUAL_ID = 'virtual:asset-registry';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** 解析 `import { createX } from '<路径>'`，得到 工厂名 → 模块路径。 */
function parseFactoryImports(source) {
  const map = new Map();
  for (const match of source.matchAll(/^import\s*\{\s*([A-Za-z_$][\w$]*)\s*\}\s*from\s*'([^']+)'\s*;?\s*$/gm)) {
    map.set(match[1], match[2]);
  }
  return map;
}

/** 从 assets.ts 源码里按大括号配对切出 ASSETS 的每一条，返回 { id, create, block }。 */
function parseEntries(source) {
  const anchor = source.search(/export\s+const\s+ASSETS\b/);
  if (anchor < 0) throw new Error('ASSETS array not found in viewer/assets.ts');
  // 跳过类型注解里的 `[]`，从赋值号后的数组字面量开始
  const assign = source.slice(anchor).match(/=\s*\[/);
  if (!assign) throw new Error('ASSETS array literal not found in viewer/assets.ts');
  const open = anchor + assign.index + assign[0].length - 1;

  const blocks = [];
  let depth = 0;
  let start = -1;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
      if (depth === 1) start = i;
    } else if (ch === '}') {
      if (depth === 1 && start >= 0) blocks.push(source.slice(start, i + 1));
      depth -= 1;
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }

  return blocks.map((block) => {
    const id = block.match(/\bid:\s*'([^']+)'/)?.[1];
    const create = block.match(/\bcreate:\s*([A-Za-z_$][\w$]*)/)?.[1];
    if (!id || !create) throw new Error(`cannot parse asset entry in viewer/assets.ts:\n${block}`);
    return { id, create, block };
  });
}

const factories = parseFactoryImports(registrySource);
const entries = parseEntries(registrySource);
const selected = asset ? entries.find((entry) => entry.id === asset) : null;
if (asset && !selected) throw new Error(`asset '${asset}' is not registered in viewer/assets.ts`);

/** 虚拟模块没有真实文件位置，因此用绝对路径生成 import 说明符。 */
const toSpecifier = (target) => JSON.stringify(path.resolve(here, target).replaceAll('\\', '/'));

function assetRegistryPlugin() {
  return {
    name: 'viewer-asset-registry',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      // 全量构建：原样再导出真实注册表，行为与改动前一致
      if (!selected) return `export { ASSETS } from ${toSpecifier(registryPath)};`;
      const modulePath = factories.get(selected.create);
      if (!modulePath) throw new Error(`import of '${selected.create}' not found in viewer/assets.ts`);
      return [
        `import { ${selected.create} } from ${toSpecifier(modulePath)};`,
        `export const ASSETS = [${selected.block}];`,
      ].join('\n');
    },
  };
}

await mkdir(outDir, { recursive: true });

await build({
  root: here,
  configFile: false,
  base: './',
  logLevel: 'warn',
  define: asset ? { 'globalThis.__PREVIEW_ASSET__': JSON.stringify(asset) } : {},
  plugins: [assetRegistryPlugin()],
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
