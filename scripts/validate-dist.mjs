import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import ts from 'typescript';

const requiredFiles = [
  'dist/manifest.json',
  'dist/background.js',
  'dist/content.js',
  'dist/page.js',
  'dist/src/offscreen/index.html',
  'dist/offscreen.js',
  'dist/THIRD_PARTY_NOTICES.txt',
  'dist/icons/icon-16.png',
  'dist/icons/icon-48.png',
  'dist/icons/icon-128.png',
];

await Promise.all(requiredFiles.map((file) => access(file, constants.R_OK)));

const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('dist manifest is not Manifest V3');
if (manifest.background?.service_worker !== 'background.js') throw new Error('background worker is not wired');
if (!manifest.permissions?.includes('offscreen')) throw new Error('local media processing permission is missing');
if (!manifest.permissions?.includes('alarms') || !manifest.permissions?.includes('notifications')) {
  throw new Error('scheduler permissions are missing');
}

const mainWorldScript = manifest.content_scripts?.find((script) => script.world === 'MAIN');
const isolatedScript = manifest.content_scripts?.find((script) => script.js?.includes('content.js'));
if (!mainWorldScript?.js?.includes('page.js')) throw new Error('MAIN-world page bridge is not wired');
if (!isolatedScript) throw new Error('isolated content script is not wired');

for (const script of ['dist/background.js', 'dist/content.js', 'dist/page.js']) {
  const source = await readFile(script, 'utf8');
  const parsed = ts.createSourceFile(script, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  if (parsed.statements.some((node) => ts.isImportDeclaration(node) || ts.isExportDeclaration(node))) {
    throw new Error(`${script} contains an unsupported module import or export`);
  }
}

console.log('Validated unpacked extension bundle in dist/.');
