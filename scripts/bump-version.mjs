#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mode = process.argv[2] ?? 'patch';

if (!['patch', 'minor'].includes(mode)) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor>');
  process.exit(1);
}

const appJsonPath = path.join(root, 'app.json');
const packageJsonPath = path.join(root, 'package.json');
const iosPbxprojPath = path.join(root, 'ios', 'Luna.xcodeproj', 'project.pbxproj');
const iosInfoPlistPath = path.join(root, 'ios', 'Luna', 'Info.plist');
const androidGradlePath = path.join(root, 'android', 'app', 'build.gradle');

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function nextVersion(v, bumpMode) {
  const p = parseSemver(v);
  if (bumpMode === 'patch') return `${p.major}.${p.minor}.${p.patch + 1}`;
  return `${p.major}.${p.minor + 1}.0`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function maxNumberFromMatches(text, reg) {
  const matches = [...text.matchAll(reg)].map((x) => Number(x[1]));
  if (matches.length === 0) return null;
  return Math.max(...matches);
}

const appJson = readJson(appJsonPath);
const pkgJson = readJson(packageJsonPath);

const currentVersion = appJson.expo?.version ?? pkgJson.version;
if (!currentVersion) {
  throw new Error('Cannot determine current app version from app.json/package.json');
}

const newVersion = nextVersion(currentVersion, mode);

// Update app.json shared version fields
appJson.expo = appJson.expo ?? {};
appJson.expo.version = newVersion;
appJson.expo.runtimeVersion = newVersion;
appJson.expo.ios = appJson.expo.ios ?? {};
appJson.expo.android = appJson.expo.android ?? {};

// iOS build number: always +1 from current value (prefer pbxproj if exists)
let iosBuildCurrent = Number(appJson.expo.ios.buildNumber ?? 0);
if (fs.existsSync(iosPbxprojPath)) {
  const pbxText = fs.readFileSync(iosPbxprojPath, 'utf8');
  const pbxBuild = maxNumberFromMatches(pbxText, /CURRENT_PROJECT_VERSION = (\d+);/g);
  if (pbxBuild !== null) iosBuildCurrent = Math.max(iosBuildCurrent, pbxBuild);
}
const iosBuildNext = iosBuildCurrent + 1;
appJson.expo.ios.buildNumber = String(iosBuildNext);

// Android versionCode: always +1 (app.json first, then android gradle fallback)
let androidCodeCurrent = Number(appJson.expo.android.versionCode ?? 0);
if (fs.existsSync(androidGradlePath)) {
  const gradleText = fs.readFileSync(androidGradlePath, 'utf8');
  const m = /versionCode\s+(\d+)/.exec(gradleText);
  if (m) androidCodeCurrent = Math.max(androidCodeCurrent, Number(m[1]));
}
const androidCodeNext = androidCodeCurrent + 1;
appJson.expo.android.versionCode = androidCodeNext;

writeJson(appJsonPath, appJson);

// Keep package.json version aligned
pkgJson.version = newVersion;
writeJson(packageJsonPath, pkgJson);

// iOS native version takes precedence when ios/ exists
if (fs.existsSync(iosPbxprojPath)) {
  let pbxText = fs.readFileSync(iosPbxprojPath, 'utf8');
  pbxText = pbxText.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${newVersion};`);
  pbxText = pbxText.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${iosBuildNext};`);
  fs.writeFileSync(iosPbxprojPath, pbxText, 'utf8');
}

// Ensure iOS Info.plist does not pin static version/build values.
if (fs.existsSync(iosInfoPlistPath)) {
  let plistText = fs.readFileSync(iosInfoPlistPath, 'utf8');
  plistText = plistText.replace(
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)([^<]*)(<\/string>)/,
    '$1$(MARKETING_VERSION)$3'
  );
  plistText = plistText.replace(
    /(<key>CFBundleVersion<\/key>\s*<string>)([^<]*)(<\/string>)/,
    '$1$(CURRENT_PROJECT_VERSION)$3'
  );
  fs.writeFileSync(iosInfoPlistPath, plistText, 'utf8');
}

// Android native files (if prebuild exists)
if (fs.existsSync(androidGradlePath)) {
  let gradleText = fs.readFileSync(androidGradlePath, 'utf8');
  gradleText = gradleText.replace(/versionCode\s+\d+/g, `versionCode ${androidCodeNext}`);
  gradleText = gradleText.replace(/versionName\s+"[^"]+"/g, `versionName "${newVersion}"`);
  fs.writeFileSync(androidGradlePath, gradleText, 'utf8');
}

console.log(`Version bumped (${mode})`);
console.log(`- app version: ${currentVersion} -> ${newVersion}`);
console.log(`- iOS buildNumber/CURRENT_PROJECT_VERSION: ${iosBuildCurrent} -> ${iosBuildNext}`);
console.log(`- Android versionCode: ${androidCodeCurrent} -> ${androidCodeNext}`);
