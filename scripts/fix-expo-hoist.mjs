import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

function ensureSymlink({ targetRelativeToLink, linkPath }) {
  const linkDir = path.dirname(linkPath);
  fs.mkdirSync(linkDir, { recursive: true });

  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const existing = fs.readlinkSync(linkPath);
      if (existing === targetRelativeToLink) return;
    }
    fs.rmSync(linkPath, { recursive: true, force: true });
  } catch {
    // Link does not exist yet.
  }

  fs.symlinkSync(targetRelativeToLink, linkPath, 'junction');
}

function ensureNestedFromRoot(pkgName) {
  const linkPath = path.join(projectRoot, 'node_modules', 'expo', 'node_modules', pkgName);
  const targetRelativeToLink = path.join('..', '..', pkgName);
  ensureSymlink({ targetRelativeToLink, linkPath });
}

function ensureRootFromNested(pkgName) {
  const linkPath = path.join(projectRoot, 'node_modules', pkgName);
  const targetRelativeToLink = path.join('expo', 'node_modules', pkgName);
  ensureSymlink({ targetRelativeToLink, linkPath });
}

function ensureReanimatedLegacyTypesFile() {
  const legacyPath = path.join(
    projectRoot,
    'node_modules',
    'react-native-reanimated',
    'src',
    'common',
    'types.ts'
  );
  const content = "export * from './types';\n";
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
  if (!fs.existsSync(legacyPath) || fs.readFileSync(legacyPath, 'utf8') !== content) {
    fs.writeFileSync(legacyPath, content, 'utf8');
  }
}

function disableReanimatedCSSExport() {
  const candidates = [
    path.join(projectRoot, 'node_modules', 'react-native-reanimated', 'src', 'index.ts'),
    path.join(projectRoot, 'node_modules', 'react-native-reanimated', 'lib', 'module', 'index.js'),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const source = fs.readFileSync(filePath, 'utf8');
    const next = source
      .replace("export * from './css';", '// patched: disable reanimated css export for RN runtime compatibility')
      .replace("export * from \"./css\";", '// patched: disable reanimated css export for RN runtime compatibility');
    if (next !== source) {
      fs.writeFileSync(filePath, next, 'utf8');
    }
  }
}

// Expo SDK 55 occasionally resolves these in different locations.
ensureNestedFromRoot('expo-asset');
ensureRootFromNested('expo-modules-core');
ensureReanimatedLegacyTypesFile();
disableReanimatedCSSExport();

console.log('[fix-expo-hoist] ensured expo links and reanimated runtime compatibility patches');

