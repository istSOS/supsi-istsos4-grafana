const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const version = readJson('package.json').version;
const lock = readJson('package-lock.json');
const plugin = readJson('dist/plugin.json');

assert.equal(lock.version, version, 'Lockfile version must match package.json');
assert.equal(lock.packages[''].version, version, 'Lockfile root version must match package.json');
assert.equal(plugin.info.version, version, 'Built plugin version must match package.json');
assert.equal(plugin.id, readJson('src/plugin.json').id, 'Built plugin ID must match source');
if (process.argv[2]) {
  assert.equal(process.argv[2], `v${version}`, 'Release tag must match package.json');
}
console.log(`Release versions match: ${plugin.id} ${version}`);
