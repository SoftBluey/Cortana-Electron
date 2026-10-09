const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
const temporal = source.slice(source.indexOf('const temporalNumberWords ='), source.indexOf('let savingReminder ='));
const fixed = new Date(2026, 9, 9, 12, 0, 0, 0).getTime();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixed])); }
  static now() { return fixed; }
}
function parse(text) { return vm.runInNewContext(temporal + ';parseDateTime(input)', { Date: FixedDate, input: text }); }

test('reminder clocks validate the entire time and reject rolled-over dates', () => {
  for (const text of ['25:00', '24:01', '12:75 pm', '0 pm', '13 pm', '100 pm', '3 pm junk', 'tomorrow at 29:00', '-3 pm', 'in 0 minutes']) {
    assert.equal(parse(text), null, text);
  }
});
test('reminder day, AM/PM and relative-duration semantics survive parsing', () => {
  for (const [text, expected] of [
    ['tomorrow at 3 pm', new Date(2026, 9, 10, 15)],
    ['at 12 am', new Date(2026, 9, 10, 0)],
    ['12 pm', new Date(2026, 9, 10, 12)],
    ['tomorrow', new Date(2026, 9, 10, 9)],
    ['tonight', new Date(2026, 9, 9, 21)],
    ['on Monday at 7 am', new Date(2026, 9, 12, 7)],
    ['in twenty-five minutes', new Date(fixed + 25 * 60000)],
    ['in two days', new Date(fixed + 2 * 86400000)],
    ['today at 9 am', new Date(2026, 9, 9, 9)],
  ]) assert.equal(parse(text)?.getTime(), expected.getTime(), text);
});
test('reminder text retains capitalization and internal prepositions', () => {
  const context = vm.createContext({ Date: FixedDate });
  vm.runInContext(temporal, context);
  const result = vm.runInContext("parseReminderRequest('Check in at the hotel tomorrow at 3 pm')", context);
  assert.equal(result.reminderText, 'Check in at the hotel');
  assert.equal(result.timeText, '2026-10-10T15:00');
});
test('calculator rejects malformed decimals while retaining valid decimal math', () => {
  const code = source.slice(source.indexOf('function calculateResponse('), source.indexOf('async function getWeather('));
  const calculate = input => vm.runInNewContext(code + ';calculateResponse(input)', {
    input, createAssistantResponse: (text, options = {}) => ({ text, ...options }),
  });
  for (const value of ['1.2.3 + 4', '2..5', '.', '1 / 0']) assert.equal(calculate(value).isError, true, value);
  for (const [value, expected] of [['.5 + .5', '1'], ['2. * 3', '6'], ['(2+3)*4', '20'], ['-40 + 4', '-36']]) {
    assert.equal(calculate(value).text, `The answer is ${expected}.`);
  }
});
test('unit labels preserve SI abbreviations and irregular plurals', () => {
  const code = source.slice(source.indexOf('const UNIT_CONVERSIONS ='), source.indexOf('let assistantRequestGeneration ='));
  const context = vm.createContext({}); vm.runInContext(code, context);
  for (const unit of ['m', 'km', 'g', 'kg', 'ml', 'l', 'lb', 'oz']) {
    assert.equal(vm.runInContext(`formatUnitLabel(2000, '${unit}')`, context), unit);
  }
  assert.equal(vm.runInContext("formatUnitLabel(2,'foot')", context), 'feet');
  assert.equal(vm.runInContext("convertUnit(2,'kg','m')", context), null);
});
test('city-time questions select the location and leave time-complexity queries alone', () => {
  const code = source.slice(source.indexOf('const assistantSkills ='), source.indexOf('async function executeAssistantSkill('));
  const context = vm.createContext({ priorityCommands: [] }); vm.runInContext(code, context);
  for (const value of ['what time is it in Tokyo?', 'what is the time in Tokyo', "what's the time for Tokyo"]) {
    context.input = value;
    assert.equal(vm.runInContext('matchAssistantSkill(input).context.kind', context), 'location');
  }
  assert.equal(vm.runInContext("matchAssistantSkill('what is the time complexity of sorting')", context), null);
});
