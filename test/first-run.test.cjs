const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrateFirstRunSettings } = require('../lib/preferences');

test('existing settings offer a replayable tour without forcing a fresh setup', () => {
  const previous = { themeColor: '#c04090', preferredVoice: 'My voice', unknown: { retained: true } };
  assert.deepEqual(migrateFirstRunSettings(previous), { ...previous, firstRunComplete: true });
  assert.equal(Object.hasOwn(previous, 'firstRunComplete'), false);
});
test('incomplete and completed first-run choices survive subsequent launches', () => {
  for (const firstRunComplete of [false, true]) {
    const settings = { firstRunComplete, heyCortana: false };
    assert.deepEqual(migrateFirstRunSettings(migrateFirstRunSettings(settings)), settings);
  }
});
