const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrateFirstRunSettings } = require('../lib/preferences');

test('upgrading from before the tour shows it once while preserving settings', () => {
  const previous = { themeColor: '#c04090', preferredVoice: 'My voice', unknown: { retained: true } };
  assert.deepEqual(migrateFirstRunSettings(previous), { ...previous, firstRunComplete: false, firstRunRelease: '' });
  assert.equal(Object.hasOwn(previous, 'firstRunComplete'), false);
});
test('incomplete and completed first-run choices survive subsequent launches', () => {
  for (const firstRunComplete of [false, true]) {
    const settings = { firstRunComplete, firstRunRelease: '8.1.0', heyCortana: false };
    assert.deepEqual(migrateFirstRunSettings(migrateFirstRunSettings(settings)), settings);
  }
});
test('an early upgrade flag cannot suppress the released tour', () => {
  const settings = { firstRunComplete: true, heyCortana: false, preferredVoice: 'Keep my voice' };
  assert.deepEqual(migrateFirstRunSettings(settings), { ...settings, firstRunComplete: false, firstRunRelease: '' });
  assert.equal(settings.firstRunComplete, true);
});
