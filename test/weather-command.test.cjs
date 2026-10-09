const { test } = require('node:test');
const assert = require('node:assert/strict');
const weather = require('../lib/weather-command');

const local = [
  'weather', 'my weather', "what's my weather", 'what is my weather', 'what’s my weather',
  "what's the weather", 'what is the weather', "how's the weather", 'how is my weather',
  "what's the weather like", 'what is my weather like today', 'weather today',
  "today's weather", 'today’s weather', 'current weather', 'local weather',
  'my local weather', 'weather forecast', 'weather forecast today', 'forecast',
  'my forecast', 'show me the weather', 'tell me my weather', 'give me the weather',
  'check the weather', 'get my weather', 'weather here', 'weather near me',
  'weather in my area', 'weather in my city', 'weather in my location',
  'weather for me', 'weather for today', 'weather right now', 'weather near me today',
];
const cities = [
  ['weather in Chicago', 'Chicago'], ['weather for Paris', 'Paris'], ['weather of Tokyo', 'Tokyo'],
  ['weather at London', 'London'], ['weather New York', 'New York'], ['New York weather', 'New York'],
  ["what's the weather in São Paulo", 'São Paulo'], ['what’s my weather in London', 'London'],
  ['what is the weather like in New York', 'New York'], ['how is the weather for Paris', 'Paris'],
  ['weather in St. Louis', 'St. Louis'], ['weather in Washington, DC', 'Washington, DC'],
  ['Chicago forecast', 'Chicago'], ['weather forecast in Chicago', 'Chicago'],
  ['show me the weather in Chicago today', 'Chicago'], ['Chicago weather today', 'Chicago'],
];
test('personal and local weather phrases never become city names', () => {
  for (const phrase of local) for (const punctuation of ['', '?', '!', '.']) {
    const query = '  ' + phrase + punctuation + '  ';
    assert.ok(weather.commandPattern.test(query), query);
    assert.deepEqual(weather.parse(query), { location: null }, query);
  }
});
test('explicit weather cities retain spelling, accents and internal punctuation', () => {
  for (const [phrase, location] of cities) for (const punctuation of ['', '?', '!', '.']) {
    assert.ok(weather.commandPattern.test(phrase + punctuation), phrase);
    assert.deepEqual(weather.parse(phrase + punctuation), { location }, phrase);
  }
});
test('unfinished locations ask for a city, and unsupported forecasts are not geocoded', () => {
  for (const query of ['weather in', 'weather for', "what's the weather like in?"]) {
    assert.deepEqual(weather.parse(query), { location: '' }, query);
  }
  for (const query of ['weather tomorrow', "tomorrow's weather", 'weather in Chicago tomorrow', 'forecast for tonight', 'weather next week']) {
    assert.deepEqual(weather.parse(query), { unsupportedPeriod: true }, query);
  }
});
test('weather requests do not steal reminders, app actions or unrelated questions', () => {
  for (const query of ['remind me to check the weather', 'set a timer for weather', 'open the weather',
    'write a poem about weather', 'what is the time in Tokyo', 'what is weather', 'how does weather work']) {
    assert.equal(weather.commandPattern.test(query), false, query);
    assert.equal(weather.parse(query), null, query);
  }
});
