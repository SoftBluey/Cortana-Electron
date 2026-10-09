const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');
const gifClass = source.slice(source.indexOf('class GifRenderer {'), source.indexOf('class AnimationManager {'));
function renderer() {
  const timers = [];
  const context = vm.createContext({
    visualsActive: true, setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {}, parseHexColor: () => ({ r: 255, g: 128, b: 0 }),
  });
  vm.runInContext(gifClass + ';globalThis.GifRenderer = GifRenderer;', context);
  const canvas = { getContext: () => ({ putImageData: value => { canvas.rendered = [...value.data]; } }) };
  const result = new context.GifRenderer(canvas);
  result._imageData = { data: new Uint8ClampedArray(8) };
  result.frames = [{ data: new Uint8Array([0, 128]), delay: 90 }, { data: new Uint8Array([255, 10]), delay: 30 }];
  return { result, context, canvas, timers };
}
test('hidden/unfocused animation schedules no timer and resumes its existing frame', () => {
  const { result, timers } = renderer(); result.active = false;
  result.start(true); assert.equal(timers.length, 0); assert.equal(result.currentIndex, 0);
  result.active = true; result._tick(); assert.equal(timers.length, 1); assert.equal(result.currentIndex, 1);
});
test('GIF timing uses the displayed frame delay, preserving animation speed', () => {
  const { result, timers } = renderer(); result.start(true); assert.equal(timers[0].delay, 90);
  timers[0].callback(); assert.equal(timers[1].delay, 30);
});
test('monochrome palette retains tint and transparency', () => {
  const { result, canvas } = renderer(); result.setThemeColor('#ff8000'); result._renderFrame(0);
  assert.deepEqual(canvas.rendered, [0, 0, 0, 0, 128, 64, 0, 255]);
});
test('static single-frame GIF finishes without an endless idle loop', () => {
  const { result, timers } = renderer(); result.frames = [result.frames[0]];
  result.start(true); assert.equal(result.running, false); assert.equal(timers.length, 0);
});

test('one-shot holds its final frame and can resume after losing focus there', () => {
  const { result, timers } = renderer(); let completed = 0;
  result.playOneShot(() => completed++);
  timers[0].callback();
  assert.equal(completed, 0);
  assert.equal(timers[1].delay, 30);
  result.active = false; timers[1].callback();
  assert.equal(completed, 0);
  result.active = true; result._tick();
  assert.equal(completed, 1);
  assert.equal(result.running, false);
});

function manager() {
  const pending = [], playback = [];
  class FakeRenderer {
    load(file) { return new Promise(resolve => pending.push({ file, resolve })); }
    stop() {}
    start() { playback.push('loop'); }
    playOneShot(callback) { playback.push(callback); }
  }
  const definitions = source.slice(source.indexOf('const AnimationState ='), source.indexOf('function parseHexColor'));
  const managerClass = source.slice(source.indexOf('class AnimationManager {'), source.indexOf('// ===================== END ANIMATION'));
  const context = vm.createContext({ GifRenderer: FakeRenderer, path: require('node:path'), appRoot: '.', console });
  vm.runInContext(definitions + managerClass + ';globalThis.Manager = AnimationManager; globalThis.states = AnimationState;', context);
  return { result: new context.Manager({}), states: context.states, pending, playback };
}

test('special animation cannot replace a newer request when its load finishes late', async () => {
  const { result, states, pending, playback } = manager();
  const special = result.playSpecial(0);
  const listening = result.goToState(states.LISTENING);
  pending[1].resolve(); await listening;
  pending[0].resolve(); await special;
  assert.deepEqual(playback, ['loop']);
  assert.equal(result.state, states.LISTENING);
});

test('stale special completion cannot start a loop after the state has changed', async () => {
  const { result, states, pending, playback } = manager();
  const special = result.playSpecial(0); pending[0].resolve(); await special;
  const complete = playback[0];
  const thinking = result.goToState(states.THINKING); pending[1].resolve(); await thinking;
  await complete();
  assert.equal(pending.length, 2);
  assert.equal(playback.length, 2);
});

test('repeated idle requests preserve the current GIF rather than restarting it', async () => {
  const { result, states, pending } = manager();
  const idle = result.goToState(states.IDLE); pending[0].resolve(); await idle;
  const generation = result._generation;
  await result.goToState(states.IDLE);
  assert.equal(result._generation, generation);
  assert.equal(pending.length, 1);
});

test('initial static GIF cannot overwrite an entrance already in progress', async () => {
  const { result, states, pending, playback } = manager();
  const initial = result.init(); const entrance = result.goToState(states.ENTRANCE);
  pending[1].resolve(); await entrance; pending[0].resolve(); await initial;
  assert.equal(result.state, states.ENTRANCE);
  assert.equal(playback.length, 1);
  assert.equal(typeof playback[0], 'function');
});
test('offline weather gives useful feedback without starting a network request', async () => {
  const weather = source.slice(source.indexOf('async function getWeather('), source.indexOf('function getWeatherDescription('));
  let requests = 0, message = '';
  await vm.runInNewContext(weather + ';getWeather("Chicago");', {
    assistantRequestGeneration: 0,
    navigator: { onLine: false }, fetch: () => { requests++; }, onActionFinished() {},
    displayAndSpeak: value => { message = value; },
  });
  assert.equal(requests, 0); assert.match(message, /internet connection/);
});
