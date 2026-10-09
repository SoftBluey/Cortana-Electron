window.onerror = (msg, src, line, col, err) => {
    console.error('[renderer] Uncaught:', msg, src, line, err && err.stack);
};

let searchBar, searchIcon, searchPanel, micBtn, micIcon;
let animationContainer, gifDisplay, resultsDisplay, contentWrapper;
let webLinkContainer, webLink, webIcon;
let appContainer;
let finishSpeakingTimeout = null;
let editingReminderId = null;
let editingReminderSound = null;
let selectedPanelIndex = -1;
let allPanelItems = [];

let reminderContainer, reminderTextInput, reminderTimeInput, reminderSoundInput, reminderSaveBtn, reminderCancelBtn, reminderSoundBrowseBtn;

let settingsContainer, settingsBtn, settingsBackBtn, voiceSelect, startupToggle, startupWarning, voiceWarning, searchEngineSelect, themeColorPicker, movableToggle, pitchSlider, rateSlider, resetVoiceBtn, resetReminderSoundBtn, resetThemeBtn, resetAllBtn, reminderSoundSettingInput, reminderSoundBrowseSettingBtn, reminderSoundResetSettingBtn;
let evaVoiceContainer, evaVoiceStatus, installEvaVoiceBtn;
let ttsEngineSelect, edgeVoiceSelect, edgeVoiceContainer;
let timeFormatSelect;
let weatherUnitsSelect;
let idleGreetingModeSelect, specificGreetingContainer, specificGreetingSelect, customGreetingContainer, customGreetingInput;
let customActionFormContainer, customActionTriggerInput, customActionSaveBtn, customActionCancelBtn, customActionsList, addCustomActionBtn, actionSequenceList, actionSequenceWarning;
let aiToggle, openaiApiKeyInput, openaiApiKeyContainer;
let aiModelInput, aiApiUrlInput, aiSystemPromptInput, aiPresetSelect, aiCustomFields, aiModelItem, aiApiUrlItem;
let useAccentToggle;
let heyCortanaToggle;
let speechDeviceEl, speechStatusEl, speechLastEventEl, speechErrorLogEl;
const speechDiagnostics = { status: 'Idle', lastEvent: 'None', errors: [] };

let _stopSpeechFromOutside = null;

let availableVoices = [];
let customActions = [];
let currentVoice = null;
let editingActionIndex = null;
let preferredVoiceName = "Microsoft Zira";
let listeningSounds = true;
let currentSearchEngine = "bing";
let isMovableMode = false;
let themeColor = "#0078d7";
let useWindowsAccent = false;
let pitch = 1;
let rate = 1;
let ttsEngine = "edge";
let edgeVoice = "en-US-JennyNeural";
let edgeVoices = [];
let timeFormat = "12";
let weatherUnits = 'metric';
let searchResultsActive = false;
let aiEnabled = false;
let aiSystemPrompt = '';
let aiModel = '';
let aiApiUrl = '';
let idleGreetingMode = 'random';
let specificIdleGreeting = "What's on your mind?";
let customIdleGreeting = '';
let reminderSound = "notify.wav";
let useEverythingSearch = false;
let heyCortanaEnabled = false;
let everythingPort = 80;
let blurCleanupTimer = null;
let suppressThemeInput = false;
let wakeTriggered = false;

let activeTimerId = null;
let timerCountdownInterval = null;
let timerEndTime = null;
let timerDuration = null;
let activeTimerLabel = null;
let timerPanelInterval = null;

const appRoot = window.cortana.assetRoot;

const cortanaIcon = path.join(appRoot, 'cortana.png');
const searchIconPng = path.join(appRoot, 'search.png');
const settingsIconPng = path.join(appRoot, 'settings.png');
const closeIconPng = path.join(appRoot, 'close.png');
const bingPng = path.join(appRoot, 'bing.png');
const documentPng = path.join(appRoot, 'document.png');
const micIconPath = path.join(appRoot, 'Microphone.png');
const requestSound = new Audio(path.join(appRoot, 'request.wav'));
const onSound = new Audio(path.join(appRoot, 'on.wav'));
const offSound = new Audio(path.join(appRoot, 'off.wav'));
const errorSound = new Audio(path.join(appRoot, 'error.wav'));
const drumrollSound = new Audio(path.join(appRoot, 'drumroll.mp3'));

function playListeningSound(sound) {
    if (!listeningSounds) return;
    sound.currentTime = 0;
    sound.play().catch(() => {});
}

let isBusy = false;
let micBtnBusy = false;
let lastQuery = '';
let anim = null;
let notebookAnim = null;
let windowVisible = !document.hidden;
let windowFocused = true;
let visualsActive = true;
function refreshVisualActivity() {
    const visible = windowVisible && windowFocused && !document.hidden;
    visualsActive = visible &&
        !settingsContainer?.classList.contains('visible') && !document.getElementById('notebook-sidebar')?.classList.contains('visible');
    for (const [renderer, active] of [[anim?.renderer, visualsActive], [notebookAnim?.renderer,
        visible && document.getElementById('notebook-sidebar')?.classList.contains('visible') &&
        !document.getElementById('notebook-intro')?.hidden]]) {
        if (!renderer) continue;
        renderer.active = active;
        if (!active) { clearTimeout(renderer.timer); renderer.timer = null; renderer._nextFrameAt = null; }
        else if (renderer.running && !renderer.timer) renderer._tick();
    }
}
ipcRenderer.on('window-visibility', (_event, visible) => { windowVisible = visible; refreshVisualActivity(); });
ipcRenderer.on('window-focus', (_event, focused) => { windowFocused = focused; refreshVisualActivity(); });
document.addEventListener('visibilitychange', refreshVisualActivity);

// ===================== ANIMATION STATE MACHINE =====================
const AnimationState = Object.freeze({
  IDLE: 'idle',
  ENTRANCE: 'entrance',
  RESUME: 'resume',
  TRANSITION_TO_IDLE: 'transition_to_idle',
  LISTENING_BEGIN: 'listening_begin',
  LISTENING: 'listening',
  LISTENING_END: 'listening_end',
  SPEAKING_BEGIN: 'speaking_begin',
  SPEAKING: 'speaking',
  SPEAKING_END: 'speaking_end',
  THINKING: 'thinking',
  ERROR: 'error',
  HOP: 'hop',
  BOW: 'bow',
  STATIC: 'static',
});

const ANIMATION_FILES = {
  [AnimationState.ENTRANCE]: 'circle_entrance.gif',
  [AnimationState.RESUME]: 'cortana_resume.gif',
  [AnimationState.TRANSITION_TO_IDLE]: 'circle_transition_idle.gif',
  [AnimationState.LISTENING_BEGIN]: 'circle_begin_listen.gif',
  [AnimationState.LISTENING]: 'circle_listening.gif',
  [AnimationState.LISTENING_END]: 'circle_listen_end.gif',
  [AnimationState.SPEAKING_BEGIN]: 'circle_begin_speaking.gif',
  [AnimationState.SPEAKING]: 'circle_speaking.gif',
  [AnimationState.SPEAKING_END]: 'circle_speaking_end.gif',
  [AnimationState.THINKING]: 'circle_spin.gif',
  [AnimationState.ERROR]: 'circle_error.gif',
  [AnimationState.HOP]: 'circle_hop.gif',
  [AnimationState.BOW]: 'circle_bow.gif',
  [AnimationState.STATIC]: 'circle_static.gif',
  idle_start: 'circle_idle_start.gif',
  idle_mid: 'circle_idle_mid.gif',
  idle_end: 'circle_idle_end.gif',
};

const SPECIAL_ANIMATIONS = [
  { name: 'Birthday', start: 'bday_start.gif', loop: 'bday_static.gif' },
  { name: 'Clippy', start: 'clippy_start.gif', loop: 'clippy_static.gif' },
  { name: 'Clippy Retired', start: 'clippy_retired_start.gif', loop: 'clippy_retired_static.gif' },
  { name: 'Halloween', start: 'halloween_start.gif', loop: 'halloween_static.gif' },
  { name: 'Harry Potter', start: 'harrypotter_start.gif', loop: 'harrypotter_static.gif' },
  { name: 'Lightbulb', start: 'lightbulb_start.gif', loop: 'lightbulb_static.gif' },
  { name: 'Lock', start: 'lock_start.gif', loop: 'lock_static.gif' },
  { name: 'Marriage', start: 'marriage_start.gif', loop: 'marriage_static.gif' },
  { name: 'Minions', start: 'minions_start.gif', loop: 'minions_static.gif' },
  { name: 'Record', start: 'record_start.gif', loop: 'record_loop.gif' },
  { name: 'Rocket', start: 'rocket_start.gif', loop: 'rocket_loop.gif' },
  { name: 'Space', start: 'space_start.gif', loop: 'space_static.gif' },
  { name: 'Star Wars', start: 'starwars_start.gif', loop: 'starwars_static.gif' },
  { name: 'Trophy', start: 'trophy_start.gif', loop: 'trophy_static.gif' },
];

const CHROMA_KEY_THRESHOLD = 10;

function parseHexColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function getLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function getReadableTextColor(hex) {
  const { r, g, b } = parseHexColor(hex);
  const lum = getLuminance(r, g, b);
  const MIN_LUM = 130;

  if (lum >= MIN_LUM) return hex;

  const alpha = (255 - MIN_LUM) / (255 - lum);
  const nr = Math.round(r * alpha + 255 * (1 - alpha));
  const ng = Math.round(g * alpha + 255 * (1 - alpha));
  const nb = Math.round(b * alpha + 255 * (1 - alpha));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

const gifCache = new Map();
const pendingGifs = new Map();
const GIF_CACHE_MAX = 20;
const GIF_CACHE_BYTES = 96 * 1024 * 1024;
function animationHeight() { return Math.round(200 * Math.min(2, window.devicePixelRatio || 1)); }
async function loadAnimation(filename) {
  const height = animationHeight(), key = `${filename}:${height}`;
  if (gifCache.has(key)) {
    const cached = gifCache.get(key); gifCache.delete(key); gifCache.set(key, cached);
    return cached;
  }
  if (pendingGifs.has(key)) return pendingGifs.get(key);
  const pending = window.cortana.decodeAnimation(filename, height).then(decoded => {
    const bytes = decoded.frames.reduce((total, frame) => total + frame.data.byteLength + (frame.alpha?.byteLength || 0), 0);
    let cachedBytes = [...gifCache.values()].reduce((total, entry) => total + entry.bytes, 0);
    while (gifCache.size && (gifCache.size >= GIF_CACHE_MAX || cachedBytes + bytes > GIF_CACHE_BYTES)) {
      const oldest = gifCache.keys().next().value;
      cachedBytes -= gifCache.get(oldest).bytes; gifCache.delete(oldest);
    }
    const entry = { ...decoded, bytes };
    if (bytes <= GIF_CACHE_BYTES) gifCache.set(key, entry);
    return entry;
  }).finally(() => pendingGifs.delete(key));
  pendingGifs.set(key, pending);
  return pending;
}

// Main supplies only presentation preferences, before the first greeting can paint.
const initialPresentation = window.cortana.presentation || {};
if (/^#[\da-f]{6}$/i.test(initialPresentation.themeColor || '')) themeColor = initialPresentation.themeColor;
useWindowsAccent = initialPresentation.useWindowsAccent === true;
idleGreetingMode = initialPresentation.idleGreetingMode || idleGreetingMode;
specificIdleGreeting = initialPresentation.specificIdleGreeting || specificIdleGreeting;
customIdleGreeting = initialPresentation.customIdleGreeting || '';
document.documentElement.style.setProperty('--primary-color', themeColor);
document.documentElement.style.setProperty('--text-color', getReadableTextColor(themeColor));
function prefetchAnimation(filename) {
  if (filename) loadAnimation(filename).catch(error => console.warn('Animation prefetch failed:', error.message));
}
const NEXT_ANIMATION_STATES = {
  [AnimationState.ENTRANCE]: AnimationState.TRANSITION_TO_IDLE,
  [AnimationState.RESUME]: AnimationState.TRANSITION_TO_IDLE,
  [AnimationState.TRANSITION_TO_IDLE]: AnimationState.IDLE,
  [AnimationState.LISTENING_BEGIN]: AnimationState.LISTENING,
  [AnimationState.LISTENING_END]: AnimationState.TRANSITION_TO_IDLE,
  [AnimationState.SPEAKING_BEGIN]: AnimationState.SPEAKING,
  [AnimationState.SPEAKING_END]: AnimationState.TRANSITION_TO_IDLE,
  [AnimationState.ERROR]: AnimationState.TRANSITION_TO_IDLE,
  [AnimationState.HOP]: AnimationState.TRANSITION_TO_IDLE,
  [AnimationState.BOW]: AnimationState.TRANSITION_TO_IDLE,
};

class GifRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.frames = [];
    this.currentIndex = 0;
    this.timer = null;
    this.running = false;
    this.loops = 0;
    this.maxLoops = 0;
    this.onComplete = null;
    this.onLoop = null;
    this.themeColor = { r: 0, g: 120, b: 215 };
    this.gifWidth = 0;
    this.gifHeight = 0;
    this._imageData = null;
  }

  async load(filePath) {
    const generation = this._loadGeneration = (this._loadGeneration || 0) + 1;
    const filename = path.basename(filePath);
    const decoded = await loadAnimation(filename);
    if (generation !== this._loadGeneration) return;
    this.stop(); this._lastFrame = null;
    this.frames = decoded.frames; this.gifWidth = decoded.gifWidth; this.gifHeight = decoded.gifHeight;
    if (this.canvas.width !== this.gifWidth || this.canvas.height !== this.gifHeight) {
      this.canvas.width = this.gifWidth; this.canvas.height = this.gifHeight;
      this._imageData = null;
    }
    this._imageData ||= this.ctx.createImageData(this.gifWidth, this.gifHeight);
    this.currentIndex = 0;
    this.loops = 0;
  }

  start(loop = true) {
    const savedOnComplete = this.onComplete;
    this.stop();
    this.onComplete = savedOnComplete;
    this.running = true;
    this.currentIndex = 0;
    this.loops = 0;
    this.maxLoops = loop ? Infinity : 1;
    this._nextFrameAt = null;
    this._tick();
  }

  playOneShot(onComplete) {
    this.onComplete = onComplete;
    this.start(false);
  }

  stop() {
    this.running = false;
    this._finishing = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.onComplete = null;
  }

  _tick() {
    this.timer = null;
    if (!this.running || this.active === false || this.frames.length === 0) return;
    if (this._finishing) {
      this.running = false;
      this._finishing = false;
      const cb = this.onComplete;
      this.onComplete = null;
      if (cb) cb();
      return;
    }
    const now = performance.now();
    const delay = this.frames[this.currentIndex].delay;
    // Carry small timer lateness forward without adding render time to every frame.
    // After a long stall or a hidden window, resume gently rather than racing old frames.
    if (this._nextFrameAt == null || now - this._nextFrameAt > delay) this._nextFrameAt = now;
    this._nextFrameAt += delay;
    this._renderFrame(this.currentIndex);
    if (this.frames.length === 1 && this.maxLoops === Infinity) { this.running = false; return; }

    this.currentIndex++;

    if (this.currentIndex >= this.frames.length) {
      this.loops++;
      if (this.loops >= this.maxLoops) {
        // Hold the last frame for its authored duration before changing GIFs.
        this._finishing = true;
        this.timer = setTimeout(() => this._tick(), Math.max(0, this._nextFrameAt - performance.now()));
        return;
      }
      this.currentIndex = 0;
      if (this.onLoop) this.onLoop();
    }

    this.timer = setTimeout(() => this._tick(), Math.max(0, this._nextFrameAt - performance.now()));
  }

  _renderFrame(index) {
    const frame = this.frames[index];
    if (!frame) return;

    const imageData = this._imageData;
    const pxData = frame.data;
    const { r, g, b } = this.themeColor;
    const colorKey = `${r},${g},${b}`;
    if (this._lastFrame === pxData && this._lastColor === colorKey) return;
    if (this._paletteKey !== colorKey) {
      this._palette = new Uint32Array(256);
      for (let value = 1; value < 256; value++) {
        const intensity = value / 255;
        this._palette[value] = (255 << 24) | (Math.round(b * intensity) << 16) |
          (Math.round(g * intensity) << 8) | Math.round(r * intensity);
      }
      this._paletteKey = colorKey;
    }
    const rgba = new Uint32Array(imageData.data.buffer);
    for (let i = 0; i < pxData.length; i++) {
      rgba[i] = frame.alpha ? (this._palette[pxData[i]] & 0xffffff) | (frame.alpha[i] << 24) : this._palette[pxData[i]];
    }
    this.ctx.putImageData(imageData, 0, 0);
    this._lastFrame = pxData;
    this._lastColor = colorKey;
  }

  setThemeColor(hex) {
    this.themeColor = parseHexColor(hex);
    if (this.frames.length > 0) {
      this._renderFrame(this._finishing ? this.frames.length - 1 : this.currentIndex % this.frames.length);
    }
  }

  get loaded() {
    return this.frames.length > 0;
  }
}

class AnimationManager {
  constructor(canvasElement) {
    this.renderer = new GifRenderer(canvasElement);
    this.state = null;
    this.queue = [];
    this._pendingNext = null;
    this._idleCycleIndex = 0;
    this._idlePlaying = false;
    this._destroyed = false;
    this._generation = 0;

    this._isPlayingSpecial = false;
    this._currentSpecialIndex = -1;
    this._lastSpecialIndex = -1;
  }

  async init() {
    await this.goToState(AnimationState.STATIC);
  }

  async goToState(state, options = {}) {
    if (this._destroyed) return;
    if (this.state === state && !this._isPlayingSpecial && !options.nextState &&
        [AnimationState.ENTRANCE, AnimationState.RESUME, AnimationState.IDLE, AnimationState.STATIC, AnimationState.LISTENING,
          AnimationState.SPEAKING, AnimationState.THINKING].includes(state)) return;

    this.queue = [];
    this._stopIdleCycle();
    this._stopSpecial();
    await this._playState(state, options);
  }

  queueAnimation(state) {
    if (this._destroyed) return;
    this.queue.push(state);
  }

  setThemeColor(hex) {
    this.renderer.setThemeColor(hex);

    const textColor = getReadableTextColor(hex);
    document.documentElement.style.setProperty('--text-color', textColor);
  }

  destroy() {
    this._destroyed = true;
    ++this._generation;
    this.renderer.stop();
    this._stopIdleCycle();
    this.queue = [];
  }

  async _playState(state, options = {}) {
    const generation = ++this._generation;
    if (this._destroyed) return;

    this.state = state;
    const completingState = state;
    this._pendingNext = options.nextState || null;

    if (state === AnimationState.IDLE) {
      await this._startIdleCycle();
      return;
    }

    const file = ANIMATION_FILES[state];
    if (!file) {
      console.warn(`No animation file for state: ${state}`);
      return;
    }

    try {
      await this.renderer.load(path.join(appRoot, file));
    } catch (e) {
      console.warn(`Failed to load animation file ${file}:`, e && e.message);
      return;
    }
    if (generation !== this._generation) return;
    const next = options.nextState || NEXT_ANIMATION_STATES[state];
    prefetchAnimation(next === AnimationState.IDLE ? ANIMATION_FILES.idle_mid : ANIMATION_FILES[next]);

    const isLooping = (
      state === AnimationState.LISTENING ||
      state === AnimationState.SPEAKING ||
      state === AnimationState.THINKING
    );

    if (state === AnimationState.STATIC || isLooping) {
      this.renderer.start(true);
    } else {
      this.renderer.playOneShot(() => {
        if (generation !== this._generation) return;
        this._onAnimationEnd(completingState);
      });
    }
  }

  async _onAnimationEnd(completingState) {
    if (this._destroyed) return;

    if (this.queue.length > 0) {
      const next = this.queue.shift();
      await this._playState(next);
      return;
    }

    if (this._pendingNext) {
      const next = this._pendingNext;
      this._pendingNext = null;
      await this._playState(next);
      return;
    }

    // Use completingState (the state we were playing) not this.state
    // (which may have been updated by a concurrent goToState call)
    const next = NEXT_ANIMATION_STATES[completingState];
    if (next) {
      await this._playState(next);
    }
  }

  async _startIdleCycle() {
    const generation = ++this._generation;
    this._idlePlaying = true;
    this._idleCycleIndex = 1;
    await this._playIdleFrame();
    prefetchAnimation(ANIMATION_FILES[AnimationState.RESUME]);
  }

  async _playIdleFrame() {
    const generation = this._generation;
    if (this._destroyed || !this._idlePlaying) return;

    const files = ['idle_start', 'idle_mid', 'idle_end'];
    const key = files[this._idleCycleIndex];
    const file = ANIMATION_FILES[key];

    if (!file) {
      this._idleCycleIndex = (this._idleCycleIndex + 1) % files.length;
      await this._playIdleFrame();
      return;
    }

    await this.renderer.load(path.join(appRoot, file));
    if (generation !== this._generation) return;
    prefetchAnimation(ANIMATION_FILES[files[(this._idleCycleIndex + 1) % files.length]]);
    this.renderer.playOneShot(() => {
      if (this._destroyed || !this._idlePlaying) return;
      if (this._generation !== generation) return;
      this._idleCycleIndex = (this._idleCycleIndex + 1) % files.length;
      this._playIdleFrame();
    });
  }

  _stopIdleCycle() {
    this._idlePlaying = false;
  }

  pickSpecial() {
    const count = SPECIAL_ANIMATIONS.length;
    if (count === 0) return -1;
    let id;
    do {
      id = Math.floor(Math.random() * count);
    } while (id === this._lastSpecialIndex && count > 1);
    this._lastSpecialIndex = id;
    return id;
  }

  async playSpecial(id) {
    if (this._destroyed || id < 0 || id >= SPECIAL_ANIMATIONS.length) return;
    const generation = ++this._generation;
    this.queue = [];
    this._pendingNext = null;
    this._stopIdleCycle();
    this._stopSpecial();
    this._isPlayingSpecial = true;
    this._currentSpecialIndex = id;
    await this._playSpecialStart(generation);
  }

  _stopSpecial() {
    if (this._isPlayingSpecial) {
      this._isPlayingSpecial = false;
      this.renderer.stop();
      this._currentSpecialIndex = -1;
    }
  }

  async _playSpecialStart(generation) {
    const special = SPECIAL_ANIMATIONS[this._currentSpecialIndex];
    await this.renderer.load(path.join(appRoot, special.start));
    if (this._destroyed || generation !== this._generation || !this._isPlayingSpecial) return;
    prefetchAnimation(special.loop);
    this.renderer.playOneShot(() => this._onSpecialStartEnd(generation));
  }

  async _onSpecialStartEnd(generation) {
    if (this._destroyed || !this._isPlayingSpecial || generation !== this._generation) return;
    await this._playSpecialLoop(generation);
  }

  async _playSpecialLoop(generation) {
    const special = SPECIAL_ANIMATIONS[this._currentSpecialIndex];
    await this.renderer.load(path.join(appRoot, special.loop));
    if (this._destroyed || generation !== this._generation || !this._isPlayingSpecial) return;
    this.renderer.start(true);
  }
}
// ===================== END ANIMATION STATE MACHINE =====================

const WINDOWS_SETTINGS = [
  { name: 'Display', uri: 'ms-settings:display' },
  { name: 'Sound', uri: 'ms-settings:sound' },
  { name: 'Notifications & actions', uri: 'ms-settings:notifications' },
  { name: 'Focus assist', uri: 'ms-settings:quiethours' },
  { name: 'Power & sleep', uri: 'ms-settings:powersleep' },
  { name: 'Battery', uri: 'ms-settings:battery' },
  { name: 'Storage', uri: 'ms-settings:storagesense' },
  { name: 'Tablet mode', uri: 'ms-settings:tabletmode' },
  { name: 'Multitasking', uri: 'ms-settings:multitasking' },
  { name: 'Clipboard', uri: 'ms-settings:clipboard' },
  { name: 'Bluetooth & other devices', uri: 'ms-settings:bluetooth' },
  { name: 'Printers & scanners', uri: 'ms-settings:printers' },
  { name: 'Mouse', uri: 'ms-settings:mousetouchpad' },
  { name: 'Touchpad', uri: 'ms-settings:devices-touchpad' },
  { name: 'Typing', uri: 'ms-settings:typing' },
  { name: 'Pen & Windows Ink', uri: 'ms-settings:pen' },
  { name: 'AutoPlay', uri: 'ms-settings:autoplay' },
  { name: 'USB', uri: 'ms-settings:usb' },
  { name: 'Network & Internet', uri: 'ms-settings:network' },
  { name: 'Wi-Fi', uri: 'ms-settings:network-wifi' },
  { name: 'Ethernet', uri: 'ms-settings:network-ethernet' },
  { name: 'VPN', uri: 'ms-settings:network-vpn' },
  { name: 'Airplane mode', uri: 'ms-settings:network-airplanemode' },
  { name: 'Mobile hotspot', uri: 'ms-settings:network-mobilehotspot' },
  { name: 'Data usage', uri: 'ms-settings:datausage' },
  { name: 'Proxy', uri: 'ms-settings:network-proxy' },
  { name: 'Personalization', uri: 'ms-settings:personalization' },
  { name: 'Background', uri: 'ms-settings:personalization-background' },
  { name: 'Colors', uri: 'ms-settings:personalization-colors' },
  { name: 'Lock screen', uri: 'ms-settings:lockscreen' },
  { name: 'Themes', uri: 'ms-settings:themes' },
  { name: 'Fonts', uri: 'ms-settings:fonts' },
  { name: 'Start', uri: 'ms-settings:personalization-start' },
  { name: 'Taskbar', uri: 'ms-settings:taskbar' },
  { name: 'Apps & features', uri: 'ms-settings:appsfeatures' },
  { name: 'Default apps', uri: 'ms-settings:defaultapps' },
  { name: 'Offline maps', uri: 'ms-settings:maps' },
  { name: 'Video playback', uri: 'ms-settings:videoplayback' },
  { name: 'Accounts', uri: 'ms-settings:accounts' },
  { name: 'Your info', uri: 'ms-settings:yourinfo' },
  { name: 'Email & app accounts', uri: 'ms-settings:emailandaccounts' },
  { name: 'Sign-in options', uri: 'ms-settings:signinoptions' },
  { name: 'Work access', uri: 'ms-settings:workplace' },
  { name: 'Family & other people', uri: 'ms-settings:otherusers' },
  { name: 'Date & time', uri: 'ms-settings:dateandtime' },
  { name: 'Region & language', uri: 'ms-settings:regionlanguage' },
  { name: 'Speech', uri: 'ms-settings:speech' },
  { name: 'Game bar', uri: 'ms-settings:gaming-gamebar' },
  { name: 'Captures', uri: 'ms-settings:gaming-gamedvr' },
  { name: 'Game Mode', uri: 'ms-settings:gaming-gamemode' },
  { name: 'Ease of Access', uri: 'ms-settings:easeofaccess' },
  { name: 'Narrator', uri: 'ms-settings:easeofaccess-narrator' },
  { name: 'Magnifier', uri: 'ms-settings:easeofaccess-magnifier' },
  { name: 'High contrast', uri: 'ms-settings:easeofaccess-highcontrast' },
  { name: 'Closed captions', uri: 'ms-settings:easeofaccess-closedcaptioning' },
  { name: 'Keyboard', uri: 'ms-settings:easeofaccess-keyboard' },
  { name: 'Cortana', uri: 'ms-settings:cortana' },
  { name: 'Search', uri: 'ms-settings:search' },
  { name: 'Privacy', uri: 'ms-settings:privacy' },
  { name: 'Update & Security', uri: 'ms-settings:windowsupdate' },
  { name: 'Windows Update', uri: 'ms-settings:windowsupdate' },
  { name: 'Backup', uri: 'ms-settings:backup' },
  { name: 'Troubleshoot', uri: 'ms-settings:troubleshoot' },
  { name: 'Recovery', uri: 'ms-settings:recovery' },
  { name: 'About', uri: 'ms-settings:about' },
];

const morningMessages = [
    "Good morning!",
    "Hello there.",
    "Hi there!",
    "Hey. What can I do for you?",
    "How can I help?",
    "What's on your mind?",
];

const afternoonMessages = [
    "Hi there!",
    "Hello!",
    "Hey there.",
    "How can I help?",
    "Need anything?",
    "What can I help you with?",
    "What's up?",
];

const eveningMessages = [
    "Good evening.",
    "Hello there.",
    "Hi!",
    "Hey. What can I do for you?",
    "How can I help?",
    "Need anything?",
];

const nightMessages = [
    "Hello.",
    "Hi there!",
    "How can I help?",
    "What's on your mind?",
    "Still up? What can I do for you?",
];

const idleMessages = [
    "Hello there.",
    "Hello!",
    "Hello. What can I do for you?",
    "Hey there.",
    "Hey. What can I do for you?",
    "Hi there!",
    "Hi!",
    "Hi! How can I help?",
    "Hi! What's up?",
    "Hi. What's on your mind?",
    "Greetings!",
    "Oh hey!",
    "Anything I can do for you?",
    "Anything I can get started?",
    "Can I be of assistance?",
    "How can I help?",
    "Need anything?",
    "Need something?",
    "Something I can do for you?",
    "What can I help you with?",
    "What would you like me to do?",
    "What's on your mind?",
    "What's up?",
    "Ask me anything.",
    "I'm Cortana! I can help with your day.",
];

function getIdleMessage() {
    switch (idleGreetingMode) {
        case 'specific':
            return specificIdleGreeting;
        case 'custom':
            return customIdleGreeting.trim() || "Hello!";
        case 'random':
        default:
            if (notebookData.profile?.name.trim()) return `Hi, ${notebookData.profile.name.trim()}. What can I do for you?`;
            const hour = new Date().getHours();
            let pool;
            if (hour >= 5 && hour < 12) {
                pool = morningMessages;
            } else if (hour >= 12 && hour < 17) {
                pool = afternoonMessages;
            } else if (hour >= 17 && hour < 22) {
                pool = eveningMessages;
            } else {
                pool = nightMessages;
            }
            // Occasionally pull from the general pool for variety (1 in 4 chance)
            if (Math.random() < 0.25) pool = idleMessages;
            return pool[Math.floor(Math.random() * pool.length)];
    }
}

const jokes = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "I told my wife she should embrace her mistakes. She gave me a hug.",
    "Why did the scarecrow win an award? Because he was outstanding in his field!",
    "I'm reading a book on anti-gravity. It's impossible to put down!",
    "What do you call a fake noodle? An Impasta!",
    "Why don't skeletons fight each other? They don't have the guts.",
    "Why did the math book look sad? Because it had too many problems.",
    "Why can't you hear a pterodactyl go to the bathroom? Because the 'P' is silent.",
    "What do you call cheese that isn't yours? Nacho cheese.",
    "Why did the golfer bring two pairs of pants? In case he got a hole in one.",
    "How do you organize a space party? You planet.",
    "Why did the bicycle fall over? Because it was two-tired.",
    "What do you call a fish wearing a bowtie? Sofishticated.",
    "What did the zero say to the eight? Nice belt!",
    "Where do you learn to make ice cream? Sundae school.",
    "How does a penguin build its house? Igloos it together.",
    "I used to be a baker, but I couldn't make enough dough.",
    "Why don't eggs tell jokes? They'd crack each other up.",
    "What's a vampire's favorite fruit? A neck-tarine.",
    "What did one wall say to the other? I'll meet you at the corner.",
    "Why did the invisible man turn down the job offer? He couldn't see himself doing it.",
    "What's orange and sounds like a parrot? A carrot.",
    "Did you hear about the restaurant on the moon? Great food, no atmosphere.",
    "What do you call a bear with no teeth? A gummy bear.",
    "Why are pirates called pirates? Because they arrrr!",
    "Why couldn't the bicycle stand up by itself? Because it was two tired.",
    "When does a joke become a dad joke? When it becomes apparent.",
    "I have a joke about construction, but I'm still working on it.",
    "Why do bees have sticky hair? Because they use a honeycomb.",
    "What do you call a sad strawberry? A blueberry.",
    "I don't trust stairs. They're always up to something.",
    "What do you call someone with no body and no nose? Nobody knows.",
    "Why was the stadium so cool? It was full of fans.",
    "What do you call a dog that does magic tricks? A Labracadabrador.",
    "Why don't oysters share their pearls? Because they're shellfish.",
    "I'm on a seafood diet. I see food and I eat it.",
    "What do you call a sleeping bull? A bulldozer.",
    "Why did the student eat his homework? Because the teacher told him it was a piece of cake.",
    "What do you call a fake stone? A shamrock.",
    "Why do mushrooms get invited to all the parties? Because they're fun-guys.",
    "What's the best thing about Switzerland? I don't know, but the flag is a big plus.",
    "Why did the tomato turn red? Because it saw the salad dressing.",
    "What do you call a bear that's stuck in the rain? A drizzly bear.",
    "Why don't some couples go to the gym? Because some relationships don't work out.",
    "Did you hear about the guy who invented the knock-knock joke? He won the no-bell prize.",
    "What do you call an alligator in a vest? An investigator.",
    "Why do cows have hooves instead of feet? Because they lactose.",
    "What did the ocean say to the beach? Nothing, it just waved.",
    "Why did the picture go to jail? Because it was framed.",
    "What did the grape do when it got stepped on? Nothing, it just let out a little wine.",
    "How do you catch a unique rabbit? Unique up on it.",
    "Why do eggs hate jokes? Because they'd crack up."
];
function getJoke() { return jokes[Math.floor(Math.random() * jokes.length)]; }
const timeZoneAbbreviations = { 'est': 'America/New_York', 'edt': 'America/New_York', 'cst': 'America/Chicago', 'cdt': 'America/Chicago', 'mst': 'America/Denver', 'mdt': 'America/Denver', 'pst': 'America/Los_Angeles', 'pdt': 'America/Los_Angeles', 'gmt': 'Etc/GMT', 'utc': 'Etc/UTC', 'bst': 'Europe/London' };

function applyMovableModeStyles(isMovable) {
    if (isMovable) {
        document.body.classList.add('movable-mode');
    } else {
        document.body.classList.remove('movable-mode');
    }
}

function autoResizeSearchBar() {
    if (!searchBar.value) {
        searchBar.style.height = '';
        return;
    }

    searchBar.style.height = 'auto';
    searchBar.style.height =
        Math.min(searchBar.scrollHeight, 145) + 'px';
}

function clearSearchBar() {
    searchBar.value = '';
    searchBar.style.height = '';
    autoResizeSearchBar();
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
    appContainer = document.getElementById('app-container');
    searchBar = document.getElementById('search-bar');
    searchIcon = document.getElementById('search-icon');
    searchPanel = document.getElementById('search-panel');
    micBtn = document.getElementById('mic-btn');
    micIcon = document.getElementById('mic-icon');
    animationContainer = document.getElementById('animation-container');
    gifDisplay = document.getElementById('circle-canvas');
    resultsDisplay = document.getElementById('results-display');
    contentWrapper = document.getElementById('content-wrapper');
    // First paint must not wait for GIF decoding, voice inventory or diagnostics.
    const initialGreeting = document.createElement('p');
    initialGreeting.className = 'idle-greeting';
    initialGreeting.textContent = getIdleMessage();
    resultsDisplay.replaceChildren(initialGreeting);
    
    const circleCanvas = document.getElementById('circle-canvas');
    anim = new AnimationManager(circleCanvas);
    anim.renderer.active = false;
    anim.setThemeColor(themeColor);
    applyMovableModeStyles(initialPresentation.isMovable === true);

    let cancelWindowClose = null;
    function revealAppContainer() {
        if (cancelWindowClose) cancelWindowClose();
        if (!appContainer.classList.contains('visible')) {
            // Establish the hidden position before starting the existing slide.
            void appContainer.offsetWidth;
            appContainer.classList.add('visible');
        }
        refreshVisualActivity();
    }

    ipcRenderer.on('trigger-enter-animation', (event, { timeSinceHidden }) => {
        if (wakeTriggered) {
            wakeTriggered = false;
            revealAppContainer();
            startSpeechUI();
            return;
        }
        if (speechActive || document.body.classList.contains('slim-mode')) {
            revealAppContainer();
            return;
        }
        closeSettings(true);
        if (notebookPage === 'day') { closeNotebook({ immediate: true }); setStateIdle(); }
        revealAppContainer();
        const state = timeSinceHidden > 5000
            ? AnimationState.ENTRANCE
            : AnimationState.RESUME;
        anim.goToState(state);
    });

    circleCanvas.addEventListener('click', () => {
      if (anim._destroyed) return;
      if (anim._isPlayingSpecial || anim.state === AnimationState.IDLE) {
        const id = anim.pickSpecial();
        if (id >= 0) {
          anim.playSpecial(id);
        }
      }
    });
    
    const updateAvailableDiv = document.getElementById('update-available');
    const updateButton = document.getElementById('update-button');
    const currentVersionSpan = document.getElementById('current-version');

    let displayedVersion = '';
    function renderUpdateStatus({ available, currentVersion, remoteVersion, error }) {
        if (currentVersion) { displayedVersion = currentVersion; currentVersionSpan.textContent = currentVersion; }
        // A version-only startup message must not erase a completed update check.
        if (available === undefined && !error) return;
        updateAvailableDiv.style.display = available ? 'block' : 'none';
        updateButton.disabled = !available;
        const feedback = document.getElementById('update-feedback');
        feedback.textContent = error || (available ? 'Download and install the update from its release page.' :
            remoteVersion === displayedVersion ? 'You have the latest release.' : 'No newer release is available.');
        if (available) updateAvailableDiv.querySelector('.update-message').textContent = 'Version ' + remoteVersion + ' is available.';
    }
    updateButton?.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('open-update-release').catch(() => ({ success: false }));
        if (!result.success) document.getElementById('update-feedback').textContent = result.error || 'Could not open your browser. Try again.';
    });
    const checkButton = document.getElementById('check-updates-button');
    checkButton.onclick = async () => {
        checkButton.disabled = true;
        document.getElementById('update-feedback').textContent = 'Checking for updates...';
        try { renderUpdateStatus(await ipcRenderer.invoke('check-for-updates')); }
        catch (_) { renderUpdateStatus({ available: false, error: 'Could not check for updates. Try again.' }); }
        finally { checkButton.disabled = false; }
    };
    ipcRenderer.on('update-status', (_event, status) => renderUpdateStatus(status));

    webLinkContainer = document.getElementById('web-link-container');
    webLink = document.getElementById('web-link');
    webIcon = document.getElementById('web-icon');

    reminderContainer = document.getElementById('reminder-container');
    reminderTextInput = document.getElementById('reminder-text-input');
    reminderTimeInput = document.getElementById('reminder-time-input');
    reminderSoundInput = document.getElementById('reminder-sound-input'); // May be null initially
    reminderSoundBrowseBtn = document.getElementById('reminder-sound-browse-btn'); // May be null initially
    reminderSaveBtn = document.getElementById('reminder-save-btn');
    reminderCancelBtn = document.getElementById('reminder-cancel-btn');

    settingsContainer = document.getElementById('settings-container');
    settingsBtn = document.getElementById('settings-btn');
    settingsBackBtn = document.getElementById('settings-back-btn');
    reminderSoundSettingInput = document.getElementById('reminder-sound-setting');
    reminderSoundBrowseSettingBtn = document.getElementById('reminder-sound-browse-setting');
    reminderSoundResetSettingBtn = document.getElementById('reminder-sound-reset-setting');
    voiceSelect = document.getElementById('voice-select');
    startupToggle = document.getElementById('startup-toggle');
    startupWarning = document.getElementById('startup-warning');
    voiceWarning = document.getElementById('voice-warning');
    searchEngineSelect = document.getElementById('search-engine-select');
    themeColorPicker = document.getElementById('theme-color-picker');
    useAccentToggle = document.getElementById('use-accent-toggle');
    heyCortanaToggle = document.getElementById('hey-cortana-toggle');
    movableToggle = document.getElementById('movable-toggle');
    pitchSlider = document.getElementById('pitch-slider');
    rateSlider = document.getElementById('rate-slider');
    resetVoiceBtn = document.getElementById('reset-voice-btn');
    resetReminderSoundBtn = document.getElementById('reset-reminder-sound-btn');
    resetThemeBtn = document.getElementById('reset-theme-btn');
    resetAllBtn = document.getElementById('reset-all-btn');
    evaVoiceContainer = document.getElementById('eva-voice-container');
    evaVoiceStatus = document.getElementById('eva-voice-status');
    installEvaVoiceBtn = document.getElementById('install-eva-voice-btn');

    speechDeviceEl = document.getElementById('speech-input-device');
    speechStatusEl = document.getElementById('speech-recognition-status');
    speechLastEventEl = document.getElementById('speech-last-event');
    speechErrorLogEl = document.getElementById('speech-error-log');

    ttsEngineSelect = document.getElementById('tts-engine-select');
    edgeVoiceSelect = document.getElementById('edge-voice-select');
    edgeVoiceContainer = document.getElementById('edge-voice-container');
    timeFormatSelect = document.getElementById('time-format-select');
    weatherUnitsSelect = document.getElementById('weather-units-select');

    idleGreetingModeSelect = document.getElementById('idle-greeting-mode-select');
    specificGreetingContainer = document.getElementById('specific-greeting-container');
    specificGreetingSelect = document.getElementById('specific-greeting-select');
    customGreetingContainer = document.getElementById('custom-greeting-container');
    customGreetingInput = document.getElementById('custom-greeting-input');

    customActionFormContainer = document.getElementById('custom-action-form-container');
    customActionTriggerInput = document.getElementById('custom-action-trigger-input');
    customActionSaveBtn = document.getElementById('custom-action-save-btn');
    customActionCancelBtn = document.getElementById('custom-action-cancel-btn');
    customActionsList = document.getElementById('custom-actions-list');
    addCustomActionBtn = document.getElementById('add-custom-action-btn');
    actionSequenceList = document.getElementById('action-sequence-list');
    actionSequenceWarning = document.getElementById('action-sequence-warning');

    aiToggle = document.getElementById('ai-toggle');
    openaiApiKeyInput = document.getElementById('openai-api-key-input');
    openaiApiKeyContainer = document.getElementById('openai-api-key-container');
    aiModelInput = document.getElementById('ai-model-input');
    aiApiUrlInput = document.getElementById('ai-api-url-input');
    aiSystemPromptInput = document.getElementById('ai-system-prompt-input');
    aiPresetSelect = document.getElementById('ai-preset-select');
    aiCustomFields = document.getElementById('ai-custom-fields');
    aiModelItem = document.getElementById('ai-model-item');
    aiApiUrlItem = document.getElementById('ai-api-url-item');

    document.getElementById('settings-btn-icon').src = settingsIconPng;
    document.getElementById('close-btn-icon').src = closeIconPng;
    searchIcon.src = cortanaIcon;
    micIcon.src = micIconPath;

    new Image().src = drumrollSound.src;

    document.getElementById('close-btn').addEventListener('click', () => {
        if (document.body.classList.contains('slim-mode')) {
            stopSpeechRecognition();
            document.body.classList.remove('slim-mode');
            ipcRenderer.send('close-app');
            return;
        }
        if (searchResultsActive) {
            hideSearchResults();
        } else {
            ipcRenderer.send('close-app');
        }
    });
    
    // Search bar event listeners
    searchBar.addEventListener('input', onSearchInput);
    searchBar.addEventListener('input', autoResizeSearchBar);
    searchBar.addEventListener('keydown', onSearchKeyDown);
    searchBar.addEventListener('blur', () => {
        if (speechActive) {
            // Focus moves to the microphone/navigation controls as recognition
            // starts. A focus notification is not a request to cancel capture.
            return;
        }
        if (!searchPanel.classList.contains('visible')) {
            searchIcon.src = cortanaIcon;
        }
        if (animationContainer.className === 'idle') return;
        blurCleanupTimer = setTimeout(() => {
            hideSearchPanel();
            clearSearchBar();
            searchBar.placeholder = 'Type here to search';
            setStateIdle();
        }, 200);
        playListeningSound(offSound);
    });

    searchBar.addEventListener('focus', () => {
        if (speechActive) return;
        searchIcon.src = searchIconPng;
        if (animationContainer.className === 'active') {
            setStateIdle();
            return;
        }
    });

    let speechActive = false;
    searchBar.addEventListener('pointerdown', () => { if (speechActive) stopSpeechRecognition(); });
    let speechFinal = '';
    let speechShuffleTimer = null;

    function speechShuffle() {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        let s = '';
        const len = 7 + Math.floor(Math.random() * 2); // 7-8 chars
        for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 26)];
        return s;
    }

    function flashMicError() {
        setSpeechDiagnosticStatus('Error');
        micBtn.classList.add('error');
        setTimeout(() => micBtn.classList.remove('error'), 1200);
    }

    function startSpeechUI() {
        document.getElementById('speech-feedback').hidden = true;
        cancelSpeechOutput();
        clearTimeout(finishSpeakingTimeout);
        finishSpeakingTimeout = null;
        requestSound.pause();
        requestSound.currentTime = 0;
        isBusy = false;
        speechActive = true;
        speechFinal = '';
        setSpeechDiagnosticStatus('Listening');
        clearTimeout(blurCleanupTimer);
        micBtn.classList.add('listening');
        anim.goToState(AnimationState.LISTENING_BEGIN);
        playListeningSound(onSound);
        searchBar.placeholder = 'Listening...';
        searchBar.style.color = '#888888';
        searchBar.value = speechShuffle();
        searchBar.placeholder = '';
        hideSearchPanel();
        autoResizeSearchBar();
        speechShuffleTimer = setInterval(() => {
            if (!speechActive) return;
            if (speechFinal) {
                searchBar.style.color = '';
                searchBar.value = speechFinal;
                searchBar.placeholder = speechShuffle();
            } else {
                searchBar.style.color = '#888888';
                searchBar.value = speechShuffle();
                searchBar.placeholder = '';
            }
            autoResizeSearchBar();
        }, 250);
    }

    function startSpeechRecognition() {
        startSpeechUI();
        ipcRenderer.send('speech-start');
    }

    function stopSpeechRecognition() {
        speechActive = false;
        setSpeechDiagnosticStatus('Idle');
        if (speechShuffleTimer) { clearInterval(speechShuffleTimer); speechShuffleTimer = null; }
        searchBar.style.color = '';
        clearSearchBar();
        searchBar.placeholder = 'Type here to search';
        micBtn.classList.remove('listening');
        ipcRenderer.send('speech-stop', 'microphone/user-cancel');
        playListeningSound(offSound);
        if (document.body.classList.contains('slim-mode')) {
            document.body.classList.remove('slim-mode');
            ipcRenderer.send('close-app');
            return;
        }
        setStateIdle();
    }

    _stopSpeechFromOutside = () => {
        if (speechActive) stopSpeechRecognition();
    };

    async function submitVoiceSearch() {
        speechActive = false;
        setSpeechDiagnosticStatus('Idle');
        if (speechShuffleTimer) { clearInterval(speechShuffleTimer); speechShuffleTimer = null; }
        searchBar.style.color = '';
        micBtn.classList.remove('listening');
        ipcRenderer.send('speech-stop', 'query-submit');
        searchBar.placeholder = 'Type here to search';
        document.body.classList.remove('slim-mode');

        const query = speechFinal.trim();
        if (!query) {
            clearSearchBar();
            setStateIdle();
            return;
        }

        clearSearchBar();
        const categories = await generateCategorizedResults(query);
        let topItem = null;
        for (const cat of categories) {
            if (cat.items.length > 0) {
                topItem = cat.items[0];
                break;
            }
        }

        if (topItem) {
            topItem.action();
        } else {
            searchBar.value = query;
            onSearch();
        }
    }

    ipcRenderer.on('speech-result', (event, data) => {
        if (!speechActive) return;
        if (data.final) {
            const fullText = (data.text || '').trim();
            if (!fullText) { submitVoiceSearch(); return; }
            recordSpeechEvent(fullText);
            setSpeechDiagnosticStatus('Recognised');
            const words = fullText.split(/\s+/);
            let wordIndex = 0;
            speechFinal = '';
            searchBar.style.color = '';
            const typeWord = () => {
                if (!speechActive) return;
                if (wordIndex < words.length) {
                    speechFinal += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
                    searchBar.value = speechFinal;
                    searchBar.placeholder = speechShuffle();
                    autoResizeSearchBar();
                    wordIndex++;
                    setTimeout(typeWord, 200);
                } else {
                    setTimeout(() => {
                        if (!speechActive) return;
                        submitVoiceSearch();
                    }, 300);
                }
            };
            typeWord();
        } else {
            speechFinal = (data.text || '').trim();
        }
    });

    ipcRenderer.on('speech-error', (event, message) => {
        if (!speechActive) return;
        recordSpeechError(message || 'Speech error');
        console.error('[speech]', message || 'Speech error');
        stopSpeechRecognition();
        flashMicError();
        document.getElementById('speech-feedback-message').textContent = /timed out|no speech|without a final utterance/i.test(message || '')
            ? "I couldn't hear a complete request. Try again or type your question."
            : 'Speech recognition is unavailable right now. Try again or type your question.';
        document.getElementById('speech-feedback').hidden = false;
    });
    document.getElementById('speech-feedback-dismiss').onclick = () => { document.getElementById('speech-feedback').hidden = true; };
    document.getElementById('speech-feedback-settings').onclick = async () => {
        document.getElementById('speech-feedback').hidden = true;
        await showSettingsUI();
        document.getElementById('recognition-mode-select').scrollIntoView({ block: 'center' });
        document.getElementById('recognition-mode-select').focus();
    };

    micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (settingsContainer.classList.contains('visible')) return;
        if (micBtnBusy) return;
        micBtnBusy = true;
        setTimeout(() => { micBtnBusy = false; }, 300);
        if (speechActive) {
            stopSpeechRecognition();
        } else {
            startSpeechRecognition();
        }
    });

    ipcRenderer.on('activate-assistant', () => { if (!speechActive) startSpeechRecognition(); });

    ipcRenderer.on('wake-slim', () => {
        revealAppContainer();
        wakeTriggered = true;
        if (settingsContainer.classList.contains('visible')) return;
        document.body.classList.add('slim-mode');
        startSpeechUI();
    });

    ipcRenderer.on('wake-listen', () => {
        if (settingsContainer.classList.contains('visible')) return;
        if (document.body.classList.contains('slim-mode')) {
            document.body.classList.remove('slim-mode');
        }
        startSpeechUI();
    });

    ipcRenderer.on('speech-force-stop', () => {
        if (speechActive) {
            speechActive = false;
            if (speechShuffleTimer) { clearInterval(speechShuffleTimer); speechShuffleTimer = null; }
            searchBar.style.color = '';
            clearSearchBar();
            searchBar.placeholder = 'Type here to search';
            micBtn.classList.remove('listening');
        }
        cancelSpeechOutput();
        clearTimeout(finishSpeakingTimeout);
        finishSpeakingTimeout = null;
        requestSound.pause();
        requestSound.currentTime = 0;
        isBusy = false;
        document.body.classList.remove('slim-mode');
        setStateIdle();
    });

    webLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (lastQuery) {
            const url = getSearchUrl(lastQuery);
            ipcRenderer.send('open-external-link', url);
            if (!isMovableMode) {
                ipcRenderer.send('close-app');
            }
        }
    });

    reminderSaveBtn.addEventListener('click', onSaveReminder);
    reminderCancelBtn.addEventListener('click', setStateIdle);
    reminderTextInput.addEventListener('input', updateSaveButtonState);
    reminderTimeInput.addEventListener('input', updateSaveButtonState);

    settingsBtn.addEventListener('click', showSettingsUI);
    settingsBackBtn.addEventListener('click', () => {
        if (customActionFormContainer.classList.contains('visible')) {
            hideCustomActionForm();
        } else {
            closeSettings();
        }
    });
    voiceSelect.addEventListener('change', onVoiceChanged);
    startupToggle.addEventListener('change', onStartupToggleChanged);
    searchEngineSelect.addEventListener('change', onSearchEngineChanged);

    themeColorPicker.addEventListener('input', onThemeColorChanged, false);
    useAccentToggle.addEventListener('change', async () => {
        useWindowsAccent = useAccentToggle.checked;
        saveSetting('useWindowsAccent', useWindowsAccent);
        if (useWindowsAccent) {
            themeColorPicker.disabled = true;
            await fetchAndApplyAccentColor();
        } else {
            themeColorPicker.disabled = false;
            applyThemeColor(themeColor);
        }
    });
    heyCortanaToggle.addEventListener('change', () => {
        heyCortanaEnabled = heyCortanaToggle.checked;
        saveSetting('heyCortana', heyCortanaEnabled);

    });
    movableToggle.addEventListener('change', onMovableToggleChanged);
    pitchSlider.addEventListener('input', onPitchChanged);
    rateSlider.addEventListener('input', onRateChanged);
    ttsEngineSelect.addEventListener('change', onTtsEngineChanged);
    edgeVoiceSelect.addEventListener('change', onEdgeVoiceChanged);
    timeFormatSelect.addEventListener('change', onTimeFormatChanged);
    weatherUnitsSelect?.addEventListener('change', () => {
        weatherUnits = weatherUnitsSelect.value;
        saveSetting('weatherUnits', weatherUnits);
    });
    resetVoiceBtn.addEventListener('click', onResetVoiceSettings);
    resetReminderSoundBtn.addEventListener('click', onResetReminderSound);
    resetThemeBtn.addEventListener('click', onResetThemeColors);
    resetAllBtn.addEventListener('click', onResetAllSettings);
    installEvaVoiceBtn.addEventListener('click', onInstallEvaVoice);
    
    aiToggle.addEventListener('change', onAIChanged);
    openaiApiKeyInput.addEventListener('input', onOpenAIKeyChanged);
    aiModelInput.addEventListener('input', onAIModelChanged);
    aiApiUrlInput.addEventListener('change', onAIApiUrlChanged);
    aiSystemPromptInput.addEventListener('input', onAISystemPromptChanged);
    aiPresetSelect.addEventListener('change', onPresetChanged);

    idleGreetingModeSelect.addEventListener('change', onIdleGreetingModeChanged);
    specificGreetingSelect.addEventListener('change', onSpecificIdleGreetingChanged);
    customGreetingInput.addEventListener('input', onCustomIdleGreetingChanged);

    const everythingToggle = document.getElementById('everything-toggle');
    const everythingPortInput = document.getElementById('everything-port-input');
    let everythingCheckGeneration = 0;
    const checkEverythingConnection = async () => {
        const generation = ++everythingCheckGeneration;
        const warning = document.getElementById('everything-warning');
        warning.textContent = 'Checking Everything...';
        let ok = false;
        try { ok = await ipcRenderer.invoke('check-everything'); } catch (_) {}
        if (generation !== everythingCheckGeneration || !useEverythingSearch) return;
        warning.textContent = ok ? 'Connected to Everything. File searches are ready.' :
            'Could not connect to Everything. Open Everything, enable its HTTP server and check that the port above matches.';
        warning.style.color = ok ? '#a2a2a2' : '#e74c3c';
    };
    everythingToggle.addEventListener('change', async event => {
        useEverythingSearch = event.target.checked;
        document.getElementById('everything-port-container').style.display = useEverythingSearch ? 'block' : 'none';
        everythingCheckGeneration++;
        const result = await saveSetting('useEverythingSearch', useEverythingSearch);
        if (result.success && useEverythingSearch) await checkEverythingConnection();
    });
    everythingPortInput.addEventListener('change', async event => {
        const value = Number(event.target.value);
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
            const warning = document.getElementById('everything-warning');
            warning.textContent = 'Enter a port from 1 to 65535. Your saved port has not changed.'; warning.style.color = '#e74c3c'; return;
        }
        everythingPort = value;
        const result = await saveSetting('everythingPort', value);
        if (result.success && useEverythingSearch) await checkEverythingConnection();
    });

    // Reminder sound setting event listeners
    if (reminderSoundSettingInput) {
        reminderSoundSettingInput.addEventListener('change', (e) => {
            reminderSound = e.target.value;
            saveSetting('reminderSound', e.target.value);
        });
    }
    
    if (reminderSoundBrowseSettingBtn) {
        reminderSoundBrowseSettingBtn.addEventListener('click', () => {
            ipcRenderer.invoke('show-open-dialog', { 
                properties: ['openFile'],
                filters: [{ name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg', 'm4a', 'aac'] }]
            }).then(result => {
                if (!result.canceled && result.filePaths.length > 0) {
                    // Store the full file path to allow custom sounds from anywhere
                    const fullPath = result.filePaths[0];
                    if (reminderSoundSettingInput) {
                        reminderSoundSettingInput.value = fullPath;
                        reminderSound = fullPath;
                        saveSetting('reminderSound', fullPath);
                    }
                }
            });
        });
    }
    
    if (reminderSoundResetSettingBtn) {
        reminderSoundResetSettingBtn.addEventListener('click', () => {
            if (reminderSoundSettingInput) {
                reminderSoundSettingInput.value = "notify.wav";
                reminderSound = "notify.wav";
                saveSetting('reminderSound', "notify.wav");
            }
        });
    }
    
    addCustomActionBtn.addEventListener('click', () => showCustomActionForm());
    customActionSaveBtn.addEventListener('click', onSaveCustomAction);
    customActionCancelBtn.addEventListener('click', hideCustomActionForm);
    document.getElementById('add-action-to-sequence-btn').addEventListener('click', () => {
        const currentActions = getCurrentActionsFromForm();
        const newAction = { type: 'open_app', value: '' };
        renderActionSequenceUI([...currentActions, newAction]);
        actionSequenceList.scrollTop = actionSequenceList.scrollHeight;
    });

    idleMessages.forEach(msg => {
        const option = document.createElement('option');
        option.value = msg;
        option.textContent = msg;
        specificGreetingSelect.appendChild(option);
    });

    ipcRenderer.on('go-idle-and-close', () => {
        if (cancelWindowClose) return;
        if (speechActive) stopSpeechRecognition();

        let fallback;
        const cleanup = () => {
            clearTimeout(fallback);
            appContainer.removeEventListener('transitionend', onTransitionEnd);
            cancelWindowClose = null;
        };
        const finish = () => {
            if (cancelWindowClose !== cleanup) return;
            cleanup();
            if (!appContainer.classList.contains('visible')) {
                ipcRenderer.send('hide-window');
                if (notebookPage === 'day') closeNotebook({ immediate: true });
                setStateIdle();
            }
        };
        const onTransitionEnd = event => {
            if (event.target === appContainer && event.propertyName === 'transform') finish();
        };

        cancelWindowClose = cleanup;
        appContainer.addEventListener('transitionend', onTransitionEnd);
        appContainer.classList.remove('visible');
        // No event is guaranteed when closing before first paint or in movable mode.
        const immediate = document.body.classList.contains('movable-mode') || matchMedia('(prefers-reduced-motion: reduce)').matches;
        fallback = setTimeout(finish, immediate ? 0 : 250);
    });

    ipcRenderer.on('command-failed', (event, { command }) => {
        let errorText = "I couldn't complete that command. Try again.";
        if (command === 'open-application') {
            errorText = "I couldn't open that app. Check that it's still installed.";
        } else if (command === 'run-command') {
            errorText = "I couldn't run that command. Check the command and file paths.";
        }
        displayAndSpeak(errorText, onActionFinished, {}, true);
    });

    ipcRenderer.on('show-settings-ui', showSettingsUI);

    ipcRenderer.on('play-reminder-sound', (event, soundFile) => {
        playReminderSound(soundFile);
    });

    ipcRenderer.on('settings-force-close', () => {
        closeNotebook();
        closeSettings(true);
    });

    ipcRenderer.on('online-speech-status', (event, { enabled }) => {
        const banner = document.getElementById('online-speech-warning');
        if (banner) {
            banner.style.display = enabled ? 'none' : 'flex';
        }
    });

    ipcRenderer.on('accent-color-updated', (event, color) => {
        applyAccentColor(color);
    });

    ipcRenderer.on('timer-fired', (event, { id, label }) => {
        if (document.getElementById('timer-list')) void showTimersPanel({announce:false});
        const display = id===activeTimerId ? document.getElementById('timer-display') : null;
        if(id===activeTimerId) { clearInterval(timerCountdownInterval);timerCountdownInterval=null;activeTimerId=null;timerEndTime=null;timerDuration=null;activeTimerLabel=null; }
        if(display)display.textContent="Time's up!";
        // Always play the chime — this works even when media is playing
        // because we use a short Audio object, not the TTS engine
        const notifyAudio = new Audio(path.join(appRoot, 'notify.wav'));
        notifyAudio.play().catch(() => {});

        // If the app is busy (mid-query) or hidden, the Windows notification
        // (fired in main.js) is enough — do NOT interrupt the current state.
        // Queue a spoken alert for when the app becomes free.
        if (isBusy || document.hidden) {
            // Show a brief text update if the timer display is still on screen
            if (display) {
                display.textContent = "⏰ Time's up!";
            }
            return;
        }

        // App is idle and visible — speak the alert
        setStateActive();
        anim.goToState(AnimationState.SPEAKING_BEGIN);
        speak(label ? `${label}: time's up!` : "Time's up! Your timer has finished.", () => {
            isBusy = false;
            searchBar.disabled = false;
            searchBar.placeholder = 'Type here to search';
            anim.goToState(AnimationState.SPEAKING_END,
                { nextState: AnimationState.TRANSITION_TO_IDLE });
        });
    });

    animationContainer.className = 'idle';
    new ResizeObserver(([entry])=>document.getElementById('app-container').style.setProperty('--search-height', `${entry.target.getBoundingClientRect().height}px`)).observe(document.querySelector('.search-container'));
    await Promise.all([setupNotebookAndSystemControls(), loadAndApplySettings(),
        anim.goToState(AnimationState.ENTRANCE).catch(error => console.warn('Initial orb could not be loaded:', error.message))]);
    setupTTS();
    refreshEvaVoiceStatus();

    // Apply the loaded nickname/greeting preference without a second text entrance.
    if (initialGreeting.isConnected && !isBusy && animationContainer.className === 'idle')
        initialGreeting.textContent = getIdleMessage();

    webLinkContainer.style.display = 'none';
    webLinkContainer.style.opacity = '0';
    searchBar.disabled = false;
    searchBar.placeholder = 'Type here to search';
    isBusy = false;
    searchIcon.src = cortanaIcon;
    window.cortana.rendererReady();
    } catch (e) {
        console.error('Init error:', e);
        ipcRenderer.send('renderer-error', e.message + '\n' + (e.stack || ''));
        window.cortana.rendererReady();
    }
});

// Search panel functionality
const PANEL_ICONS = {
  cortana: 'cortana',
  app: 'app',
  setting: 'setting',
  file: 'file',
  web: 'web',
};

let searchPanelGeneration = 0;
async function onSearchInput(event) {
    const generation=++searchPanelGeneration;
    cancelSpeechOutput();
    const query = searchBar.value.trim();
    if (query.length === 0) {
        hideSearchPanel();
        return;
    }
    const categories = await generateCategorizedResults(query);
    if (generation!==searchPanelGeneration || searchBar.disabled || searchBar.value.trim() !== query) return;
    showSearchPanel(categories);
}

async function generateCategorizedResults(query) {
    const categories = [];
    const lowerQuery = query.toLowerCase();

    const customActionItems = [];
    for (const a of customActions) {
        if (!a.trigger) continue;
        const triggerLower = a.trigger.toLowerCase();
        const matches = lowerQuery === triggerLower || new RegExp(`\\b${triggerLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lowerQuery);
        if (matches && a.actions.length > 0) {
            customActionItems.push({
                type: 'cortana',
                title: a.trigger,
                subtitle: `${a.actions.length} action${a.actions.length > 1 ? 's' : ''}`,
                icon: PANEL_ICONS.cortana,
                action: () => {
                    lastQuery = query;
                    isBusy = true;
                    setStateActive();
                    resultsDisplay.innerHTML = '';
                    requestSound.currentTime = 0;
                    requestSound.play();
                    executeActionSequence(a.actions);
                }
            });
        }
    }
    if (customActionItems.length > 0) {
        categories.push({ name: 'Custom Actions', items: customActionItems });
    }

    const cortanaItems = [];

    const matchedSkill = matchAssistantSkill(query);
    const matchedCommand = commands.find(c => query.match(c.regex));

    if (matchedSkill || matchedCommand) {
        cortanaItems.push({
            type: 'cortana',
            title: `Run "${query}"`,
            subtitle: 'Use a built-in command',
            icon: PANEL_ICONS.cortana,
            action: () => {
                ++assistantRequestGeneration;
                lastQuery = query;
                isBusy = true;
                setStateActive();
                resultsDisplay.innerHTML = '';
                if (matchedSkill) {
                    executeAssistantSkill(matchedSkill);
                } else {
                    matchedCommand.handler(query.match(matchedCommand.regex), query);
                }
            }
        });
    }

    if (navigator.onLine) cortanaItems.push({
        type: 'cortana',
        title: `Search for "${query}"`,
        subtitle: 'Search the web with Cortana',
        icon: PANEL_ICONS.cortana,
        action: () => {
            lastQuery = query;
            isBusy = true;
            setStateActive();
            anim.goToState(AnimationState.THINKING);
            resultsDisplay.innerHTML = '';
            requestSound.currentTime = 0;
            requestSound.play();
            performWebSearch(query);
        }
    });

    if (aiEnabled && (navigator.onLine || isLoopback(aiApiUrl))) {
        cortanaItems.push({
            type: 'cortana',
            title: `Ask AI about "${query}"`,
            subtitle: isLoopback(aiApiUrl) ? 'Use your local AI server' : navigator.onLine ? 'Get an AI-generated answer' : 'Requires internet connection',
            icon: PANEL_ICONS.cortana,
            action: () => {
                lastQuery = query;
                isBusy = true;
                setStateActive();
                anim.goToState(AnimationState.THINKING);
                resultsDisplay.innerHTML = '';
                const p = document.createElement('p');
                p.className = 'fade-in-item';
                p.textContent = 'Thinking...';
                resultsDisplay.appendChild(p);
                requestSound.currentTime = 0;
                requestSound.play();
                requestAIAnswer(query);
            }
        });
    }

    categories.push({ name: 'Cortana', items: cortanaItems });

    const apps = await ipcRenderer.invoke('search-applications', query);
    if (apps.length > 0) {
        categories.push({
            name: 'Apps',
            items: apps.slice(0, 6).map(name => ({
                type: 'app',
                title: name,
                subtitle: 'Start menu',
                icon: PANEL_ICONS.app,
                action: () => {
                    handleOpenApplication(name, true);
                }
            }))
        });
    }

    const matchingSettings = WINDOWS_SETTINGS.filter(s =>
        s.name.toLowerCase().includes(lowerQuery)
    );
    if (matchingSettings.length > 0) {
        categories.push({
            name: 'Settings',
            items: matchingSettings.slice(0, 6).map(s => ({
                type: 'setting',
                title: s.name,
                subtitle: 'Windows setting',
                icon: PANEL_ICONS.setting,
                action: () => {
                    ipcRenderer.send('run-special-command', s.uri);
                }
            }))
        });
    }

    try {
        const files = await ipcRenderer.invoke('search-files', query);
        if (files.length > 0) {
            categories.push({
                name: 'Other',
                items: files.slice(0, 5).map(f => ({
                    type: 'file',
                    title: f.name,
                    subtitle: f.path,
                    icon: PANEL_ICONS.file,
                    action: () => {
                        ipcRenderer.send('open-path', f.path);
                    }
                }))
            });
        }
    } catch (_) {}

    const webSuggestions = (customActionItems.length || matchedSkill || matchedCommand) ? [] : await generateWebSuggestions(query);
    if (webSuggestions.length > 0) {
        categories.push({
            name: 'Web',
            items: webSuggestions.slice(0, 4).map(s => ({
                type: 'web',
                title: s,
                subtitle: 'Search with Cortana',
                icon: PANEL_ICONS.web,
                action: () => {
                    lastQuery = s;
                    isBusy = true;
                    setStateActive();
                    requestSound.currentTime = 0;
                    requestSound.play();
                    performWebSearch(s);
                }
            }))
        });
    }

    return categories;
}

function generateWebSuggestions(query) {
    return navigator.onLine ? ipcRenderer.invoke('search-suggestions', query).catch(()=>[]) : Promise.resolve([]);
}

function showSearchPanel(categories) {
    selectedPanelIndex = -1;
    allPanelItems = [];
    searchPanel.innerHTML = ''; searchPanel.scrollTop = 0;
    micBtn.style.display = 'none';

    let globalIndex = 0;
    categories.forEach((cat, ci) => {
        const header = document.createElement('div');
        header.className = 'search-panel-category';
        header.textContent = cat.name;
        searchPanel.appendChild(header);

        cat.items.forEach((item, ii) => {
            const el = document.createElement('div');
            el.className = 'search-panel-item';
            el.dataset.index = globalIndex;

            const icon = document.createElement('div');
            icon.className = 'search-panel-item-icon';
            if (item.icon === 'cortana' || item.icon === 'web') {
                const img = document.createElement('img');
                img.src = searchIconPng;
                img.style.cssText = 'width:24px;height:24px;';
                icon.appendChild(img);
            } else if (item.icon === 'file') {
                const img = document.createElement('img');
                img.src = documentPng;
                img.style.cssText = 'width:24px;height:24px;';
                icon.appendChild(img);
            } else {
                icon.textContent = getIconChar(item.icon);
            }

            const content = document.createElement('div');
            content.className = 'search-panel-item-content';

            const title = document.createElement('div');
            title.className = 'search-panel-item-title';
            title.textContent = item.title;

            const subtitle = document.createElement('div');
            subtitle.className = 'search-panel-item-subtitle';
            subtitle.textContent = item.subtitle;

            content.appendChild(title);
            content.appendChild(subtitle);
            el.appendChild(icon);
            el.appendChild(content);

            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearTimeout(blurCleanupTimer);
                hideSearchPanel();
                clearSearchBar();
                item.action();
                searchIcon.src = cortanaIcon;
            });

            allPanelItems.push({ el, action: item.action });
            searchPanel.appendChild(el);
            globalIndex++;
        });
    });

    if (allPanelItems.length > 0) {
        searchPanel.inert = false; document.getElementById('app-container').classList.add('search-panel-open');
        searchPanel.classList.add('visible');
        selectedPanelIndex = 0;
        updatePanelSelection();
    } else {
        hideSearchPanel();
    }
}

function getIconChar(type) {
    switch (type) {
        case 'cortana': return '\uD83D\uDD0D';
        case 'app': return '\u25A3';
        case 'setting': return '\u2699';
        case 'file': return '\uD83D\uDCC4';
        case 'web': return '\uD83C\uDF10';
        default: return '\u25CF';
    }
}

function hideSearchPanel() {
    ++searchPanelGeneration;
    searchPanel.inert = true; document.getElementById('app-container').classList.remove('search-panel-open');
    searchPanel.classList.remove('visible');
    allPanelItems = [];
    selectedPanelIndex = -1;
    micBtn.style.display = '';
}

function onSearchKeyDown(event) {
    if (event.isComposing) return;
    if (allPanelItems.length === 0) {
        if (event.key === 'Enter') {
            event.preventDefault();
            onSearch();
        }
        return;
    }

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            selectedPanelIndex = Math.min(selectedPanelIndex + 1, allPanelItems.length - 1);
            updatePanelSelection();
            break;

        case 'ArrowUp':
            event.preventDefault();
            selectedPanelIndex = Math.max(selectedPanelIndex - 1, -1);
            updatePanelSelection();
            break;

        case 'Enter':
            event.preventDefault();
            searchBar.blur();
            clearTimeout(blurCleanupTimer);
            const enterIndex = selectedPanelIndex;
            const enterItems = allPanelItems;
            hideSearchPanel();
            if (enterIndex >= 0 && enterIndex < enterItems.length) {
                clearSearchBar();
                enterItems[enterIndex].action();
                searchIcon.src = cortanaIcon;
            } else {
                onSearch();
            }
            break;

        case 'Escape':
            event.preventDefault();
            hideSearchPanel();
            clearSearchBar();
            searchBar.placeholder = 'Type here to search';
            setStateIdle();
            break;
    }
}

function updatePanelSelection() {
    allPanelItems.forEach((item, index) => {
        if (index === selectedPanelIndex) {
            item.el.classList.add('selected');
            const top=item.el.offsetTop, bottom=top+item.el.offsetHeight;
            if(top<searchPanel.scrollTop)searchPanel.scrollTop=top;
            else if(bottom>searchPanel.scrollTop+searchPanel.clientHeight)searchPanel.scrollTop=bottom-searchPanel.clientHeight;
        } else {
            item.el.classList.remove('selected');
        }
    });
}

function renderSpeechErrors() {
    if (!speechErrorLogEl) return;
    if (speechDiagnostics.errors.length === 0) {
        speechErrorLogEl.textContent = 'None';
        return;
    }
    speechErrorLogEl.innerHTML = '';
    speechDiagnostics.errors.forEach(entry => {
        const p = document.createElement('div');
        p.textContent = entry;
        speechErrorLogEl.appendChild(p);
    });
}

function setSpeechDiagnosticStatus(status) {
    speechDiagnostics.status = status;
    if (speechStatusEl) speechStatusEl.textContent = status;
}

function recordSpeechEvent(text) {
    speechDiagnostics.lastEvent = `${new Date().toLocaleTimeString()} - "${text}"`;
    if (speechLastEventEl) speechLastEventEl.textContent = speechDiagnostics.lastEvent;
}

function recordSpeechError(message) {
    speechDiagnostics.errors.unshift(`${new Date().toLocaleTimeString()} - ${message}`);
    speechDiagnostics.errors = speechDiagnostics.errors.slice(0, 5);
    renderSpeechErrors();
}

async function refreshSpeechDiagnostics() {
    let deviceLabel = 'Default input device';
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const defaultInput =
            devices.find(d => d.kind === 'audioinput' && d.deviceId === 'default') ||
            devices.find(d => d.kind === 'audioinput');
        if (defaultInput && defaultInput.label) {
            deviceLabel = defaultInput.label.replace(/^default\s*-\s*/i, '');
        }
    } catch (_) {}
    if (speechDeviceEl) {
        speechDeviceEl.textContent = deviceLabel;
        speechDeviceEl.title = deviceLabel;
    }
    if (speechStatusEl) speechStatusEl.textContent = speechDiagnostics.status;
    if (speechLastEventEl) speechLastEventEl.textContent = speechDiagnostics.lastEvent;
    renderSpeechErrors();
}

async function showSettingsUI() {
    ++assistantRequestGeneration; searchResultsActive = false;
    const alreadyOpen = settingsContainer.classList.contains('visible');
    closeNotebook({ immediate: true, switching: true });
    _stopSpeechFromOutside?.();
    cancelSpeechOutput();
    clearTimeout(blurCleanupTimer);
    hideSearchPanel();
    animationContainer.style.display = 'none';
    reminderContainer.classList.remove('visible');
    ipcRenderer.send('set-settings-visibility', true);

    setNavigationPage('settings');
    document.querySelector('.settings-main-content').style.display = 'block';
    customActionFormContainer.classList.remove('visible');
    if (!alreadyOpen) showPane(settingsContainer);
    refreshVisualActivity();

    searchBar.disabled = true;
    searchBar.placeholder = 'Type here to search';
    isBusy = false;
    document.getElementById('settings-back-btn').focus({ preventScroll: true });
    if (ttsEngine === 'edge') loadEdgeVoices().catch(error => console.warn('Voice list could not be loaded:', error.message));
    // Controls already reflect startup settings and their change handlers.
    // Rebuilding them on navigation changed layout during the entrance.
    const startupRevision = startupChangeRevision;
    await refreshSpeechDiagnostics();
    if (!startupToggle.disabled && startupRevision === startupChangeRevision) {
        try { const state = await ipcRenderer.invoke('get-settings');
            if (!startupToggle.disabled && startupRevision === startupChangeRevision) { startupToggle.checked = state.openAtLogin; startupWarning.textContent = state.startupStatus?.error || 'Open Cortana yourself to receive reminders when startup is off.'; startupWarning.style.display = state.openAtLogin && !state.startupStatus?.error ? 'none' : 'block'; }
        } catch (_) {}
    }
}

function closeSettings(silent = false, { switching = false } = {}) {
    if (!settingsContainer.classList.contains('visible')) {
        if (silent) hidePane(settingsContainer, true);
        return;
    }
    hidePane(settingsContainer, silent);
    if (!switching) {
        ipcRenderer.send('set-settings-visibility', false);
        setNavigationPage('home');
        searchBar.disabled = false;
        searchBar.placeholder = 'Type here to search';
    }
    refreshVisualActivity();
    animationContainer.style.display = 'block';
    if (!silent) {
        setStateIdle();
        settingsBtn.focus({ preventScroll: true });
    }
}

function hexToHsl(H) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    H = H.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(H);
    if (!result) return { h: 207, s: 82, l: 42 };

    let r = parseInt(result[1], 16);
    let g = parseInt(result[2], 16);
    let b = parseInt(result[3], 16);

    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    h = Math.round(h * 360);
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return { h, s, l };
}

function updateGreetingUI() {
    const mode = idleGreetingModeSelect.value;
    specificGreetingContainer.style.display = (mode === 'specific') ? 'block' : 'none';
    customGreetingContainer.style.display = (mode === 'custom') ? 'block' : 'none';
}

function updateCloseButton(closeToTray) {
    const button = document.getElementById('close-btn');
    const text = closeToTray ? 'Dismiss Cortana' : 'Close Cortana';
    button.title = text;
    button.setAttribute('aria-label', text);
}

async function loadAndApplySettings() {
    const settings = await ipcRenderer.invoke('get-settings');
    document.getElementById('recognition-mode-select').value = settings.recognitionMode || 'dictation';
    listeningSounds = settings.listeningSounds !== false;
    document.getElementById('listening-sounds-toggle').checked = listeningSounds;
    document.getElementById('close-to-tray-toggle').checked = settings.closeToTray !== false;
    updateCloseButton(settings.closeToTray !== false);
    document.getElementById('hotkey-listen-toggle').checked = settings.hotkeyStartsListening === true;
    document.getElementById('assistant-hotkey').value = formatShortcut(settings.assistantHotkey);
    const hotkey = await ipcRenderer.invoke('get-hotkey-status');
    document.getElementById('assistant-hotkey-status').textContent = hotkey.accelerator ? `Active: ${formatShortcut(hotkey.accelerator)}` : hotkey.configured ? 'Configured shortcut could not be registered; choose another.' : 'Shortcut disabled';
    preferredVoiceName = settings.preferredVoice;

    startupToggle.checked = settings.openAtLogin;
    startupToggle.disabled = settings.startupStatus?.supported === false;
    startupWarning.textContent = settings.startupStatus?.error || settings.startupStatus?.message ||
        'Open Cortana yourself to receive reminders when startup is off.';
    startupWarning.style.display = !settings.openAtLogin || startupToggle.disabled || settings.startupStatus?.error ? 'block' : 'none';

    currentSearchEngine = settings.searchEngine;
    searchEngineSelect.value = settings.searchEngine;


    isMovableMode = settings.isMovable;
    movableToggle.checked = settings.isMovable;
    applyMovableModeStyles(settings.isMovable);
    
    themeColor = settings.themeColor || "#0078d7";
    suppressThemeInput = true;
    themeColorPicker.value = themeColor;
    suppressThemeInput = false;
    useWindowsAccent = settings.useWindowsAccent === true;
    useAccentToggle.checked = useWindowsAccent;

    if (useWindowsAccent) {
        themeColorPicker.disabled = true;
        const result = await ipcRenderer.invoke('get-accent-color');
        if (result.success) {
            const accentHex = result.color.replace('#', '');
            applyAccentColor('#' + accentHex.slice(0, 6));
            suppressThemeInput = true;
            themeColorPicker.value = themeColor;
            suppressThemeInput = false;
        } else {
            themeColorPicker.disabled = false;
            useAccentToggle.checked = false;
            useWindowsAccent = false;
            applyThemeColor(themeColor);
        }
    } else {
        themeColorPicker.disabled = false;
        applyThemeColor(themeColor);
    }

    pitch = settings.pitch || 1;
    pitchSlider.value = pitch;
    rate = settings.rate || 1;
    rateSlider.value = rate;

    useEverythingSearch = settings.useEverythingSearch === true;
    heyCortanaEnabled = settings.heyCortana === true;
    if (heyCortanaToggle) heyCortanaToggle.checked = heyCortanaEnabled;
    everythingPort = settings.everythingPort || 80;
    const everythingToggle = document.getElementById('everything-toggle');
    const everythingPortInput = document.getElementById('everything-port-input');
    if (everythingToggle) everythingToggle.checked = useEverythingSearch;
    if (everythingPortInput) everythingPortInput.value = everythingPort;
    const everythingPortContainer = document.getElementById('everything-port-container');
    if (everythingPortContainer) everythingPortContainer.style.display = useEverythingSearch ? 'block' : 'none';

    ttsEngine = settings.ttsEngine || 'system';
    edgeVoice = settings.edgeVoice || 'en-US-JennyNeural';
    ttsEngineSelect.value = ttsEngine;
    updateTtsEngineUI();

    // Voice inventory is only needed when Settings opens, never on the first-paint path.

    timeFormat = settings.timeFormat || '12';
    timeFormatSelect.value = timeFormat;

    weatherUnits = settings.weatherUnits || 'metric';
    if (weatherUnitsSelect) weatherUnitsSelect.value = weatherUnits;

    idleGreetingMode = settings.idleGreetingMode || 'random';
    specificIdleGreeting = settings.specificIdleGreeting || "What's on your mind?";
    customIdleGreeting = settings.customIdleGreeting || '';
    idleGreetingModeSelect.value = idleGreetingMode;
    specificGreetingSelect.value = specificIdleGreeting;
    customGreetingInput.value = customIdleGreeting;
    updateGreetingUI();

    customActions = settings.customActions || [];
    renderCustomActions();
    
    // Load reminder sound setting
    if (settings.reminderSound) {
        reminderSound = settings.reminderSound;
        if (reminderSoundSettingInput) {
            reminderSoundSettingInput.value = settings.reminderSound;
        }
    } else {
        reminderSound = "notify.wav";
        if (reminderSoundSettingInput) {
            reminderSoundSettingInput.value = "notify.wav";
        }
    }

    aiApiUrl = settings.aiApiUrl || 'https://api.openai.com/v1/chat/completions';
    aiEnabled = settings.aiEnabled === true;
    aiToggle.checked = aiEnabled;
    openaiApiKeyInput.value = settings.openaiApiKey || '';
    aiModelInput.value = settings.aiModel || 'gpt-4o-mini';
    aiApiUrlInput.value = settings.aiApiUrl || 'https://api.openai.com/v1/chat/completions';
    aiSystemPromptInput.value = settings.aiSystemPrompt || '';

    let aiProvider = settings.aiProvider || '';
    if (!aiProvider) {
        const currentUrl = settings.aiApiUrl || '';
        const matchedPreset = Object.keys(AI_PRESETS).find(
            (key) => AI_PRESETS[key].url === currentUrl
        );
        if (matchedPreset) {
            aiProvider = matchedPreset;
        } else if (currentUrl) {
            aiProvider = 'custom';
        } else {
            aiProvider = '';
        }
    }
    aiPresetSelect.value = aiProvider;
    updateAIProviderUI(aiPresetSelect.value);

    updateAIUI();
}

function renderCustomActions() {
    customActionsList.innerHTML = '';
    if (customActions.length === 0) {
        customActionsList.innerHTML = `<p class="no-items-message">No custom actions yet.</p>`;
    } else {
        customActions.forEach((item, index) => {
            const itemContainer = document.createElement('div');
            itemContainer.className = 'custom-action-list-item fade-in-item';
    
            const textContainer = document.createElement('div');
            textContainer.className = 'custom-action-text-container';
    
            const triggerSpan = document.createElement('span');
            triggerSpan.className = 'custom-action-trigger';
            triggerSpan.textContent = item.trigger;
    
            const summarySpan = document.createElement('span');
            summarySpan.className = 'custom-action-summary';
            summarySpan.textContent = item.actions.map(a => actionNames[a.type] || 'Action').join(' → ');
    
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'custom-action-item-actions';
    
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'reminder-action-btn';
            editBtn.onclick = () => showCustomActionForm({ index, data: item });
    
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'reminder-action-btn delete';
            deleteBtn.setAttribute('aria-label', 'Delete action: ' + item.trigger);
            editBtn.setAttribute('aria-label', 'Edit action: ' + item.trigger);
            deleteBtn.onclick = async () => {
                deleteBtn.disabled = true;
                const result = await saveCustomActions(customActions.filter(action => action !== item));
                if (result.success) { renderCustomActions(); addCustomActionBtn.focus(); showSavedToast(); }
                else { deleteBtn.disabled = false; showSettingsError(result.error); }
            };
    
            textContainer.appendChild(triggerSpan);
            textContainer.appendChild(summarySpan);
            actionsContainer.appendChild(editBtn);
            actionsContainer.appendChild(deleteBtn);
            itemContainer.appendChild(textContainer);
            itemContainer.appendChild(actionsContainer);
            customActionsList.appendChild(itemContainer);
        });
    }
}

function showCustomActionForm(options = {}) {
    const { index, data } = options;
    document.querySelector('.settings-main-content').style.display = 'none';
    customActionFormContainer.classList.add('visible');
    
    if (data) {
        editingActionIndex = index;
        customActionTriggerInput.value = data.trigger;
        renderActionSequenceUI(data.actions);
    } else {
        editingActionIndex = null;
        customActionTriggerInput.value = '';
        renderActionSequenceUI([]);
    }
    validateAndApplyActionFormState();
    customActionTriggerInput.focus();
}

function hideCustomActionForm() {
    if (customActionFormContainer.inert) return;
    customActionFormContainer.classList.remove('visible');
    document.querySelector('.settings-main-content').style.display = 'block';
    editingActionIndex = null;
    addCustomActionBtn.focus({ preventScroll: true });
}

async function onSaveCustomAction() {
    const trigger = customActionTriggerInput.value.trim();
    const actions = getCurrentActionsFromForm();
    if (!trigger || actions.length === 0 || customActionSaveBtn.disabled) return;
    const next = customActions.slice();
    const newAction = { trigger, actions };
    if (editingActionIndex !== null) next[editingActionIndex] = newAction;
    else next.push(newAction);
    // Keep the editable draft until persistence succeeds; prevent duplicate submissions.
    customActionSaveBtn.disabled = true;
    settingsBackBtn.disabled = true;
    customActionSaveBtn.textContent = 'Saving...';
    customActionFormContainer.inert = true;
    try {
        const result = await saveCustomActions(next);
        if (result.success) { customActionFormContainer.inert = false; renderCustomActions(); hideCustomActionForm(); showSavedToast(); }
        else {
            actionSequenceWarning.textContent = result.error;
            actionSequenceWarning.style.display = 'block';
        }
    } finally {
        customActionFormContainer.inert = false;
        settingsBackBtn.disabled = false;
        customActionSaveBtn.disabled = false;
        customActionSaveBtn.textContent = 'Save';
    }
}

let savingCustomActions = false;
async function saveCustomActions(next = customActions) {
    if (savingCustomActions) return { success: false, error: 'Wait for the current action to finish saving, then try again.' };
    savingCustomActions = true; customActionsList.inert = true; addCustomActionBtn.disabled = true;
    try {
        const result = await ipcRenderer.invoke('set-custom-actions', next).catch(() => ({
            success: false, error: 'Could not save this action. Your draft is still here; try again.'
        }));
        if (result.success) { customActions = next; settingSaveErrors.delete('customActions'); }
        else settingSaveErrors.set('customActions', result.error);
        if (result.success && !settingSaveErrors.size) document.getElementById('settings-save-error').hidden = true;
        return result;
    } finally { savingCustomActions = false; customActionsList.inert = false; addCustomActionBtn.disabled = false; }
}

let savedToastTimer = null;
const settingSaveVersions = new Map();
const settingSaveErrors = new Map();
let pendingSettingSaves = 0;

function showSavedToast(text = 'Saved', persistent = false) {
    if (text === 'Saved' && settingSaveErrors.size) { text = 'Not saved'; persistent = true; }
    const toast = document.getElementById('settings-saved-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('visible');
    clearTimeout(savedToastTimer);
    if (!persistent) savedToastTimer = setTimeout(() => toast.classList.remove('visible'), 1600);
}

function showSettingsError(message) {
    const feedback = document.getElementById('settings-save-error');
    feedback.textContent = message;
    feedback.hidden = false;
    showSavedToast('Not saved', true);
}

async function saveSettingsPatch(patch) {
    const versions = Object.keys(patch).map(key => {
        const version = (settingSaveVersions.get(key) || 0) + 1;
        settingSaveVersions.set(key, version);
        return [key, version];
    });
    pendingSettingSaves++;
    showSavedToast('Saving...', true);
    const result = await ipcRenderer.invoke('set-settings', patch).catch(() => ({ success: false,
        error: 'Could not save your change. Try again.' }));
    for (const [key, version] of versions) if (settingSaveVersions.get(key) === version) {
        if (result.success) settingSaveErrors.delete(key);
        else settingSaveErrors.set(key, result.error);
    }
    pendingSettingSaves--;
    const error = settingSaveErrors.values().next().value;
    if (error) showSettingsError(error);
    else if (!pendingSettingSaves) { document.getElementById('settings-save-error').hidden = true; showSavedToast(); }
    return result;
}

function saveSetting(key, value) { return saveSettingsPatch({ [key]: value }); }

function applyThemeColor(color) {
    themeColor = color;
    document.documentElement.style.setProperty('--primary-color', color);
    anim.setThemeColor(color);
    notebookAnim?.setThemeColor(color);

    const defaultHue = 207;
    const newHsl = hexToHsl(color);
    const hueDifference = newHsl.h - defaultHue;
    document.documentElement.style.setProperty('--hue-rotate-deg', `${hueDifference}deg`);
}

function applyAccentColor(color) {
    applyThemeColor(color);
}

async function fetchAndApplyAccentColor() {
    const result = await ipcRenderer.invoke('get-accent-color');
    if (result.success) {
        const accentHex = result.color.replace('#', '');
        applyAccentColor('#' + accentHex.slice(0, 6));
        suppressThemeInput = true;
        themeColorPicker.value = themeColor;
        suppressThemeInput = false;
    }
}

function onThemeColorChanged(event) {
    if (suppressThemeInput) return;
    themeColor = event.target.value;
    useAccentToggle.checked = false;
    useWindowsAccent = false;
    applyThemeColor(themeColor);
    saveSettingsPatch({ useWindowsAccent: false, themeColor });
}

function onPitchChanged(event) {
    pitch = parseFloat(event.target.value);
    saveSetting('pitch', pitch);
}

function onRateChanged(event) {
    rate = parseFloat(event.target.value);
    saveSetting('rate', rate);
}

function onResetVoiceSettings() {
    ttsEngine = 'system';
    ttsEngineSelect.value = 'system';


    edgeVoice = 'en-US-JennyNeural';
    edgeVoiceSelect.value = edgeVoice;

    updateTtsEngineUI();

    const defaultVoice = findDefaultVoice(availableVoices);

    if (defaultVoice) {
        preferredVoiceName = defaultVoice.name;
        voiceSelect.value = preferredVoiceName;
        currentVoice = defaultVoice;

    }

    pitch = 1;
    rate = 1;
    pitchSlider.value = pitch;
    rateSlider.value = rate;
    saveSettingsPatch({ ttsEngine, edgeVoice, preferredVoice: preferredVoiceName, pitch, rate });
}

function onResetReminderSound() {
    if (reminderSoundSettingInput) {
        reminderSoundSettingInput.value = "notify.wav";
        reminderSound = "notify.wav";
        saveSetting('reminderSound', "notify.wav");
    }
}

function onResetThemeColors() {
    useAccentToggle.checked = false;
    useWindowsAccent = false;
    themeColorPicker.disabled = false;

    const defaultColor = '#0078d7';
    suppressThemeInput = true;
    themeColorPicker.value = defaultColor;
    suppressThemeInput = false;
    applyThemeColor(defaultColor);
    saveSettingsPatch({ useWindowsAccent: false, themeColor: defaultColor });
}

async function onResetAllSettings() {
    const confirmation = confirm(
        'Reset settings, reminders and custom actions?\n\n' +
        'This restores settings to their defaults (including Start with Windows), removes all reminders and custom actions, and restarts Cortana. Saved timers and your Notebook are kept.\n\n' +
        'Your notes, tasks, About me details and installed Windows voices will be kept. This cannot be undone.'
    );
    if (!confirmation) return;
    resetAllBtn.disabled = true;
    const result = await ipcRenderer.invoke('reset-all-settings').catch(() => ({ success: false, error: 'Could not complete the reset. Try again.' }));
    if (!result.success) { showSettingsError(result.error); resetAllBtn.disabled = false; }
}

async function refreshEvaVoiceStatus() {
    if (!evaVoiceContainer || !evaVoiceStatus) return;
    let status;
    try {
        status = await ipcRenderer.invoke('eva-voice-status');
    } catch (err) {
        return;
    }
    evaVoiceContainer.style.display = 'flex';
    evaVoiceStatus.style.color = '#a2a2a2';
    if (status.installed) {
        evaVoiceStatus.textContent = 'Installed (Microsoft Eva Mobile). A restart may be needed before it appears in the voice list.';
    } else {
        evaVoiceStatus.textContent = 'Not installed. The download provides Eva for spoken replies, not speech recognition.';
    }
    installEvaVoiceBtn.hidden = status.installed;
}

function onInstallEvaVoice() {
    if (!installEvaVoiceBtn || !evaVoiceStatus) return;
    ipcRenderer.send('install-eva-voice');
    evaVoiceStatus.textContent = 'Opening the Eva voice download page...';
    evaVoiceStatus.style.color = '#a2a2a2';
    evaVoiceStatus.style.display = 'block';
    setTimeout(refreshEvaVoiceStatus, 3000);
}

function onVoiceChanged() {
    const selectedVoiceName = voiceSelect.value;
    preferredVoiceName = selectedVoiceName;
    currentVoice = availableVoices.find(v => v.name === selectedVoiceName) || null;
    saveSetting('preferredVoice', selectedVoiceName);
}

let startupChangeRevision = 0;
async function onStartupToggleChanged() {
    ++startupChangeRevision;
    const isEnabled = startupToggle.checked;
    startupToggle.disabled = true;
    try {
        const result = await ipcRenderer.invoke('set-startup', isEnabled);
        startupToggle.checked = typeof result.enabled === 'boolean' ? result.enabled : !isEnabled;
        startupWarning.textContent = result.error || result.message || 'Open Cortana yourself to receive reminders when startup is off.';
        startupWarning.style.display = result.enabled && !result.error ? 'none' : 'block';
        if (result.supported && !result.error && result.enabled === isEnabled)
            showSavedToast();
        startupToggle.disabled = result.supported === false;
    } catch (_) {
        startupToggle.checked = !isEnabled;
        startupToggle.disabled = false;
        startupWarning.textContent = 'Windows could not update startup. Try again.';
        startupWarning.style.display = 'block';
    }
}

function onMovableToggleChanged() {
    const isEnabled = movableToggle.checked;
    saveSetting('isMovable', isEnabled);
}

function onSearchEngineChanged() {
    currentSearchEngine = searchEngineSelect.value;
    saveSetting('searchEngine', currentSearchEngine);
}

function updateTtsEngineUI() {
    const isEdge = ttsEngine === 'edge';
    edgeVoiceContainer.style.display = isEdge ? 'flex' : 'none';
    voiceSelect.parentElement.style.display = isEdge ? 'none' : 'flex';
    // Pitch and rate sliders work for Edge TTS too — don't hide them
}

let edgeVoiceLoad = null;
async function loadEdgeVoices() {
    if (edgeVoices.length > 0) return;
    if (edgeVoiceLoad) return edgeVoiceLoad;
    edgeVoiceLoad = (async () => {
    edgeVoices = await ipcRenderer.invoke('get-edge-voices');
    edgeVoiceSelect.innerHTML = '';
    const sortedVoices = edgeVoices.sort((a, b) => (a.FriendlyName || '').localeCompare(b.FriendlyName || ''));
    sortedVoices.forEach(voice => {
        const option = document.createElement('option');
        option.textContent = voice.FriendlyName || voice.ShortName;
        option.value = voice.ShortName;
        edgeVoiceSelect.appendChild(option);
    });
    edgeVoiceSelect.value = edgeVoice;
    })().finally(() => { edgeVoiceLoad = null; });
    return edgeVoiceLoad;
}

async function onTtsEngineChanged() {
    ttsEngine = ttsEngineSelect.value;
    saveSetting('ttsEngine', ttsEngine);
    updateTtsEngineUI();
    if (ttsEngine === 'edge') {
        await loadEdgeVoices();
    }
}

function onEdgeVoiceChanged() {
    edgeVoice = edgeVoiceSelect.value;
    saveSetting('edgeVoice', edgeVoice);
}

function onTimeFormatChanged() {
    timeFormat = timeFormatSelect.value;
    saveSetting('timeFormat', timeFormat);
}

function formatTimeOptions() {
    return { hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12' };
}

function formatDateTimeOptions() {
    return { weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12' };
}

function formatReminderListOptions() {
    return { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: timeFormat === '12' };
}

function onAIChanged() {
    aiEnabled = aiToggle.checked;
    saveSetting('aiEnabled', aiEnabled);
    updateAIUI();
}

const AI_PRESETS = {
  openai:     { url: 'https://api.openai.com/v1/chat/completions',           model: 'gpt-4o-mini',              keyHint: 'sk-...' },
  ollama:     { url: 'http://localhost:11434',                               model: 'phi3:mini',                keyHint: '',        local: true },
  lmstudio:   { url: 'http://localhost:1234/v1/chat/completions',            model: '',                         keyHint: '',        local: true },
  groq:       { url: 'https://api.groq.com/openai/v1/chat/completions',      model: 'llama-3.3-70b-versatile', keyHint: 'gsk_...' },
  together:   { url: 'https://api.together.ai/v1/chat/completions',          model: 'Qwen/Qwen3.5-9B',         keyHint: '...' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions',        model: '~openai/gpt-latest',      keyHint: 'sk-or-...' },
  perplexity: { url: 'https://api.perplexity.ai/chat/completions',           model: 'sonar-pro',                keyHint: 'pplx-...' },
  xai:        { url: 'https://api.x.ai/v1/chat/completions',                 model: 'grok-4.5',                 keyHint: 'xai-...' },
  mistral:    { url: 'https://api.mistral.ai/v1/chat/completions',           model: 'mistral-large-latest',     keyHint: '...' },
  'google-gemini': { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.5-flash', keyHint: 'AIza...' },
  deepseek:   { url: 'https://api.deepseek.com/v1/chat/completions',         model: 'deepseek-chat',            keyHint: 'sk-...' },
};

function onPresetChanged() {
    const val = aiPresetSelect.value;
    const patch = { aiProvider: val };

    if (val === 'custom') {
        saveSettingsPatch(patch);
        updateAIProviderUI(val);
        return;
    }

    const preset = AI_PRESETS[val];
    if (preset) {
        aiApiUrlInput.value = preset.url;
        aiApiUrl = preset.url;
        aiModelInput.value = preset.model || aiModelInput.value;
        patch.aiApiUrl = preset.url;
        if (aiModelInput.value) {
            patch.aiModel = aiModelInput.value;
        }
    }
    saveSettingsPatch(patch);
    updateAIProviderUI(val);
}

function updateAIProviderUI(provider) {
    const preset = AI_PRESETS[provider];
    const isCustom = provider === 'custom';
    const showLocalOrCustom = isCustom || preset?.local;

    aiCustomFields.style.display = provider ? 'block' : 'none';
    aiModelItem.style.display = provider ? '' : 'none';
    aiApiUrlItem.style.display = showLocalOrCustom ? '' : 'none';

    const isLocal = isLoopback(aiApiUrlInput.value);
    document.querySelector('label[for="openai-api-key-input"]').textContent = isLocal ? 'API key (optional)' : 'API key';
    openaiApiKeyInput.placeholder =
        isLocal ? 'Leave blank if not needed' : preset?.keyHint || 'sk-...';
}

function onOpenAIKeyChanged() {
    saveSetting('openaiApiKey', openaiApiKeyInput.value);
}

function onAIModelChanged() {
    saveSetting('aiModel', aiModelInput.value);
}

function onAIApiUrlChanged() {
    aiApiUrl = aiApiUrlInput.value;
    updateAIProviderUI(aiPresetSelect.value);
    saveSetting('aiApiUrl', aiApiUrlInput.value);
}

function onAISystemPromptChanged() {
    saveSetting('aiSystemPrompt', aiSystemPromptInput.value);
}

function updateAIUI() {
    openaiApiKeyContainer.style.display = aiEnabled ? 'block' : 'none';
}

function onIdleGreetingModeChanged(event) {
    idleGreetingMode = event.target.value;
    saveSetting('idleGreetingMode', idleGreetingMode);
    updateGreetingUI();
}

function onSpecificIdleGreetingChanged(event) {
    specificIdleGreeting = event.target.value;
    saveSetting('specificIdleGreeting', specificIdleGreeting);
}

function onCustomIdleGreetingChanged(event) {
    customIdleGreeting = event.target.value;
    saveSetting('customIdleGreeting', customIdleGreeting);
}

function displayAndSpeak(text, callback, options = {}, isError = false) {
    const generation = assistantRequestGeneration;
    const output = outputGeneration;
    const current = () => generation === assistantRequestGeneration && output === outputGeneration;
    resultsDisplay.innerHTML = '';
    requestSound.pause();
    requestSound.currentTime = 0;

    const p = document.createElement('p');
    p.className = 'fade-in-item';
    p.textContent = text;
    resultsDisplay.appendChild(p);

    if (options.showWebLink) {
        showWebLink();
    }

    if (isError) {
        errorSound.play();

        let errorHandled = false;
        const handleErrorEnd = () => {
            if (errorHandled) return;
            errorHandled = true;
            errorSound.onended = null;
            if (!current()) return;

            const currentState = anim.state;
            const wasSpeaking = currentState === AnimationState.SPEAKING || currentState === AnimationState.SPEAKING_BEGIN;

            if (wasSpeaking) {
                anim.goToState(AnimationState.SPEAKING_END, { nextState: AnimationState.ERROR });
            } else {
                anim.goToState(AnimationState.ERROR, { nextState: AnimationState.TRANSITION_TO_IDLE });
            }

            setTimeout(() => {
                if (!current()) return;
                speak(text, () => {
                    isBusy = false;
                    searchBar.disabled = false;
                    searchBar.placeholder = 'Type here to search';
                    // AnimationManager already advances ERROR through the idle transition.
                    // Restarting it here can replay the transition when speech finishes.
                });
            }, 500);
        };

        errorSound.onended = handleErrorEnd;
        setTimeout(handleErrorEnd, 2500);
    } else {
        anim.goToState(AnimationState.SPEAKING_BEGIN);
        speak(text, callback);
    }
}

function setupTTS() {
    function populateAndSetVoices() {
        availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices.length === 0) return;

        voiceSelect.innerHTML = '';
        availableVoices.forEach(voice => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            option.value = voice.name;
            voiceSelect.appendChild(option);
        });

        const ziraIsAvailable = availableVoices.some(v => v.name.includes("Zira"));
        voiceWarning.style.display = ziraIsAvailable ? 'none' : 'block';

        const preferredVoiceIsAvailable = availableVoices.some(v => v.name === preferredVoiceName);

        // Resolve the default alias and migrate only an unavailable legacy Zira
        // default. A deliberately selected custom voice remains untouched.
        const regularZira = availableVoices.find(v => /zira/i.test(v.name) && !/desktop/i.test(v.name));
        if (!preferredVoiceIsAvailable && regularZira && /^Microsoft Zira(?: Desktop)?$/i.test(preferredVoiceName)) {
            preferredVoiceName = regularZira.name;
            saveSetting('preferredVoice', preferredVoiceName);
        }

        if (availableVoices.some(v => v.name === preferredVoiceName)) {
            voiceSelect.value = preferredVoiceName;
        } else {
            const defaultVoice = findDefaultVoice(availableVoices);
            if (defaultVoice) {
                voiceSelect.value = defaultVoice.name;
                const missing = document.createElement('option');
                missing.value = preferredVoiceName;
                missing.textContent = `${preferredVoiceName} (unavailable; temporary fallback: ${defaultVoice.name})`;
                voiceSelect.appendChild(missing);
                voiceSelect.value = preferredVoiceName;
            }
        }
        
        currentVoice = resolveVoice(availableVoices, preferredVoiceName);
    }

    window.speechSynthesis.onvoiceschanged = populateAndSetVoices;
    populateAndSetVoices();
}

let currentEdgeAudio = null;
let currentEdgeFilePath = null;
let outputGeneration = 0;
function removeSpeechFile(filename) {
    if (filename) ipcRenderer.invoke('release-tts-file', filename).catch(() => {});
}
function cancelSpeechOutput() {
    ++outputGeneration;
    window.speechSynthesis.cancel();
    if (currentEdgeAudio) {
        currentEdgeAudio.onended = null;
        currentEdgeAudio.onerror = null;
        currentEdgeAudio.pause();
        currentEdgeAudio = null;
    }
    removeSpeechFile(currentEdgeFilePath);
    currentEdgeFilePath = null;
    ipcRenderer.send('tts-end');
}

async function speak(text, onSpeechEndCallback) {
    cancelSpeechOutput();
    const generation = outputGeneration;
    let completed = false;
    const finish = () => {
        if (completed || generation !== outputGeneration) return;
        completed = true;
        ipcRenderer.send('tts-end');
        if (onSpeechEndCallback) onSpeechEndCallback();
    };
    if (!text) { finish(); return; }
    try {
        // Await microphone teardown before synthesis or playback, including Bluetooth devices.
        await ipcRenderer.invoke('tts-begin');
        if (generation !== outputGeneration) return;
        if (ttsEngine === 'edge' && navigator.onLine) await speakEdge(text, finish, generation);
        else speakSystem(text, finish);
    } catch (error) {
        console.error('Speech output failed:', error);
        finish();
    }
}

async function speakEdge(text, finish, generation) {
    let result;
    try { result = await ipcRenderer.invoke('synthesize-edge-tts', { text, voice: edgeVoice, pitch, rate }); }
    catch (error) { result = { success: false, error: error.message }; }
    if (generation !== outputGeneration) { removeSpeechFile(result.filePath); return; }
    if (!result.success) {
        console.warn('Edge TTS failed; using local voice:', result.error);
        speakSystem(text, finish);
        return;
    }
    currentEdgeFilePath = result.filePath;
    const audio = new Audio(window.cortana.fileUrl(result.filePath));
    currentEdgeAudio = audio;
    const cleanup = () => {
        removeSpeechFile(result.filePath);
        if (currentEdgeAudio === audio) { currentEdgeAudio = null; currentEdgeFilePath = null; }
    };
    audio.onended = () => { cleanup(); finish(); };
    const fallback = () => {
        if (generation !== outputGeneration) return;
        audio.onended = audio.onerror = null;
        audio.pause();
        cleanup();
        speakSystem(text, finish);
    };
    audio.onerror = fallback;
    audio.play().catch(fallback);
}

function speakSystem(text, finish) {
    const generation = outputGeneration;
    currentVoice = resolveVoice(availableVoices, preferredVoiceName);
    if (!currentVoice) { finish(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = currentVoice;
    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.onend = () => { if (generation === outputGeneration) finish(); };
    utterance.onerror = () => { if (generation === outputGeneration) finish(); };
    window.speechSynthesis.speak(utterance);
}

function onActionFinished() {
    if (animationContainer.className === 'idle') {
        isBusy = false;
        return;
    }

    isBusy = false;

    anim.goToState(AnimationState.SPEAKING_END, { nextState: AnimationState.TRANSITION_TO_IDLE });
}

function setStateIdle() {
    // Stopping capture while entering the Notebook must not invalidate its page load.
    if (document.getElementById('notebook-sidebar')?.classList.contains('visible')) return;
    ++assistantRequestGeneration;
    resultsDisplay.classList.remove('day-summary');
    searchIcon.src = cortanaIcon;
    if (settingsContainer.classList.contains('visible')) return;
    if (animationContainer.className === 'idle' && document.activeElement === searchBar &&
        anim.state === AnimationState.IDLE && !anim._isPlayingSpecial && resultsDisplay.textContent) return;
    
    if (searchResultsActive) {
        searchResultsActive = false;
    }

    editingReminderId = null;
    editingReminderSound = null;
    reminderContainer.classList.remove('visible');
    animationContainer.style.display = 'block';
    contentWrapper.style.display = 'block';

    clearTimeout(finishSpeakingTimeout);
    cancelSpeechOutput();
    requestSound.pause();
    requestSound.currentTime = 0;
    drumrollSound.pause();
    drumrollSound.currentTime = 0;

    isBusy = false;

    animationContainer.className = 'idle';
    if (document.activeElement === searchBar || searchPanel.classList.contains('visible')) {
        searchIcon.src = searchIconPng;
    } else {
        searchIcon.src = cortanaIcon;
    }
    if (![AnimationState.IDLE, AnimationState.TRANSITION_TO_IDLE].includes(anim.state) || anim._isPlayingSpecial)
        anim.goToState(AnimationState.TRANSITION_TO_IDLE);

    if (!isBusy) {
        stopTimerPanelInterval();
        resultsDisplay.innerHTML = '';
        if (timerEndTime) {
            const timerDisplay = document.createElement('p');
            timerDisplay.className = 'fade-in-item';
            timerDisplay.id = 'timer-display';
            timerDisplay.style.fontSize = '24px';
            timerDisplay.style.textAlign = 'center';
            timerDisplay.style.fontWeight = 'bold';
            const remaining = Math.max(0, timerEndTime - Date.now());
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            timerDisplay.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            resultsDisplay.appendChild(timerDisplay);
        } else {
            const p = document.createElement('p');
            p.className = 'fade-in-item';
            p.textContent = getIdleMessage();
            resultsDisplay.appendChild(p);
        }
    }
    
    webLinkContainer.style.display = 'none';
    webLinkContainer.style.opacity = '0';

    searchBar.disabled = false;
    searchBar.placeholder = 'Type here to search';
}

function setStateActive() {
    animationContainer.className = 'active';
}

function getSearchUrl(query) {
    const encodedQuery = encodeURIComponent(query);
    switch (currentSearchEngine) {
        case 'google':
            return `https://www.google.com/search?q=${encodedQuery}`;
        case 'duckduckgo':
            return `https://duckduckgo.com/?q=${encodedQuery}`;
        case 'brave':
            return `https://search.brave.com/search?q=${encodedQuery}`;
        case 'ecosia':
            return `https://www.ecosia.org/search?q=${encodedQuery}`;
        case 'bing':
        default:
            return `https://www.bing.com/search?q=${encodedQuery}`;
    }
}

async function performWebSearch(query) {
    const generation = ++assistantRequestGeneration;
    if (!navigator.onLine) {
        displayAndSpeak('Web search needs an internet connection. You can still open apps and folders, calculate, set reminders and timers, and use your Notebook.', onActionFinished);
        return;
    }
    searchResultsActive = true;
    if (document.activeElement === searchBar) {
        searchIcon.src = searchIconPng;
    }
    anim.goToState(AnimationState.THINKING);
    resultsDisplay.innerHTML = '';

    // Plain Cortana dialogue line (same class/markup as every other spoken
    // line elsewhere in the app). No white backdrop while just searching.
    // The white card only wraps the actual results list, once there is one.
    const loadingP = document.createElement('p');
    loadingP.className = 'fade-in-item';
    loadingP.textContent = `Searching the web for "${query}"...`;
    resultsDisplay.appendChild(loadingP);
    searchBar.disabled = false;
    clearSearchBar();
    searchBar.placeholder = 'Type here to search';

    let result;
    try { result = await ipcRenderer.invoke('search-web', query); }
    catch (_) { result = { success: false }; }
    if (!searchResultsActive || generation !== assistantRequestGeneration) return;

    resultsDisplay.innerHTML = '';
    if (result.success && result.results.length > 0) {
        // White backdrop card that separates the results list from the rest
        // of the UI, matching the look of the app/file search panel.
        const resultsPanel = document.createElement('div');
        resultsPanel.className = 'search-results-panel fade-in-item';
        resultsDisplay.appendChild(resultsPanel);

        result.results.forEach(r => {
            const item = document.createElement('div');
            item.className = 'search-result-item fade-in-item';
            const title = document.createElement('a');
            title.className = 'search-result-title';
            title.textContent = r.title;
            title.href = '#';
            title.addEventListener('click', (e) => {
                e.preventDefault();
                ipcRenderer.send('open-external-link', r.url);
            });
            const snippet = document.createElement('p');
            snippet.className = 'search-result-snippet';
            snippet.textContent = r.snippet;
            const url = document.createElement('span');
            url.className = 'search-result-url';
            url.textContent = r.url;
            item.appendChild(title);
            if (r.snippet) item.appendChild(snippet);
            item.appendChild(url);
            resultsPanel.appendChild(item);
        });

        showWebLink();

        anim.goToState(AnimationState.SPEAKING_BEGIN);
        requestSound.pause();
        requestSound.currentTime = 0;
        speak(`I found results for ${query}.`, () => {
            onActionFinished();
        });
    } else {
        const p = document.createElement('p');
        p.className = 'fade-in-item';
        p.textContent = result.success ? 'No results found. Try a different spelling or search term.' : "I couldn't load web results. Check your connection, try again, or open the search in your browser.";
        resultsDisplay.appendChild(p);
        showWebLink();
        anim.goToState(AnimationState.SPEAKING_BEGIN);
        setTimeout(() => {
            if (generation !== assistantRequestGeneration) return;
            isBusy = false;
            anim.goToState(AnimationState.TRANSITION_TO_IDLE);
        }, 1000);
    }
}

function hideSearchResults() {
    if (!searchResultsActive) return;
    searchResultsActive = false;
    searchBar.placeholder = 'Type here to search';
    clearSearchBar();
    searchIcon.src = cortanaIcon;
    setStateIdle();
}

function showWebLink() {
    const webLinkSpan = webLink.querySelector('span');

    if (currentSearchEngine === 'bing') {
        webIcon.src = bingPng;
        webLinkSpan.textContent = 'See more results on Bing.com';
    } else if (currentSearchEngine === 'duckduckgo') {
        webIcon.src = searchIconPng;
        webLinkSpan.textContent = 'See more results on DuckDuckGo';
    } else if (currentSearchEngine === 'google') {
        webIcon.src = searchIconPng;
        webLinkSpan.textContent = 'See more results on Google';
    } else if (currentSearchEngine === 'brave') {
        webIcon.src = searchIconPng;
        webLinkSpan.textContent = 'See more results on Brave';
    } else if (currentSearchEngine === 'ecosia') {
        webIcon.src = searchIconPng;
        webLinkSpan.textContent = 'See more results on Ecosia';
    }


    webLinkContainer.style.display = 'block';
    setTimeout(() => {
        webLinkContainer.style.animation = 'fadeIn 0.5s forwards';
        webLinkContainer.style.opacity = '1';
    }, 200);
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function createAssistantResponse(text, { isError = false, showWebLink = false, choices } = {}) {
    if (!isNonEmptyString(text)) throw new Error('Assistant response requires text');
    const response = { text, isError: isError === true, showWebLink: showWebLink === true };
    if (!response.isError && Array.isArray(choices)) {
        const validChoices = choices
            .filter(choice => choice && isNonEmptyString(choice.label) && isNonEmptyString(choice.query))
            .map(({ label, query }) => ({ label, query }));
        if (validChoices.length > 0) response.choices = validChoices;
    }
    return response;
}

function presentAssistantResponse(response) {
    const { text, isError, showWebLink, choices = [] } = createAssistantResponse(response.text, response);
    const buttons = [];
    let finished = false;
    // TTS can finish synchronously when no system voice is available.
    const onFinished = () => {
        if (finished) return;
        finished = true;
        onActionFinished();
        buttons.forEach(button => { button.disabled = false; });
    };
    displayAndSpeak(text, onFinished, { showWebLink }, isError);
    if (choices.length > 0) resultsDisplay.firstChild.style.marginBottom = '10px';
    choices.forEach(choice => {
        const button = document.createElement('button');
        button.textContent = choice.label;
        button.className = 'choice-button fade-in-item';
        button.disabled = !finished;
        button.onclick = () => {
            if (button.disabled || !button.isConnected) return;
            buttons.forEach(item => { item.disabled = true; });
            lastQuery = choice.query;
            isBusy = true;
            setStateActive();
            processQuery(choice.query);
        };
        buttons.push(button);
        resultsDisplay.appendChild(button);
    });
}

const assistantSkills = [
    {
        match(query) {
            const locationMatch = query.match(/(?:(?:what's|what is) the time|what time is it) (?:in|for|at) (.+)/i);
            if (locationMatch) return { kind: 'location', location: locationMatch[1] };
            if (/^(?:what(?:'s| is) the time|what time is it)[?!.]*$/i.test(query)) return { kind: 'local' };
            return null;
        },
        execute(context) {
            return context.kind === 'location' ? getLocationTimeResponse(context.location) : getLocalTimeResponse();
        }
    },
    {
        match(query) {
            const prefixedMatch = query.match(/^(?:what is|calculate|compute) ([\d\s\.\+\-\*\/(),]+)\??$/i);
            if (prefixedMatch) return { expression: prefixedMatch[1] };
            const bareMatch = query.match(/^[\d\s\.\+\-\*\/(),]+$/);
            return bareMatch ? { expression: bareMatch[0] } : null;
        },
        execute({ expression }) {
            return calculateResponse(expression);
        }
    }
];

function matchAssistantSkill(query) {
    // Time patterns are unanchored: do not steal existing reminder/weather requests.
    if (priorityCommands.some(command => command.regex.test(query))) return null;
    for (const skill of assistantSkills) {
        const context = skill.match(query);
        if (context) return { skill, context };
    }
    return null;
}

async function executeAssistantSkill({ skill, context }) {
    const generation = assistantRequestGeneration;
    try {
        const response = skill.execute(context);
        // Keep synchronous skills synchronous, including their presentation.
        const resolved = response instanceof Promise ? await response : response;
        if (generation !== assistantRequestGeneration) return;
        presentAssistantResponse(resolved);
    } catch (error) {
        if (generation !== assistantRequestGeneration) return;
        console.error('Assistant skill failed:', error);
        presentAssistantResponse(createAssistantResponse("Sorry, something went wrong. Try again in a little bit.", { isError: true }));
    }
}

function calculateResponse(query) {
    let responseText;
    try {
        // Remove any spaces and validate the expression only contains numbers, operators, parentheses, and decimals
        const cleanQuery = query.replace(/,/g, '').replace(/\s+/g, '');
        
        // Validate that the query only contains safe mathematical characters
        if (!/^[\d+\-*/().]+$/.test(cleanQuery)) {
            throw new Error('Invalid characters in calculation');
        }
        
        // Check for potential issues like very long expressions that could cause DoS
        if (cleanQuery.length > 100) {
            throw new Error('Expression too complex');
        }
        
        // Safe mathematical expression evaluator using recursive descent parser
        let index = 0;
        let recursionDepth = 0;
        const MAX_RECURSION_DEPTH = 50; // Prevent stack overflow from deeply nested expressions
        
        function parseExpression() {
            recursionDepth++;
            if (recursionDepth > MAX_RECURSION_DEPTH) {
                throw new Error('Expression too deeply nested');
            }
            
            let result = parseTerm();
            
            while (index < cleanQuery.length && (cleanQuery[index] === '+' || cleanQuery[index] === '-')) {
                const op = cleanQuery[index];
                index++;
                const right = parseTerm();
                result = op === '+' ? result + right : result - right;
            }
            
            recursionDepth--;
            return result;
        }
        
        function parseTerm() {
            let result = parseFactor();
            
            while (index < cleanQuery.length && (cleanQuery[index] === '*' || cleanQuery[index] === '/')) {
                const op = cleanQuery[index];
                index++;
                const right = parseFactor();
                if (op === '*') {
                    result = result * right;
                } else {
                    if (right === 0) throw new Error('Division by zero');
                    result = result / right;
                }
            }
            
            return result;
        }
        
        function parseFactor() {
            if (cleanQuery[index] === '+' || cleanQuery[index] === '-') {
                const op = cleanQuery[index];
                index++;
                const result = parseFactor();
                return op === '-' ? -result : result;
            }
            if (cleanQuery[index] === '(') {
                index++;
                const result = parseExpression();
                if (cleanQuery[index] !== ')') throw new Error('Mismatched parentheses');
                index++;
                return result;
            } else {
                return parseNumber();
            }
        }
        
        function parseNumber() {
            let numStr = '';
            while (index < cleanQuery.length && 
                   (/\d/.test(cleanQuery[index]) || cleanQuery[index] === '.')) {
                numStr += cleanQuery[index];
                index++;
            }
            
            if (numStr === '') throw new Error('Expected number');
            
            if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(numStr)) throw new Error('Invalid number');
            const num = Number(numStr);
            if (isNaN(num)) throw new Error('Invalid number');
            
            return num;
        }
        
        const result = parseExpression();
        
        if (index !== cleanQuery.length) {
            throw new Error('Unexpected characters');
        }
        
        if (isNaN(result) || !isFinite(result)) {
            throw new Error('Invalid calculation');
        }
        
        responseText = `The answer is ${result}.`;
        return createAssistantResponse(responseText, { showWebLink: true });
    } catch (error) {
        responseText = "That doesn't look like a valid calculation.";
        return createAssistantResponse(responseText, { showWebLink: true, isError: true });
    }
}

async function getWeather(location) {
    const generation = assistantRequestGeneration;
    location = location.trim().replace(/[?!.]+$/, '');
    if (!navigator.onLine) {
        displayAndSpeak('Weather needs an internet connection. Local commands and your Notebook still work offline.', onActionFinished);
        return;
    }
    let responseText;
    try {
        const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`, { signal: AbortSignal.timeout(10000) });
        if (generation !== assistantRequestGeneration) return;
        if (!geoResponse.ok) {
            responseText = `Sorry, I had trouble connecting to the location service.`;
            displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
            return;
        }

        const geoData = await geoResponse.json();
        if (generation !== assistantRequestGeneration) return;
        if (!geoData.results || geoData.results.length === 0) {
            responseText = `Sorry, I couldn't find a location named ${location}.`;
            displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
            return;
        }

        const { name, admin1, country, latitude, longitude } = geoData.results[0];
        const locationNameForSpeech = (admin1 && admin1.toLowerCase() !== name.toLowerCase()) ? `${name}, ${admin1}` : `${name}, ${country}`;

        const isImperial = weatherUnits === 'imperial';
        const tempUnit = isImperial ? 'fahrenheit' : 'celsius';
        const windUnit = isImperial ? 'mph' : 'kmh';
        const tempSymbol = isImperial ? '°F' : '°C';
        const windSymbol = isImperial ? 'mph' : 'km/h';
        const windPhrase = isImperial ? 'miles per hour' : 'kilometers per hour';

        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}`, { signal: AbortSignal.timeout(10000) });
        if (generation !== assistantRequestGeneration) return;
        if (!weatherResponse.ok) {
            responseText = `Sorry, I couldn't get the weather for ${locationNameForSpeech}.`;
            displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
            return;
        }

        const weatherData = await weatherResponse.json();
        if (generation !== assistantRequestGeneration) return;
        const { temperature, windspeed, weathercode } = weatherData.current_weather;
        const conditions = getWeatherDescription(weathercode);

        lastQuery = `weather in ${location}`;
        responseText = `Currently in ${locationNameForSpeech}: ${temperature}${tempSymbol}, ${conditions}. Wind speed is ${windspeed} ${windPhrase}.`;

        displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, false);

    } catch (error) {
        if (generation !== assistantRequestGeneration) return;
        responseText = "Sorry, something went wrong. Try again in a little bit.";
        displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
    }
}

function getWeatherDescription(code) {
    const descriptions = {
        0: 'clear sky',
        1: 'mainly clear',
        2: 'partly cloudy',
        3: 'overcast',
        45: 'foggy',
        48: 'depositing rime fog',
        51: 'light drizzle',
        53: 'moderate drizzle',
        55: 'dense drizzle',
        56: 'light freezing drizzle',
        57: 'dense freezing drizzle',
        61: 'slight rain',
        63: 'moderate rain',
        65: 'heavy rain',
        66: 'light freezing rain',
        67: 'heavy freezing rain',
        71: 'slight snow',
        73: 'moderate snow',
        75: 'heavy snow',
        77: 'snow grains',
        80: 'slight rain showers',
        81: 'moderate rain showers',
        82: 'violent rain showers',
        85: 'slight snow showers',
        86: 'heavy snow showers',
        95: 'thunderstorm',
        96: 'thunderstorm with slight hail',
        99: 'thunderstorm with heavy hail'
    };
    return descriptions[code] || 'unknown conditions';
}

async function getLocationTimeResponse(rawInput) {
    try {
        const result = await ipcRenderer.invoke('get-time-for-location', rawInput.trim(), timeFormat);
        if (result.ambiguous) {
            const choices = (Array.isArray(result.options) ? result.options : [])
                .filter(option => option &&
                    [option.city, option.country, option.fullQuery].every(isNonEmptyString) &&
                    (option.province == null || typeof option.province === 'string'))
                .map(option => ({
                    label: option.province ? `${option.city}, ${option.province}, ${option.country}` : `${option.city}, ${option.country}`,
                    query: `what is the time in ${option.fullQuery}`
                }));
            if (choices.length === 0) throw new Error('No usable location choices');
            return createAssistantResponse("I found a few places with that name. Which one did you mean?", {
                showWebLink: true,
                choices
            });
        }
        return createAssistantResponse(`The time in ${result.city}, ${result.country} is ${result.time}.`, { showWebLink: true });
    } catch (error) {
        return createAssistantResponse(`Sorry, I couldn't find the time for '${rawInput.trim()}'. Please try a more specific city name.`, {
            showWebLink: true,
            isError: true
        });
    }
}

function getLocalTimeResponse() {
    const now = new Date();
    return createAssistantResponse(`The local time is ${now.toLocaleTimeString([], formatTimeOptions())}`, { showWebLink: true });
}

function getDate() {
    const now = new Date();
    const text = `Today's date is ${now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    displayAndSpeak(text, onActionFinished, { showWebLink: true }, false);
}

async function getAppVersion() {
    const version = await ipcRenderer.invoke('get-app-version');
    const responseText = `I'm running on version ${version}.`;
    displayAndSpeak(responseText, onActionFinished, {}, false);
}

function updateSaveButtonState() {
    const reminderText = reminderTextInput.value.trim();
    const timeText = reminderTimeInput.value.trim();
    reminderSaveBtn.disabled = !(reminderText && timeText);
}

function showReminderUI(options = {}) {
    ++reminderFormRevision;
    const { initialText = '', initialTime = '', initialSound = '', initialRecurrence = null, id = null } = options;
    editingReminderId = id;
    editingReminderSound = initialSound;
    document.getElementById('reminder-repeat').value = initialRecurrence || '';
    document.getElementById('reminder-save-error').hidden = true;

    animationContainer.style.display = 'block';
    contentWrapper.style.display = 'none';
    setStateActive();
    anim.goToState(AnimationState.IDLE);
    reminderContainer.classList.add('visible');

    reminderTextInput.value = initialText;
    reminderTimeInput.value = initialTime;

    updateSaveButtonState();

    isBusy = false;
    searchBar.disabled = true;
    searchBar.placeholder = 'Set your reminder...';

    if (!initialText) {
        reminderTextInput.focus();
    } else {
        reminderTimeInput.focus();
    }
}

const temporalNumberWords = {
    'zero': 0,
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'six': 6,
    'seven': 7,
    'eight': 8,
    'nine': 9,
    'ten': 10,
    'eleven': 11,
    'twelve': 12,
    'thirteen': 13,
    'fourteen': 14,
    'fifteen': 15,
    'sixteen': 16,
    'seventeen': 17,
    'eighteen': 18,
    'nineteen': 19,
    'twenty': 20,
    'thirty': 30,
    'forty': 40,
    'fifty': 50,
    'sixty': 60
};

function parseTemporalNumberWords(sequence) {
    const words = sequence.toLowerCase().split(/[\s-]+/).filter(Boolean);
    if (!words.length) return null;
    let total = 0;
    for (const word of words) {
        if (!(word in temporalNumberWords)) return null;
        total += temporalNumberWords[word];
    }
    return total;
}

function normalizeTemporalNumberWords(text) {
    const wordPattern = Object.keys(temporalNumberWords).join('|');
    const pattern = new RegExp(
        `\\b((?:${wordPattern})(?:[\\s-](?:${wordPattern}))*)\\s+(seconds?|minutes?|hours?|days?)\\b`,
        'gi'
    );
    return text.replace(pattern, (match, value, unit) => {
        const parsed = parseTemporalNumberWords(value);
        return parsed === null ? match : `${parsed} ${unit.toLowerCase()}`;
    });
}

function parseReminderRequest(fullText) {
    const text = fullText.trim();

    const timeFirst = text.match(
        /^(?:in|at|on)\s+(.+?)\s+to\s+(.+)$/i
    );

    if (timeFirst) {
        const parsedDate = parseDateTime(timeFirst[1].trim());
        if (parsedDate) {
            return {
                reminderText: timeFirst[2].trim(),
                timeText: formatDateTimeForInput(parsedDate),
            };
        }
    }

    const dayTime = text.match(
        /^(.+?)\s+\b(tomorrow|tonight|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b\s+(?:at|on|in)\s+(.+)$/i
    );

    if (dayTime && dayTime[1].trim()) {
        const parsedDate = parseDateTime(
            `${dayTime[2]} ${dayTime[3].trim()}`.trim()
        );
        if (parsedDate) {
            return {
                reminderText: dayTime[1].trim(),
                timeText: formatDateTimeForInput(parsedDate),
            };
        }
    }

    const timeOnly = text.match(/^(?:in|at|on)\s+(.+)$/i)
        || text.match(/^(tomorrow|tonight|today)(?:\s+(?:at|on|in)\s+(.+))?$/i);
    if (timeOnly) {
        const parsedDate = parseDateTime(text);
        if (parsedDate) {
            return {
                reminderText: '',
                timeText: formatDateTimeForInput(parsedDate),
            };
        }
    }

    const textFirst = text.match(
        /^(.+?)\s+(?:in|at|on)\s+(.+)$/i
    );

    if (textFirst) {
        const parsedDate = parseDateTime(textFirst[2].trim());
        if (parsedDate) {
            return {
                reminderText: textFirst[1].trim(),
                timeText: formatDateTimeForInput(parsedDate),
            };
        }
    }

    return {
        reminderText: text,
        timeText: '',
    };
}

function parseDateTime(text) {
    const now = new Date();
    text = normalizeTemporalNumberWords(text.toLowerCase().trim().replace(/[!.?]+$/, ''));
    // Parse durations before clock times, and consume the entire input. Date's
    // setHours silently normalizes invalid clocks such as 25:00 or 12:75.
    const relative = text.match(/^(?:in\s+)?(\d+)\s*(second|minute|hour|day)s?$/);
    if (relative) {
        const ms = Number(relative[1]) * { second: 1000, minute: 60000, hour: 3600000, day: 86400000 }[relative[2]];
        const result = new Date(now.getTime() + ms);
        return ms > 0 && Number.isSafeInteger(ms) && Number.isFinite(result.getTime()) ? result : null;
    }

    const date = new Date(now);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    text = text.replace(/^on\s+/, '');
    const day = text.match(/\b(today|tonight|tomorrow|(?:next\s+)?sunday|(?:next\s+)?monday|(?:next\s+)?tuesday|(?:next\s+)?wednesday|(?:next\s+)?thursday|(?:next\s+)?friday|(?:next\s+)?saturday)\b/);
    if (day) {
        if (day[1] === 'tomorrow') date.setDate(date.getDate() + 1);
        const index = days.indexOf(day[1].replace(/^next\s+/, ''));
        if (index >= 0) date.setDate(date.getDate() + ((index - now.getDay() + 7) % 7 || 7));
        text = text.replace(day[0], '').trim();
    }
    text = text.replace(/^at\s+/, '').trim();
    if (!text) {
        if (!day) return null;
        date.setHours(day[1] === 'tonight' ? 21 : 9, 0, 0, 0);
        return date;
    }

    const clock = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!clock) return null;
    let hour = Number(clock[1]);
    const minute = Number(clock[2] || 0);
    const ampm = clock[3];
    if (minute > 59 || (ampm ? hour < 1 || hour > 12 : hour > 23)) return null;
    if (ampm) hour = hour % 12 + (ampm === 'pm' ? 12 : 0);
    date.setHours(hour, minute, 0, 0);
    // A clock without an explicit day means its next occurrence.
    if (!day && date <= now) date.setDate(date.getDate() + 1);
    return date;
}

function formatDateTimeForInput(date) {
    const pad = (num) => num.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

let savingReminder = false;
let reminderFormRevision = 0;
async function deleteReminder(id, button, status) {
    button.disabled = true; status.hidden = true;
    try {
        const result = await ipcRenderer.invoke('remove-reminder', id);
        if (!result.success) { status.textContent = result.error; status.hidden = false; }
        return result.success;
    } catch (_) { status.textContent = 'Could not delete this reminder. It is still scheduled; try again.'; status.hidden = false; return false; }
    finally { button.disabled = false; }
}
async function onSaveReminder() {
    if (savingReminder) return;
    const formRevision = reminderFormRevision;
    const reminder = reminderTextInput.value.trim();
    const reminderDate = new Date(reminderTimeInput.value);
    const status = document.getElementById('reminder-save-error');
    const showError = message => { status.textContent = message; status.hidden = false; };
    if (!reminder || !Number.isFinite(reminderDate.getTime())) {
        showError('Enter a reminder and a valid date and time.'); return;
    }
    if (reminderDate.getTime() <= Date.now()) {
        showError('Choose a time in the future.'); reminderTimeInput.focus(); return;
    }
    const wasEditing = !!editingReminderId;
    const reminderPayload = { reminder, reminderTime: reminderDate.toISOString(),
        sound: editingReminderSound || reminderSoundSettingInput.value || 'notify.wav',
        recurrence: document.getElementById('reminder-repeat').value || null };
    savingReminder = true; reminderSaveBtn.disabled = true; reminderSaveBtn.textContent = 'Saving...';
    document.getElementById('reminder-repeat').disabled = true;
    reminderCancelBtn.disabled = true; reminderTextInput.disabled = true; reminderTimeInput.disabled = true; status.hidden = true;
    let result;
    try {
        result = await ipcRenderer.invoke(wasEditing ? 'update-reminder' : 'set-reminder',
            wasEditing ? { id: editingReminderId, ...reminderPayload } : reminderPayload);
    } catch (_) { result = { success: false, error: 'Could not save this reminder. Your draft is still here; try again.' }; }
    finally {
        savingReminder = false; reminderSaveBtn.textContent = 'Save';
        document.getElementById('reminder-repeat').disabled = false;
        reminderCancelBtn.disabled = false; reminderTextInput.disabled = false; reminderTimeInput.disabled = false;
        updateSaveButtonState();
    }
    if (formRevision !== reminderFormRevision) return;
    if (!result.success) { showError(result.error || 'Could not save this reminder. Your draft is still here; try again.'); return; }
    // Navigation during the write must not reopen a form or interrupt another page.
    if (!reminderContainer.classList.contains('visible')) return;
    editingReminderId = null; editingReminderSound = null;
    reminderContainer.classList.remove('visible'); animationContainer.style.display = 'block'; contentWrapper.style.display = 'block';
    searchBar.disabled = false; searchBar.placeholder = 'Type here to search'; clearSearchBar(); setStateActive();
    const text = wasEditing ? "Done. I've updated your reminder." :
        `OK. I'll remind you to "${reminder}" on ${reminderDate.toLocaleString([], formatDateTimeOptions())}.`;
    displayAndSpeak(text, onActionFinished, {}, false);
}

async function handleOpenApplication(appName, silent = false) {
    const generation = assistantRequestGeneration;
    // Handle special Windows commands
    const specialCommands = {
        'settings': 'ms-settings:',
        'windows settings': 'ms-settings:',
        'windows update': 'ms-settings:windowsupdate',
        'update & security': 'ms-settings:windowsupdate',
        'update and security': 'ms-settings:windowsupdate',
        'control panel': 'control',
        'task manager': 'taskmgr',
        'command prompt': 'cmd',
        'cmd': 'cmd',
        'powershell': 'powershell',
        'notepad': 'notepad',
        'calculator': 'calc',
        'paint': 'mspaint',
        'snipping tool': 'snippingtool',
        'file explorer': 'explorer',
        'explorer': 'explorer'
    };
    
    const appNameLower = appName.toLowerCase();
    if (specialCommands[appNameLower]) {
        const command = specialCommands[appNameLower];
        ipcRenderer.send('run-special-command', command);
        if (!silent) displayAndSpeak(`Opening ${appName}...`, onActionFinished, {}, false);
        else { isBusy = false; setStateIdle(); }
        return;
    }
    
    if (!silent) displayAndSpeak(`Looking for ${appName}...`, onActionFinished, {}, false);

    const apps = await ipcRenderer.invoke('find-application', appName);
    if (generation !== assistantRequestGeneration) return;

    if (apps.length === 0) {
        anim.goToState(AnimationState.THINKING);
        const fallbackResult = await ipcRenderer.invoke('open-application-fallback', appName);
        if (generation !== assistantRequestGeneration) return;
        if (fallbackResult.success) {
            if (!silent) {
                const responseText = `I couldn't find "${appName}" in your Start Menu, but I'm opening it directly.`;
                displayAndSpeak(responseText, onActionFinished, {}, false);
            } else { isBusy = false; setStateIdle(); }
        } else {
            if (!silent) {
                const responseText = `I couldn't open "${appName}". Check that it's installed.`;
                displayAndSpeak(responseText, onActionFinished, {}, true);
            } else { isBusy = false; setStateIdle(); }
        }
    } else if (apps.length === 1) {
        ipcRenderer.send('open-path', apps[0].path, 'open-application');
        if (!silent) {
            const responseText = `Opening ${apps[0].name}...`;
            displayAndSpeak(responseText, onActionFinished, {}, false);
        } else { isBusy = false; setStateIdle(); }
    } else if (silent) {
        ipcRenderer.send('open-path', apps[0].path, 'open-application');
        isBusy = false;
        setStateIdle();
    } else {
        let responseText = "I found a few options. Which one did you mean?";
        
        resultsDisplay.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'fade-in-item';
        p.style.marginBottom = '10px';
        p.textContent = responseText;
        resultsDisplay.appendChild(p);

        apps.slice(0, 5).forEach((app, index) => {
            const btn = document.createElement('button');
            btn.textContent = app.name;
            btn.className = 'choice-button fade-in-item';
            btn.onclick = () => {
                ipcRenderer.send('open-path', app.path, 'open-application');
                displayAndSpeak(`Opening ${app.name}...`, onActionFinished, {}, false);
            };
            resultsDisplay.appendChild(btn);
        });

        anim.goToState(AnimationState.SPEAKING_BEGIN);
        speak(responseText, onActionFinished);
        showWebLink();
    }
}

async function showReminders() {
    const reminders = await ipcRenderer.invoke('get-reminders');
    resultsDisplay.innerHTML = '';

    let responseText;
    if (reminders.length === 0) {
        responseText = "You don't have any reminders set.";
        const p = document.createElement('p');
        p.className = 'fade-in-item';
        p.textContent = responseText;
        resultsDisplay.appendChild(p);
    } else {
        responseText = "Here are your reminders.";
        const p = document.createElement('p');
        p.className = 'fade-in-item reminder-list-title';
        p.textContent = responseText;
        resultsDisplay.appendChild(p);

        const list = document.createElement('div');
        list.className = 'reminder-list';
        resultsDisplay.appendChild(list);

        reminders.sort((a, b) => new Date(a.time) - new Date(b.time));

        reminders.forEach(reminder => {
            const item = document.createElement('div');
            item.className = 'reminder-list-item fade-in-item';

            const textContainer = document.createElement('div');
            textContainer.className = 'reminder-text-container';

            const text = document.createElement('span');
            text.textContent = reminder.text;
            text.className = 'reminder-text';

            const time = document.createElement('span');
            const reminderDate = new Date(reminder.time);
            time.textContent = reminderDate.toLocaleString([], formatReminderListOptions()) + (reminder.recurrence ? ` · ${reminder.recurrence}` : '');
            time.className = 'reminder-time';

            textContainer.appendChild(text);
            textContainer.appendChild(time);

            const actions = document.createElement('div');
            actions.className = 'reminder-item-actions';

            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'reminder-action-btn';
            editBtn.onclick = () => {
                setStateActive();
                showReminderUI({
                    initialText: reminder.text,
                    initialTime: formatDateTimeForInput(reminderDate),
                    // Use the sound property if available, otherwise default to settings
                    initialSound: reminder.sound || reminderSound || "notify.wav", initialRecurrence: reminder.recurrence,
                    id: reminder.id
                });
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'reminder-action-btn delete';
            deleteBtn.setAttribute('aria-label', 'Delete ' + reminder.text);
            const deletionStatus = document.createElement('p'); deletionStatus.setAttribute('role','status'); deletionStatus.hidden = true; item.appendChild(deletionStatus);
            deleteBtn.onclick = async () => { if (await deleteReminder(reminder.id, deleteBtn, deletionStatus)) await showReminders(); };

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            item.appendChild(textContainer);
            item.appendChild(actions);
            list.appendChild(item);
        });
    }

    // For interactive lists like reminders, speak but keep the UI active for interaction
    anim.goToState(AnimationState.SPEAKING_BEGIN);
    speak(responseText, () => {
        isBusy = false;
        searchBar.disabled = false;
        searchBar.placeholder = 'Type here to search';
        anim.goToState(AnimationState.SPEAKING_END, { nextState: AnimationState.TRANSITION_TO_IDLE });
    });
}

function stopTimerPanelInterval() {
    if (timerPanelInterval) {
        clearInterval(timerPanelInterval);
        timerPanelInterval = null;
    }
}

async function cancelActiveTimer(id = activeTimerId) {
    if (id === null) return false;
    const result = await ipcRenderer.invoke('cancel-timer',id);
    if (!result.success) { displayAndSpeak(result.error,onActionFinished,{},true);return false; }
    if(id===activeTimerId) { activeTimerId=null; timerEndTime=null; timerDuration=null; activeTimerLabel=null; clearInterval(timerCountdownInterval);timerCountdownInterval=null; }
    return true;
}
async function cancelNamedTimer(name) {
    const timers=await ipcRenderer.invoke('get-timers');
    const matches=name?timers.filter(t=>t.label.toLowerCase()===name.toLowerCase().trim()):timers;
    if(matches.length!==1) { if(!matches.length)displayAndSpeak("I couldn't find that timer.",onActionFinished);else await showTimersPanel();return; }
    if(await cancelActiveTimer(matches[0].id))displayAndSpeak('Timer cancelled.',onActionFinished);
}
async function showTimersPanel({announce=true} = {}) {
    const generation=assistantRequestGeneration;
    stopTimerPanelInterval();
    const timers=await ipcRenderer.invoke('get-timers');
    if(generation!==assistantRequestGeneration)return;
    resultsDisplay.replaceChildren();
    const title=document.createElement('p');title.className='reminder-list-title';title.textContent=timers.length?'Your timers':"You don't have any timers running.";resultsDisplay.append(title);
    const list=document.createElement('div');list.id='timer-list';list.className='reminder-list';resultsDisplay.append(list);
    const labels=[];
    for(const timer of timers) {
      const row=document.createElement('div');row.className='reminder-list-item';
      const body=document.createElement('div');body.className='reminder-text-container';
      const name=document.createElement('span');name.className='reminder-text';name.textContent=timer.label||'Timer';
      const time=document.createElement('span');time.className='reminder-time';body.append(name,time);
      const cancel=document.createElement('button');cancel.className='reminder-action-btn delete';cancel.textContent='Cancel';cancel.setAttribute('aria-label','Cancel '+name.textContent);
      cancel.onclick=async()=>{cancel.disabled=true;if(await cancelActiveTimer(timer.id))await showTimersPanel();else cancel.disabled=false;};
      row.append(body,cancel);list.append(row);labels.push({time,endTime:timer.endTime});
    }
    const update=()=>{for(const {time,endTime} of labels){const seconds=Math.max(0,Math.ceil((endTime-Date.now())/1000));time.textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`; } if(!list.isConnected)stopTimerPanelInterval();};
    update();if(timers.length)timerPanelInterval=setInterval(update,500);
    if(announce) { anim.goToState(AnimationState.SPEAKING_BEGIN);speak(timers.length?`You have ${timers.length} timer${timers.length===1?'':'s'} running.`:"You don't have any timers running.",onActionFinished); }
}

// Local productivity commands share the same deterministic routing for typing and speech.
async function handleListCommand(query) {
    const generation=assistantRequestGeneration;
    const command=CortanaLists.parse(query);if(!command)return;
    const previous=structuredClone(notebookData);
    const result=CortanaLists.apply(notebookData,command,()=>crypto.randomUUID());
    if(result.changed && !await persistNotebook()) { notebookData=previous;renderTodos();displayAndSpeak("I couldn't save that list change. Please try again.",onActionFinished,{},true);return; }
    if(generation!==assistantRequestGeneration)return;
    if(result.listId)selectedListId=result.listId;
    renderTodos();
    displayAndSpeak(result.message,onActionFinished,{},!result.success);
    if(result.listId) {
      const button=document.createElement('button');button.className='settings-button';button.textContent='Open list';button.onclick=()=>openNotebook('todos');resultsDisplay.append(button);
    }
}
function parseRecurringRequest(text) {
    const match=text.trim().match(/^(.+?) (?:every (day|weekday|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily|on weekdays) at (.+)$/i);
    if(!match)return null;
    const frequency=(match[2]||(/on weekdays/i.test(match[0])?'weekday':'day')).toLowerCase();
    let date=parseDateTime((['day','weekday'].includes(frequency)?'':frequency+' at ')+match[3]);
    if(!date)return null;
    if(frequency==='weekday')while([0,6].includes(date.getDay()))date.setDate(date.getDate()+1);
    return {reminderText:match[1],timeText:formatDateTimeForInput(date),recurrence:frequency==='day'?'daily':frequency==='weekday'?'weekdays':'weekly'};
}
async function showMyDay() {
    openNotebook('day');
    isBusy = false;
    return renderMyDay({ announce: true });
}
let myDayGeneration = 0;
async function renderMyDay({ announce = false } = {}) {
    const generation = ++myDayGeneration;
    const request = assistantRequestGeneration;
    const current = () => generation === myDayGeneration && request === assistantRequestGeneration &&
        notebookPage === 'day' && document.getElementById('notebook-sidebar').classList.contains('visible');
    const content = document.getElementById('notebook-day-content');
    const status = document.getElementById('notebook-day-status');
    const name = notebookData.profile?.name.trim();
    document.getElementById('notebook-day-greeting').textContent = name ? `Here's your day, ${name}` : "Here's your day";
    document.getElementById('notebook-day-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    content.replaceChildren();
    status.textContent = 'Getting your day ready...';
    try {
        const [reminders, timers] = await Promise.all([ipcRenderer.invoke('get-reminders'), ipcRenderer.invoke('get-timers')]);
        if (!current()) return;
        const end = new Date(); end.setHours(23, 59, 59, 999);
        const due = reminders.filter(r => Date.parse(r.time) <= end.getTime()).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
        const pending = CortanaLists.all(notebookData).flatMap(list => list.items.filter(item => !item.done).map(item => ({ list: list.name, text: item.text })));
        status.textContent = '';
        for (const [title, items, empty] of [
            ['Today’s reminders', due.map(r => ({ text: r.text, detail: new Date(r.time).toLocaleTimeString([], formatTimeOptions()) })), 'No reminders today.'],
            ['Things to do', pending.map(item => ({ text: item.text, detail: item.list })), 'All clear.'],
            ['Timers', timers.map(t => ({ text: t.label || 'Timer', detail: `${Math.ceil(t.remaining / 60000)} min remaining` })), 'No timers running.']
        ]) {
            const section = document.createElement('section'); section.className = 'notebook-summary-section';
            const heading = document.createElement('h2'); heading.textContent = title; section.append(heading);
            for (const item of items) {
                const row = document.createElement('div'); row.className = 'notebook-summary-row';
                const text = document.createElement('span'); text.textContent = item.text;
                const detail = document.createElement('span'); detail.className = 'notebook-secondary'; detail.textContent = item.detail;
                row.append(text, detail); section.append(row);
            }
            if (!items.length) { const text = document.createElement('p'); text.className = 'notebook-secondary'; text.textContent = empty; section.append(text); }
            content.append(section);
        }
        if (announce) speak(`${name ? name + "'s day" : 'Your day'}: ${due.length} reminder${due.length === 1 ? '' : 's'} today, ${pending.length} item${pending.length === 1 ? '' : 's'} to do, and ${timers.length} running timer${timers.length === 1 ? '' : 's'}.`);
    } catch (_) {
        if (current()) status.textContent = "I couldn't load your day. Open My day again to try once more.";
    }
}
async function rememberName(name) {
    const previous=notebookData.profile.name;
    notebookData.profile.name=name.trim();
    if(await persistNotebook()){document.getElementById('notebook-name').value=notebookData.profile.name;displayAndSpeak(`I'll call you ${notebookData.profile.name}. Try “my day” for your personal summary.`,onActionFinished);}
    else {notebookData.profile.name=previous;displayAndSpeak("I couldn't save your name. Please try again.",onActionFinished,{},true);}
}

const priorityCommands = [
    {regex:/^(?:create|make)(?: a| my)? .+ list[.!?]*$|^add .+ to (?:my |the )?.+ list[.!?]*$|^(?:show|read|open)(?: me)? (?:my |the )?.+ list[.!?]*$|^(?:mark|check off) .+ (?:on|in|from) (?:my |the )?.+ list[.!?]*$|^remove .+ from (?:my |the )?.+ list[.!?]*$/i,handler:(match,original)=>handleListCommand(original||match[0])},
    {regex:/^(?:my day|show my day|what(?:'s| is) on my (?:day|agenda)|daily (?:summary|briefing))[.!?]*$/i,handler:showMyDay},
    {regex:/^(?:what(?:'s| is) my name|who am i)[?!.]*$/i,handler:()=>displayAndSpeak(notebookData.profile?.name.trim()?`You're ${notebookData.profile.name.trim()}.`:"You haven't told me your name yet. Say “call me” followed by your name.",onActionFinished)},
    {regex:/^call me (.{1,80})$/i,handler:(match,original)=>rememberName((original||match[0]).replace(/^call me /i,''))},
    { regex: /^(?:open|show)(?: my)? (desktop|documents|downloads|pictures|music|videos|home)(?: folder)?$/i,
      handler: async match => {
        const result = await ipcRenderer.invoke('open-local-folder', match[1].toLowerCase());
        displayAndSpeak(result.success ? `Opening ${match[1]}.` : result.error, onActionFinished, {}, !result.success);
      } },
    { regex: /^(?:open |show |my )?(?:notebook|to[ -]?do(?: list)?)$/i,
      handler: () => { isBusy = false; openNotebook(); } },
    { regex: /^(?:open|show)(?: my)? (notes|lists)$/i,
      handler: match => { isBusy = false; openNotebook(); selectNotebookPage(match[1].toLowerCase() === 'notes' ? 'notes' : 'todos'); } },
    {
        regex: /^(drum ?roll)(,)?( please)?(!|\.|\?)?$/i,
        handler: () => {
            const playDrumroll = () => {
                drumrollSound.play();
                drumrollSound.onended = onActionFinished;
            };
            displayAndSpeak("Here goes nothing!", playDrumroll, {}, false);
        }
    },
    {
        regex: /(show|what are|list|do i have any|my) reminders/i,
        handler: () => {
            showReminders();
        }
    },
    {
        regex: /^(?:remind me(?: to)?|create a reminder(?: for)?)\s(.+)/i,
        handler: (match, originalQuery) => {
            const source = (originalQuery || match[0]).trim();
            const stripped = source.replace(
                /^(?:remind me(?: to)?|create a reminder(?: for)?)\s+/i,
                ''
            );
            const recurring = parseRecurringRequest(stripped);
            const { reminderText, timeText } = recurring || parseReminderRequest(stripped);
            showReminderUI({ initialText: reminderText, initialTime: timeText, initialRecurrence: recurring?.recurrence });
        }
    },
    {
        regex: /^(set a reminder|create a reminder|remind me)$/i,
        handler: () => {
            displayAndSpeak("Sure, what would you like me to remind you about?", () => {
                showReminderUI({});
            }, {}, false);
        }
    },
    {
        regex: CortanaWeather.commandPattern,
        handler: (_match, originalQuery) => {
            const request = CortanaWeather.parse(originalQuery || _match[0]);
            if (request?.unsupportedPeriod) {
                displayAndSpeak("I can check the current weather, but I don't have a forecast for later yet. Try “my weather” or “weather in Chicago”.", onActionFinished, {}, false);
                return;
            }
            const location = request?.location === null ? notebookData.profile?.weatherCity?.trim() : request?.location;
            if (location) { getWeather(location); return; }
            displayAndSpeak("Which city should I check? Try “weather in Chicago”. You can save a city in Settings > Search for “my weather”.", onActionFinished, {}, false);
        }
    },
];

async function controlMedia(action, confirmation, level) {
    const generation = assistantRequestGeneration;
    try {
        const result = await ipcRenderer.invoke('media-control', level===undefined?action:{action,level});
        if (generation !== assistantRequestGeneration) return;
        displayAndSpeak(result.success ? confirmation : (result.error || "I couldn't control your media or volume. Try again."), onActionFinished, {}, !result.success);
    } catch (_) {
        if (generation !== assistantRequestGeneration) return;
        displayAndSpeak("I couldn't control your media or volume. Try again.", onActionFinished, {}, true);
    }
}

const commands = [
    {regex:/^(?:set|turn)(?: the)? volume (?:to )?(\d{1,3})(?: ?%| percent)?[.!]*$/i,handler:match=>controlMedia('setvolume',`Volume set to ${match[1]} percent.`,Number(match[1]))},
    {regex:/^(?:what(?:'s| is)(?: the| my)? volume|volume status)[?!.]*$/i,handler:async()=>{const generation=assistantRequestGeneration;const state=await ipcRenderer.invoke('media-state');if(generation!==assistantRequestGeneration)return;displayAndSpeak(state.success?`Volume is ${Math.round(state.volume)} percent${state.muted?', muted':''}.`:state.error,onActionFinished,{},!state.success);}},
    ...priorityCommands,
    {
        regex: /(?:what's|what is) (?:the date|today's date)|what day is it|what's today/i,
        handler: () => {
            getDate();
        }
    },
    {
        regex: /(tell me a|give me a|say a) joke|make me laugh/i,
        handler: () => {
            const joke = getJoke();
            displayAndSpeak(joke, onActionFinished, { showWebLink: true }, false);
        }
    },
    {
        regex: /retiled/i,
        handler: () => {
            const response = "Retiled? You mean that one project that gives discontinued services like me a second life? Noble work.";
            displayAndSpeak(response, onActionFinished, { showWebLink: true }, false);
        }
    },
    {
        regex: /(what's your|what) version|app version/i,
        handler: () => {
            getAppVersion();
        }
    },
    {
        regex: /who (are you|made you|created you|built you)\??/i,
        handler: () => {
            const response = "I'm Cortana. I'm a remake of the 1607 version from Windows 10, brought back by BlueySoft.";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /are you official\??/i,
        handler: () => {
            const response = "No — I'm a third-party remake by BlueySoft, not affiliated with Microsoft. I'm here because someone had fond memories of me.";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /^(?:what can you do|what are your skills|help|what can i ask you)[!.?]*$/i,
        handler: () => {
            const response = "Try “my day”, “create a shopping list”, “add milk to my shopping list”, “remind me to stretch every day at 3 pm”, or “set a timer for 5 minutes named tea”. I can tell you the time, date, and weather; do math and unit conversions; set reminders, timers, and alarms; control volume; open apps; prepare calendar events; look things up; tell jokes; and search the web.";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /marry me\??/i,
        handler: () => {
            const response = "I'm flattered, but I don't think that's in the cards for us.";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /(hide|dispose of) a body\??/i,
        handler: () => {
            const response = "I'm afraid I can't help with that.";
            displayAndSpeak(response, onActionFinished, {}, true);
        }
    },
    {
        regex: new RegExp(
            `^(?:set|start) a timer (?:for )?(?:about )?(\\d+|(?:${Object.keys(temporalNumberWords).join('|')})(?:[\\s-](?:${Object.keys(temporalNumberWords).join('|')}))*)\\s*(minute|min|second|sec|hour|hr)s?(?: (?:named|called) (.{1,128}))?\\s*$`,
            'i'
        ),
        handler: (match) => {
            const value = /^\d+$/.test(match[1])
                ? parseInt(match[1], 10)
                : parseTemporalNumberWords(match[1]);
            const unit = match[2].toLowerCase();
            let ms;
            if (unit.startsWith('min')) ms = value * 60000;
            else if (unit.startsWith('sec')) ms = value * 1000;
            else if (unit.startsWith('hour') || unit.startsWith('hr')) ms = value * 3600000;
            else { displayAndSpeak("Sorry, I didn't understand that time unit.", onActionFinished, {}, true); return; }
            startTimer(value, unit, ms, match[3] || '');
        }
    },
    {
        regex: /^(?:cancel|stop|delete)(?: the| my)? (?:(.+?) )?timer$/i,
        handler: match => cancelNamedTimer(match[1] || ''),
    },
    {
        regex: /^\s*(?:(?:what|which)\s+timers?\s+do\s+i\s+have|what\s+(?:are|is)\s+my\s+timers?|what'?s\s+my\s+timers?|my\s+timers?|show\s+(?:my\s+)?timers?|list\s+(?:my\s+)?timers?|(?:active|current)\s+timers?|check\s+(?:my\s+)?timers?|how\s+long\s+is\s+left(?:\s+on\s+(?:the\s+|my\s+)?timers?)?|how\s+much\s+time\s+(?:is\s+)?left|timers?\s+status)\s*[!.?]*\s*$/i,
        handler: () => {
            showTimersPanel();
        }
    },
    {
        regex: /^how much time (?:is )?left(?: on the timer)?\??$/i,
        handler: () => {
            if (activeTimerId === null) {
                displayAndSpeak("There's no timer running.", onActionFinished, {}, false);
                return;
            }
            ipcRenderer.invoke('get-timer-remaining', activeTimerId).then(({ remaining }) => {
                const mins = Math.floor(remaining / 60000);
                const secs = Math.floor((remaining % 60000) / 1000);
                displayAndSpeak(
                    `${mins} minute${mins !== 1 ? 's' : ''} and ${secs} second${secs !== 1 ? 's' : ''} remaining.`,
                    onActionFinished, {}, false
                );
            });
        }
    },
    {
        regex: /^(?:set|create) an? alarm (?:for |at )?(.+)/i,
        handler: (match) => {
            const alarmText = match[1].trim().replace(/[!.?]+$/, '');
            const parsedDate = parseDateTime(alarmText);
            if (!parsedDate) {
                displayAndSpeak(`Sorry, I couldn't understand "${alarmText}". Try something like "set an alarm for 7 am".`, onActionFinished, {}, true);
                return;
            }
            const friendlyTime = parsedDate.toLocaleString([], formatDateTimeOptions());
            anim.goToState(AnimationState.THINKING);
            ipcRenderer.invoke('set-reminder', {
                reminder: 'Alarm',
                reminderTime: parsedDate.toISOString(),
                sound: 'notify.wav'
            }).then(result => {
                if (result && result.success) {
                    displayAndSpeak(`Alarm set for ${friendlyTime}.`, onActionFinished, {}, false);
                } else {
                    displayAndSpeak(
                        (result && result.error) || "Sorry, I couldn't set that alarm.",
                        onActionFinished,
                        {},
                        true
                    );
                }
            }).catch((error) => {
                console.error('Failed to set alarm:', error);
                displayAndSpeak("Sorry, I couldn't set that alarm.", onActionFinished, {}, true);
            });
        }
    },
    {
        regex: /^(mute|unmute)( volume| sound| system)?(!|\.)?$/i,
        handler: match => {
            return controlMedia(match[1].toLowerCase(),match[1].toLowerCase()==='mute'?'Sound muted.':'Sound unmuted.');
        }
    },
    {
        regex: /^(volume|turn(?: the)? volume) (up|increase|raise|louder)( please)?(!|\.)?$/i,
        handler: () => {
            return controlMedia('volup', 'Got it.');
        }
    },
    {
        regex: /^(volume|turn(?: the)? volume) (down|decrease|lower|quieter)( please)?(!|\.)?$/i,
        handler: () => {
            return controlMedia('voldown', 'Sure thing.');
        }
    },
    {
        regex: /^(play|pause|unpause|resume)(?: music| media| audio| song| track)?$/i,
        handler: match => {
            const action=match[1].toLowerCase()==='pause'?'pause':'play';return controlMedia(action,action==='pause'?'Paused.':'Playing.');
        }
    },
    {
        regex: /^(?:next|skip)(?: track| song| music)?$/i,
        handler: () => {
            return controlMedia('next', 'Skipping ahead.');
        }
    },
    {
        regex: /^(?:previous|prev)(?: track| song| music)?$/i,
        handler: () => {
            return controlMedia('prev', 'Going back.');
        }
    },
    {
        regex: /^stop(?: media| music| audio| track| song)?$/i,
        handler: () => {
            return controlMedia('stop', 'Stopped.');
        }
    },
    {
        regex: /^(?:lock|lock my|lock the) (?:computer|pc|screen|laptop|device)$/i,
        handler: () => {
            ipcRenderer.send('run-command', 'rundll32.exe user32.dll,LockWorkStation');
            displayAndSpeak("Locking your PC.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^(?:shut ?down|turn off)(?: my| the)? (?:computer|pc|laptop|device)$/i,
        handler: () => {
            displayAndSpeak("Are you sure you want to shut down? Say 'yes, shut down' to confirm.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^yes[,.]?\s+shut\s*down$/i,
        handler: () => {
            ipcRenderer.send('run-command', 'shutdown /s /t 10');
            displayAndSpeak("Shutting down in 10 seconds.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^(?:restart|reboot)(?: my| the)? (?:computer|pc|laptop|device)$/i,
        handler: () => {
            displayAndSpeak("Are you sure you want to restart? Say 'yes, restart' to confirm.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^yes[,.]?\s+restart$/i,
        handler: () => {
            ipcRenderer.send('run-command', 'shutdown /r /t 10');
            displayAndSpeak("Restarting in 10 seconds.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^(?:sign|log) ?out$/i,
        handler: () => {
            ipcRenderer.send('run-command', 'shutdown /l');
            displayAndSpeak("Signing out.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^(?:convert )?([+-]?\d+(?:\.\d+)?)\s*(celsius|c|fahrenheit|f|kelvin|k)\s+(?:to|in)\s+(celsius|c|fahrenheit|f|kelvin|k)\s*$/i,
        handler: (match) => {
            const value = parseFloat(match[1]);
            const from = match[2].toLowerCase();
            const to = match[3].toLowerCase();
            let result;
            const f = from[0];
            const t = to[0];
            if (f === t) { result = value; }
            else if (f === 'c' && t === 'f') { result = value * 9/5 + 32; }
            else if (f === 'f' && t === 'c') { result = (value - 32) * 5/9; }
            else if (f === 'c' && t === 'k') { result = value + 273.15; }
            else if (f === 'k' && t === 'c') { result = value - 273.15; }
            else if (f === 'f' && t === 'k') { result = (value - 32) * 5/9 + 273.15; }
            else if (f === 'k' && t === 'f') { result = (value - 273.15) * 9/5 + 32; }
            else { displayAndSpeak("Sorry, I can't convert between those units.", onActionFinished, {}, true); return; }
            const fromLabel = f === 'k' ? 'K' : `°${f.toUpperCase()}`;
            const toLabel = t === 'k' ? 'K' : `°${t.toUpperCase()}`;
            displayAndSpeak(`${value}${fromLabel} is ${result.toFixed(1)}${toLabel}.`, onActionFinished, { showWebLink: true }, false);
        }
    },
    {
        regex: /^(?:convert |how many )?(\d+(?:\.\d+)?)\s*(millimeters|millimeter|mm|centimeters|centimeter|cm|meters|meter|m|kilometers|kilometer|km|inches|inch|in|feet|foot|ft|yards|yard|yd|miles|mile|mi|milligrams|milligram|mg|grams|gram|g|kilograms|kilogram|kg|ounces|ounce|oz|pounds|pound|lb|lbs|milliliters|milliliter|ml|liters|liter|litre|l|gallons|gallon|gal)\s+(?:to|in|into)\s+(millimeters|millimeter|mm|centimeters|centimeter|cm|meters|meter|m|kilometers|kilometer|km|inches|inch|in|feet|foot|ft|yards|yard|yd|miles|mile|mi|milligrams|milligram|mg|grams|gram|g|kilograms|kilogram|kg|ounces|ounce|oz|pounds|pound|lb|lbs|milliliters|milliliter|ml|liters|liter|litre|l|gallons|gallon|gal)\s*$/i,
        handler: (match) => {
            const value = parseFloat(match[1]);
            const from = normalizeUnit(match[2]);
            const to = normalizeUnit(match[3]);
            const result = convertUnit(value, from, to);
            if (result === null) {
                displayAndSpeak("Sorry, I can't convert between those units.", onActionFinished, {}, true);
                return;
            }
            displayAndSpeak(`${value} ${formatUnitLabel(value, from)} is ${result.toFixed(2)} ${formatUnitLabel(result, to)}.`, onActionFinished, { showWebLink: true }, false);
        }
    },
    {
        regex: /^(?:schedule|create|add|make) (?:an? |a )?(?:event|appointment|calendar event|meeting|reminder|call)(?: for| about|:)?\s+(.+)/i,
        handler: (match) => {
            const generation = assistantRequestGeneration;
            const full = match[1].trim();
            const reminderRequest = parseReminderRequest(full);
            const timeMatch = full.match(/(.+?)\s+(?:for|at|on)\s+(.+)/i);
            let title, timeText, parsedDate;
            if (reminderRequest.timeText && reminderRequest.reminderText) {
                title = reminderRequest.reminderText.replace(/\s+(?:for|at|on)$/i, '');
                parsedDate = new Date(reminderRequest.timeText);
            } else if (timeMatch) {
                title = timeMatch[1].trim();
                timeText = timeMatch[2].trim();
            } else {
                title = full;
                timeText = null;
            }
            if (!parsedDate && !timeText) {
                displayAndSpeak("What time should I schedule that for?", onActionFinished, {}, false);
                return;
            }
            parsedDate = parsedDate || parseDateTime(timeText);
            if (!parsedDate) {
                displayAndSpeak(`Sorry, I couldn't understand "${timeText}". Try "schedule meeting for tomorrow at 3 pm".`, onActionFinished, {}, true);
                return;
            }
            ipcRenderer.invoke('create-calendar-event', { title, dateTime: parsedDate.toISOString() }).then(result => {
                if (generation !== assistantRequestGeneration) return;
                if (result.success) {
                    const friendlyTime = parsedDate.toLocaleString([], formatDateTimeOptions());
                    displayAndSpeak(`I've opened "${title}" for ${friendlyTime} in your calendar app. Save it there to add it to your calendar.`, onActionFinished, {}, false);
                } else {
                    displayAndSpeak(result.error || "I couldn't prepare that calendar event. Try again.", onActionFinished, {}, true);
                }
            }).catch(() => {
                if (generation === assistantRequestGeneration) displayAndSpeak("I couldn't prepare that calendar event. Try again.", onActionFinished, {}, true);
            });
        }
    },
    {
        regex: /^(open|launch|start|run) (.+)/i,
        handler: (match) => {
            handleOpenApplication(match[2].trim());
        }
    },
    {
        regex: /^(?:what is |tell me about |who (?:is|was) |define )(.+)$|^what does (.+) mean\??$/i,
        handler: (match) => {
            const generation = assistantRequestGeneration;
            const topic = (match[1] || match[2] || '').trim().replace(/[?!.]+$/, '');
            if (!navigator.onLine) {
                displayAndSpeak('Wikipedia needs an internet connection. You can still use local commands and your Notebook.', onActionFinished);
                return;
            }
            anim.goToState(AnimationState.THINKING);
            resultsDisplay.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'fade-in-item';
            p.textContent = `Looking up "${topic}"...`;
            resultsDisplay.appendChild(p);
            ipcRenderer.invoke('wikipedia-lookup', topic).then(result => {
                if (generation !== assistantRequestGeneration) return;
                if (result.success) {
                    resultsDisplay.innerHTML = '';
                    const header = document.createElement('p');
                    header.className = 'fade-in-item';
                    header.style.fontWeight = 'bold';
                    header.textContent = result.title;
                    resultsDisplay.appendChild(header);
                    const body = document.createElement('p');
                    body.className = 'fade-in-item';
                    body.textContent = result.extract;
                    resultsDisplay.appendChild(body);
                    const link = document.createElement('a');
                    link.className = 'search-result-title fade-in-item';
                    link.textContent = 'Read more on Wikipedia';
                    link.href = '#';
                    link.addEventListener('click', (e) => { e.preventDefault(); ipcRenderer.send('open-external-link', result.url); });
                    resultsDisplay.appendChild(link);
                    showWebLink();
                    anim.goToState(AnimationState.SPEAKING_BEGIN);
                    speak(result.extract, onActionFinished);
                } else {
                    displayAndSpeak(result.error || "Sorry, something went wrong. Try again in a little bit.", onActionFinished, {}, true);
                }
            }).catch(() => {
                if (generation !== assistantRequestGeneration) return;
                performWebSearch(topic);
            });
        }
    },
    {
        regex: /^(what's up|sup|how's it going|how are you)\??$/i,
        handler: () => {
            const responses = [
                "Not much. What can I do for you?",
                "Doing well. What's on your mind?",
                "All good here. What can I help with?"
            ];
            const response = responses[Math.floor(Math.random() * responses.length)];
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /^(thanks|thank you|thx|ty)(.+)?(!|\.)?$/i,
        handler: () => {
            const responses = ["You're welcome.", "Happy to help.", "Of course."];
            const response = responses[Math.floor(Math.random() * responses.length)];
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /^(bye|goodbye|see ya|later|cya|see you later)(!|\.)?$/i,
        handler: () => {
            const responses = ["Goodbye.", "See you later.", "Talk to you later."];
            const response = responses[Math.floor(Math.random() * responses.length)];
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /^(?:hello|hi|hey),?\s+world\s*[!.?]*$/i,
        handler: () => {
            const response = "Hello world.";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /^(hello|hi|hey|yo|heya|hey there)(!|\.)?$/i,
        handler: () => {
            const hour = new Date().getHours();
            const responses = [
                "Hello there. What can I do for you?",
                "Hi. What's on your mind?",
                "Hey. What can I do for you?",
            ];
            if (hour < 12) responses.push("Good morning!");
            else if (hour < 17) responses.push("Hello there.");
            else responses.push("Good evening.");
            const response = responses[Math.floor(Math.random() * responses.length)];
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    }
];

// Helper function to check if a command text would match any command handler
function wouldCommandMatch(text) {
    const lowerText = text.toLowerCase();
    
    // Check if it matches any custom action
    const customAction = customActions.find(a => {
        if (!a.trigger) return false;
        const triggerLower = a.trigger.toLowerCase();
        if (lowerText === triggerLower) return true;
        const regex = new RegExp(`\\b${triggerLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        return regex.test(lowerText);
    });
    if (customAction) return true;
    
    if (matchAssistantSkill(lowerText)) return true;

    // Check if it matches any built-in command
    for (const command of commands) {
        if (lowerText.match(command.regex)) {
            return true;
        }
    }
    
    return false;
}

async function startTimer(value, unit, ms, name = '') {
    if (!Number.isFinite(ms) || !Number.isSafeInteger(ms) || ms <= 0) {
      displayAndSpeak(
        'Please choose a valid timer duration.',
        onActionFinished,
        {},
        true
      );
      return;
    }
    if (ms > 30 * 24 * 60 * 60 * 1000) {
      displayAndSpeak('Timers can be set for up to 30 days.', onActionFinished, {}, true);
      return;
    }

    if (timerCountdownInterval) {
      clearInterval(timerCountdownInterval);
      timerCountdownInterval = null;
    }
    stopTimerPanelInterval();

    const label = name.trim();
    
    anim.goToState(AnimationState.THINKING);
    const result = await ipcRenderer.invoke('start-timer', { ms, label });

    if (!result.success) {
      displayAndSpeak(
        result.error || 'Failed to start timer.',
        onActionFinished,
        {},
        true
      );
      return;
    }

    activeTimerId = result.id;
    timerEndTime = result.endTime;
    timerDuration = ms;
    activeTimerLabel = name || `${value} ${unit}${value !== 1 ? 's' : ''}`;

    anim.goToState(AnimationState.SPEAKING_BEGIN);
    speak(`${name ? name + ': ' : ''}Timer set for ${value} ${unit}${value !== 1 ? 's' : ''}.`, () => {
      if (!timerEndTime) return;
      onActionFinished();
    });

    resultsDisplay.innerHTML = '';
    const timerDisplay = document.createElement('p');
    timerDisplay.className = 'fade-in-item';
    timerDisplay.id = 'timer-display';
    timerDisplay.style.fontSize = '24px';
    timerDisplay.style.textAlign = 'center';
    timerDisplay.style.fontWeight = 'bold';
    resultsDisplay.appendChild(timerDisplay);

    const updateDisplay = async () => {
      if (document.hidden || !windowVisible) return;
      if (activeTimerId === null) return;
      const { remaining, active } =
        await ipcRenderer.invoke('get-timer-remaining', activeTimerId);
      if (!active || remaining <= 0) {
        if (timerCountdownInterval) {
          clearInterval(timerCountdownInterval);
          timerCountdownInterval = null;
        }
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const display = document.getElementById('timer-display');
      if (display) display.textContent =
        `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    updateDisplay();
    timerCountdownInterval = setInterval(updateDisplay, 500);

    isBusy = false;
    searchBar.disabled = false;
    searchBar.placeholder = 'Type here to search';
  }

const UNIT_CONVERSIONS = {
    mm: 0.001, cm: 0.01, m: 1, km: 1000,
    inch: 0.0254, foot: 0.3048, yard: 0.9144, mile: 1609.344,
    mg: 0.001, g: 1, kg: 1000,
    oz: 28.3495, lb: 453.592,
    ml: 1, l: 1000, gal: 3785.41,
};

function normalizeUnit(unit) {
    const u = unit.toLowerCase();
    const map = {
        mm: 'mm', millimeter: 'mm', millimeters: 'mm',
        cm: 'cm', centimeter: 'cm', centimeters: 'cm',
        m: 'm', meter: 'm', meters: 'm',
        km: 'km', kilometer: 'km', kilometers: 'km',
        in: 'inch', inch: 'inch', inches: 'inch',
        ft: 'foot', feet: 'foot', foot: 'foot',
        yd: 'yard', yard: 'yard', yards: 'yard',
        mi: 'mile', mile: 'mile', miles: 'mile',
        mg: 'mg', milligram: 'mg', milligrams: 'mg',
        g: 'g', gram: 'g', grams: 'g',
        kg: 'kg', kilogram: 'kg', kilograms: 'kg',
        oz: 'oz', ounce: 'oz', ounces: 'oz',
        lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
        ml: 'ml', milliliter: 'ml', milliliters: 'ml',
        l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
        gal: 'gal', gallon: 'gal', gallons: 'gal',
    };
    return map[u] || u;
}

function convertUnit(value, from, to) {
    const fromBase = UNIT_CONVERSIONS[from];
    const toBase = UNIT_CONVERSIONS[to];
    if (fromBase === undefined || toBase === undefined) return null;

    const LENGTH = new Set(['mm', 'cm', 'm', 'km', 'inch', 'foot', 'yard', 'mile']);
    const WEIGHT = new Set(['mg', 'g', 'kg', 'oz', 'lb']);
    const VOLUME = new Set(['ml', 'l', 'gal']);

    const sameCategory =
        (LENGTH.has(from) && LENGTH.has(to)) ||
        (WEIGHT.has(from) && WEIGHT.has(to)) ||
        (VOLUME.has(from) && VOLUME.has(to));

    if (!sameCategory) return null;

    return (value * fromBase) / toBase;
}

function formatUnitLabel(rawResult, unit) {
    // Abbreviations do not take a plural suffix: "ms" means milliseconds.
    if (['mm', 'cm', 'm', 'km', 'mg', 'g', 'kg', 'oz', 'lb', 'ml', 'l', 'gal'].includes(unit)) return unit;
    const displayed = Number(Number(rawResult).toFixed(2));
    if (Math.abs(displayed) === 1) return unit;

    const pluralMap = {
        inch: 'inches',
        foot: 'feet',
    };
    return pluralMap[unit] || `${unit}s`;
}

let assistantRequestGeneration = 0;
function processQuery(query) {
    ++assistantRequestGeneration;
    webLinkContainer.style.display = 'none';
    webLinkContainer.style.opacity = '0';
    resultsDisplay.innerHTML = '';
    const lowerCaseQuery = query.toLowerCase();

    // Check for custom actions with exact match or word boundary matching
    // This prevents false triggers (e.g., "open chrome" won't trigger a "chrome" custom action)
    const customAction = customActions.find(a => {
        if (!a.trigger) return false;
        const triggerLower = a.trigger.toLowerCase();
        if (lowerCaseQuery === triggerLower) return true;
        // Check if trigger appears as a complete word/phrase
        const regex = new RegExp(`\\b${triggerLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        return regex.test(lowerCaseQuery);
    });
    if (customAction && customAction.actions.length > 0) {
        executeActionSequence(customAction.actions);
        return;
    }

    const matchedSkill = matchAssistantSkill(query);
    if (matchedSkill) {
        executeAssistantSkill(matchedSkill);
        return;
    }

    for (const command of commands) {
        const match = query.match(command.regex);
        if (match) {
            command.handler(match, query);
            return;
        }
    }

    if (aiEnabled && (navigator.onLine || isLoopback(aiApiUrl))) {
        anim.goToState(AnimationState.THINKING);
        resultsDisplay.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'fade-in-item';
        p.textContent = 'Thinking...';
        resultsDisplay.appendChild(p);
        requestAIAnswer(query);
        return;
    }

    performWebSearch(query);
}

function requestAIAnswer(query) {
    const generation = ++assistantRequestGeneration;
    return ipcRenderer.invoke('ask-openai', query).then(result => {
        if (generation !== assistantRequestGeneration) return;
        displayAndSpeak(result.success ? result.text : result.error || "I couldn't get an answer from your AI provider. Try again.", onActionFinished, {}, !result.success);
    }).catch(() => {
        if (generation !== assistantRequestGeneration) return;
        displayAndSpeak("I couldn't get an answer from your AI provider. Try again.", onActionFinished, {}, true);
    });
}

function onSearch() {
    if (isBusy) return;

    const query = searchBar.value.trim();
    if (!query) return;

    isBusy = true;
    lastQuery = query;

    setStateActive();
    searchBar.blur();
    clearTimeout(blurCleanupTimer);
    clearSearchBar();
    resultsDisplay.innerHTML = '';

    requestSound.currentTime = 0;
    requestSound.play();
    processQuery(query);
}

async function executeActionSequence(actions) {
    const generation = assistantRequestGeneration;
    for (const action of actions) {
        if (generation !== assistantRequestGeneration) return;
        // Validate action has required fields
        if (!action || !action.type || !action.value) {
            console.warn('Skipping invalid action:', action);
            continue;
        }
        try {
            switch (action.type) {
                case 'speak':
                    await new Promise(resolve => {
                        displayAndSpeak(action.value, resolve, {}, false);
                    });
                    break;
                case 'open_app':
                    if (!(await ipcRenderer.invoke('open-action-path', action.value)).success) throw new Error('Could not open action path');
                    break;
                case 'open_url':
                    if (!(await ipcRenderer.invoke('open-action-url', action.value)).success) throw new Error('Could not open action website');
                    break;
                case 'play_sound':
                    await new Promise((resolve, reject) => {
                        const audio = new Audio(action.value);
                        const cleanup = () => {
                            audio.onended = null;
                            audio.onerror = null;
                        };
                        audio.onended = () => {
                            cleanup();
                            resolve();
                        };
                        audio.onerror = (error) => {
                            cleanup();
                            reject(error);
                        };
                        audio.play().catch(reject);
                    });
                    break;
                case 'run_command':
                    if (!(await ipcRenderer.invoke('run-action-command', action.value)).success) throw new Error('Could not run action command');
                    break;
            }
        } catch (error) {
            if (generation !== assistantRequestGeneration) return;
            console.error(`Error executing action ${action.type}:`, error);
            displayAndSpeak("I couldn't finish step " + (actions.indexOf(action) + 1) + ': ' + (actionNames[action.type] || 'the action') + '. Check this action in Settings.', onActionFinished, {}, true);
            return;
        }
    }
    if (generation !== assistantRequestGeneration) return;
    onActionFinished();
}

const actionNames = { speak: 'Say something', open_app: 'Open an app or file', open_url: 'Open a website', play_sound: 'Play a sound', run_command: 'Run a command' };

function renderActionSequenceUI(actions) {
    actionSequenceList.innerHTML = '';
    
    actions.forEach((action, index) => {
        const isLastItem = index === actions.length - 1;
        const actionItem = createActionItemUI(action, index, isLastItem);
        actionSequenceList.appendChild(actionItem);
    });
    
    validateAndApplyActionFormState();
}

function createActionItemUI(action, index, isLastItem) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'action-item';
    itemDiv.dataset.index = index;

    const header = document.createElement('div');
    header.className = 'action-item-header';
    
    const label = document.createElement('span');
    label.className = 'action-item-label';
    label.textContent = `Step ${index + 1}`;

    const controls = document.createElement('div');
    controls.className = 'action-item-controls';
    
    if (index > 0) {
        const upBtn = document.createElement('button');
        upBtn.innerHTML = '&#xE70E;';
        upBtn.setAttribute('aria-label', 'Move step ' + (index + 1) + ' up');
        upBtn.onclick = () => moveAction(index, -1);
        controls.appendChild(upBtn);
    }

    if (!isLastItem) {
        const downBtn = document.createElement('button');
        downBtn.innerHTML = '&#xE70D;';
        downBtn.setAttribute('aria-label', 'Move step ' + (index + 1) + ' down');
        downBtn.onclick = () => moveAction(index, 1);
        controls.appendChild(downBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '&#xE74D;';
    deleteBtn.setAttribute('aria-label', 'Delete step ' + (index + 1));
    deleteBtn.className = 'delete';
    deleteBtn.onclick = () => removeAction(index);
    controls.appendChild(deleteBtn);
    
    header.appendChild(label);
    header.appendChild(controls);

    const body = document.createElement('div');
    body.className = 'action-item-body';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'action-item-type-select';
    const types = {
        ...actionNames
    };

    if (index > 0) {
        delete types.speak;
    }

    for (const [value, text] of Object.entries(types)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        if (value === action.type) option.selected = true;
        typeSelect.appendChild(option);
    }
    typeSelect.onchange = () => {
        const actions = getCurrentActionsFromForm();
        renderActionSequenceUI(actions);
    };

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'action-item-value-input';
    valueInput.value = action.value || '';
    valueInput.placeholder = ({ speak: 'What should Cortana say?', open_app: 'Choose an app or file...', open_url: 'https://example.com', play_sound: 'Choose a sound file...', run_command: 'Command to run' })[action.type];
    valueInput.setAttribute('aria-label', 'Step ' + (index + 1) + ': ' + actionNames[action.type]);
    typeSelect.setAttribute('aria-label', 'Action for step ' + (index + 1));
    valueInput.oninput = validateAndApplyActionFormState;

    body.appendChild(typeSelect);
    body.appendChild(valueInput);
    
    if (action.type === 'open_app' || action.type === 'play_sound') {
        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
        browseBtn.setAttribute('aria-label', 'Browse for ' + (action.type === 'play_sound' ? 'a sound' : 'an app or file') + ' for step ' + (index + 1));
        browseBtn.className = 'action-item-browse-btn';
        browseBtn.onclick = async () => {
            let filters = [];
            if (action.type === 'open_app') {
                filters = [{ name: 'Applications', extensions: ['exe', 'lnk'] }];
            } else if (action.type === 'play_sound') {
                filters = [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg'] }];
            }
            const result = await ipcRenderer.invoke('show-open-dialog', { 
                properties: ['openFile'],
                filters: filters
            });
            if (!result.canceled && result.filePaths.length > 0) {
                valueInput.value = result.filePaths[0];
                validateAndApplyActionFormState();
            }
        };
        body.appendChild(browseBtn);
    }

    if (action.type === 'run_command') {
        const runCommandWarning = document.createElement('span');
        runCommandWarning.className = 'run-command-warning';
        runCommandWarning.style.color = '#e8a838';
        runCommandWarning.style.fontSize = '11px';
        runCommandWarning.style.display = 'block';
        runCommandWarning.style.marginTop = '2px';
        runCommandWarning.textContent = '⚠ This command will run with your user account permissions.';
        body.appendChild(runCommandWarning);
    }

    itemDiv.appendChild(header);
    itemDiv.appendChild(body);
    return itemDiv;
}

function sanitizeActionValue(type, value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    
    switch (type) {
        case 'speak':
            // Limit speech text length and remove potentially harmful characters
            return trimmed.slice(0, 5000);
        case 'open_app':
            // Validate path - only allow alphanumeric, spaces, dots, dashes, underscores, backslashes, colons
            return trimmed.slice(0, 260).replace(/[<>|&^%]/g, '');
        case 'open_url':
            // Validate URL
            try {
                const url = new URL(trimmed);
                if (['http:', 'https:'].includes(url.protocol)) {
                    return url.toString();
                }
            } catch (_) {}
            return '';
        case 'play_sound':
            // Allow file paths and URLs
            return trimmed.slice(0, 260);
        case 'run_command':
            // Limit command length and remove dangerous characters
            return trimmed.slice(0, 4096).replace(/[\x00-\x1F\x7F]/g, '');
        default:
            return trimmed.slice(0, 4096);
    }
}

function getCurrentActionsFromForm() {
    const actionItems = actionSequenceList.querySelectorAll('.action-item');
    return Array.from(actionItems).map(item => {
        const type = item.querySelector('.action-item-type-select').value;
        const rawValue = item.querySelector('.action-item-value-input').value;
        return {
            type,
            value: sanitizeActionValue(type, rawValue)
        };
    });
}

function moveAction(index, direction) {
    let actions = getCurrentActionsFromForm();
    if (index + direction < 0 || index + direction >= actions.length) return;
    [actions[index], actions[index + direction]] = [actions[index + direction], actions[index]];
    renderActionSequenceUI(actions);
}

function removeAction(index) {
    let actions = getCurrentActionsFromForm();
    actions.splice(index, 1);
    renderActionSequenceUI(actions);
}

function playReminderSound(soundFile) {
    let soundPath;
    let fullFilePath;
    
    // Check if soundFile is an absolute path (contains a full path) or just a filename
    if (path.isAbsolute(soundFile)) {
        // If it's an absolute path, convert it to a file URL for the Audio constructor
        fullFilePath = soundFile;
        soundPath = window.cortana.fileUrl(soundFile);
    } else {
        // If it's just a filename, construct the path relative to appRoot (for backward compatibility)
        fullFilePath = path.join(appRoot, soundFile);
        soundPath = window.cortana.fileUrl(fullFilePath);
    }
    
    const audio = new Audio(soundPath);
    
    audio.play().catch(error => {
        console.error(`Failed to play reminder sound ${soundFile}:`, error);
        // Fallback: try with the default notify.wav if a custom sound fails
        if (soundFile !== "notify.wav") {
            const fallbackPath = window.cortana.fileUrl(path.join(appRoot, 'notify.wav'));
            const fallbackAudio = new Audio(fallbackPath);
            fallbackAudio.play().catch(fallbackError => {
                console.error('Failed to play fallback reminder sound:', fallbackError);
            });
        }
    });
}

function validateAndApplyActionFormState() {
    const actions = getCurrentActionsFromForm();
    const triggerText = customActionTriggerInput.value.trim();
    let isValid = true;
    let warningMessage = '';

    const speakActionIndex = actions.findIndex(a => a.type === 'speak');
    if (speakActionIndex > 0) {
        isValid = false;
        warningMessage = '"Say something" can only be the first step.';
    }

    if (!actions.length) { isValid = false; warningMessage = 'Add a step for Cortana to carry out.'; }
    if (actions.some(a => !a.value.trim())) {
        isValid = false;
        if (!warningMessage) warningMessage = 'Fill in each step before saving.';
    }

    if (!triggerText) {
        isValid = false;
    }

    customActionSaveBtn.disabled = !isValid;
    actionSequenceWarning.textContent = warningMessage;
    actionSequenceWarning.style.display = warningMessage ? 'block' : 'none';

    const addStepButton = document.getElementById('add-action-to-sequence-btn');
    if (addStepButton) {
        addStepButton.disabled = false;
    }
}let notebookData = { notes: '', todos: [], introduced: false, profile: { name: initialPresentation.name || '' } };
let notebookSaveGeneration = 0;
let notebookPreviousFocus = null;
let notebookPage = 'overview';
let selectedListId = 'tasks';
const notebookTitles = { overview: 'Notebook', day: 'My day', about: 'About me', reminders: 'Reminders', todos: 'Lists & tasks', notes: 'Notes' };
function setNavigationPage(page) {
    for (const [id, name] of [['navigation-home','home'], ['notebook-btn','notebook'], ['settings-btn','settings']]) {
        const button = document.getElementById(id);
        if (name === page) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    collapseNavigation();
}
function collapseNavigation() {
    document.getElementById('cortana-navigation').classList.remove('expanded');
    document.getElementById('navigation-toggle').setAttribute('aria-expanded', 'false');
}
// Period UWP page transitions keep shared controls and the background fixed.
// Only the heading and body enter, in two short, ordered regions.
const contentAnimations = new WeakMap();
const paneAnimations = new WeakMap();
function cancelContentMotion(element) {
    contentAnimations.get(element)?.cancel();
    contentAnimations.delete(element);
}
function contentMotion(element, { leaving = false, delay = 0, distance = 40 } = {}) {
    const previous = contentAnimations.get(element);
    const current = previous?.playState === 'running' ? getComputedStyle(element) : null;
    const from = current ? { opacity: current.opacity, transform: current.transform } : null;
    cancelContentMotion(element);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const animation = element.animate(leaving
        ? [from || { opacity: 1, transform: 'none' }, { opacity: 0, transform: from?.transform || 'none' }]
        : [from || { opacity: 0, transform: `translateX(${distance}px)` }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: leaving ? 83 : 300, delay: from ? 0 : delay, easing: leaving ? 'linear' : 'cubic-bezier(.1,.9,.2,1)', fill: 'both' });
    contentAnimations.set(element, animation);
    animation.finished.then(() => {
        if (contentAnimations.get(element) === animation) {
            contentAnimations.delete(element);
            animation.cancel();
        }
    }).catch(() => {});
    return animation;
}
function paneRegions(element) {
    return [element.querySelector('.settings-header h1'), element.querySelector('.notebook-body, .settings-main-content')].filter(Boolean);
}
function cancelPaneMotion(element) {
    paneAnimations.delete(element);
    for (const region of paneRegions(element)) cancelContentMotion(region);
}
function enterPaneContent(element) {
    paneRegions(element).forEach((region, index) => contentMotion(region, { delay: index * 33 }));
}
function showPane(element, animate = true) {
    // Keep interrupted region positions; contentMotion continues from that frame.
    paneAnimations.delete(element);
    element.hidden = false; element.inert = false; element.classList.add('visible');
    if (animate) enterPaneContent(element); else cancelPaneMotion(element);
}
function hidePane(element, immediate = false) {
    element.classList.remove('visible'); element.inert = true;
    const generation = {};
    paneAnimations.set(element, generation);
    if (immediate) { cancelPaneMotion(element); element.hidden = true; return; }
    const animations = paneRegions(element).map(region => contentMotion(region, { leaving: true })).filter(Boolean);
    if (!animations.length) { element.hidden = true; return; }
    Promise.all(animations.map(animation => animation.finished)).then(() => {
        if (paneAnimations.get(element) === generation && !element.classList.contains('visible')) element.hidden = true;
    }).catch(() => {});
}
function selectNotebookPage(page = 'overview', focus = true, animate = true) {
    if (!Object.hasOwn(notebookTitles, page)) page = 'overview';
    const changed = notebookPage !== page;
    notebookPage = page;
    for (const item of document.querySelectorAll('.notebook-page')) item.hidden = item.id !== `notebook-${page}`;
    document.getElementById('notebook-title').textContent = notebookTitles[page];
    document.getElementById('notebook-back').setAttribute('aria-label', page === 'overview' ? 'Back to Cortana' : 'Back to Notebook');
    document.getElementById('notebook-intro').hidden = page !== 'overview';
    document.getElementById('notebook-save-status').hidden = ['overview', 'reminders', 'day'].includes(page);
    refreshVisualActivity();
    if (page === 'overview' && notebookAnim && !notebookAnim.state) notebookAnim.goToState(AnimationState.IDLE).catch(error => console.warn('Notebook orb could not be loaded:', error.message));
    document.querySelector('.notebook-content').scrollTop = 0;
    if (animate && changed) enterPaneContent(document.getElementById('notebook-sidebar'));
    if (focus) document.getElementById('notebook-back').focus({ preventScroll: true });
    if (page === 'reminders') renderNotebookReminders();
}
async function persistNotebook() {
    const generation = ++notebookSaveGeneration;
    const status = document.getElementById('notebook-save-status');
    status.textContent = 'Saving...';
    try {
        const result = await ipcRenderer.invoke('save-notebook', notebookData);
        if (generation === notebookSaveGeneration) {
            status.textContent = result.success ? 'Saved on this computer' : result.error;
            if (result.success) {
                settingSaveErrors.delete('weatherCity');
                if (!settingSaveErrors.size) document.getElementById('settings-save-error').hidden = true;
            }
        }
        return result.success;
    } catch (_) { if (generation === notebookSaveGeneration) status.textContent = 'Could not save. Your changes are still here; try again.'; return false; }
}
function renderTodos() {
    const list = document.getElementById('todo-list');
    list.replaceChildren();
    if (!(CortanaLists.all(notebookData).find(list=>list.id===selectedListId)?.items || notebookData.todos).length) {
        const empty = document.createElement('p');
        empty.textContent = 'All clear. Add something you want to do.';
        list.appendChild(empty);
    }
    const current = CortanaLists.all(notebookData).find(list=>list.id===selectedListId) || CortanaLists.all(notebookData)[0];
    selectedListId=current.id;
    document.getElementById('list-heading').textContent=current.name;
    document.getElementById('delete-list').hidden=current.id==='tasks';
    const select=document.getElementById('notebook-list-select');select.replaceChildren();
    for(const entry of CortanaLists.all(notebookData)) {const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name;select.append(option);}select.value=current.id;
    for (const item of current.items) {
        const row = document.createElement('div'); row.className = 'todo-item';
        const check = document.createElement('input'); check.type = 'checkbox'; check.checked = item.done; check.id = `todo-${item.id}`;
        const label = document.createElement('label'); label.htmlFor = check.id; label.textContent = item.text;
        check.onchange = () => { item.done = check.checked; persistNotebook(); };
        const remove = document.createElement('button'); remove.className = 'notebook-delete notebook-icon-button'; remove.textContent = '\uE74D'; remove.title = `Delete ${item.text}`; remove.setAttribute('aria-label', `Delete ${item.text}`);
        remove.onclick = () => { if(current.id==='tasks')notebookData.todos=notebookData.todos.filter(todo=>todo.id!==item.id);else current.items=current.items.filter(todo=>todo.id!==item.id); renderTodos(); persistNotebook(); };
        row.append(check, label, remove); list.appendChild(row);
    }
}
async function renderNotebookReminders() {
    const list = document.getElementById('notebook-reminder-list');
    try {
        const reminders = await ipcRenderer.invoke('get-reminders');
        list.replaceChildren();
        if (!reminders.length) { const text = document.createElement('p'); text.textContent = 'No upcoming reminders.'; list.appendChild(text); }
        for (const reminder of reminders) {
            const row = document.createElement('div'); row.className = 'notebook-reminder';
            const text = document.createElement('span'); text.textContent = `${reminder.text} — ${new Date(reminder.time).toLocaleString([], formatDateTimeOptions())}`;
            const edit = document.createElement('button'); edit.className = 'notebook-delete'; edit.textContent = 'Edit';
            edit.onclick = () => { closeNotebook(); showReminderUI({ id: reminder.id, initialText: reminder.text, initialTime: formatDateTimeForInput(new Date(reminder.time)), initialSound: reminder.sound, initialRecurrence: reminder.recurrence }); };
            const remove = document.createElement('button'); remove.className = 'notebook-delete'; remove.textContent = 'Delete';
            remove.setAttribute('aria-label', 'Delete ' + reminder.text);
            remove.onclick = async () => {
                const status = document.getElementById('notebook-reminder-error');
                if (await deleteReminder(reminder.id, remove, status)) { await renderNotebookReminders(); document.getElementById('notebook-add-reminder').focus(); }
            };
            row.append(text, edit, remove); list.appendChild(row);
        }
    } catch (_) { list.textContent = 'Reminders could not be loaded. Try opening this page again.'; }
}
function openNotebook(page = 'overview') {
    ++assistantRequestGeneration; searchResultsActive = false;
    _stopSpeechFromOutside?.();
    cancelSpeechOutput();
    hideSearchPanel();
    clearTimeout(blurCleanupTimer);
    closeSettings(true, { switching: true });
    notebookPreviousFocus = document.activeElement;
    const sidebar = document.getElementById('notebook-sidebar');
    const alreadyOpen = sidebar.classList.contains('visible');
    setNavigationPage('notebook');
    document.getElementById('notebook-btn').setAttribute('aria-expanded', 'true');
    selectNotebookPage(page, true, alreadyOpen);
    if (!alreadyOpen) showPane(sidebar);
    ipcRenderer.send('set-settings-visibility', true);
    searchBar.disabled = true;
    refreshVisualActivity();
    renderTodos(); renderNotebookReminders();
    document.getElementById('notebook-back').focus({ preventScroll: true });
    clearTimeout(blurCleanupTimer);
}
function closeNotebook({ immediate = false, switching = false } = {}) {
    const sidebar = document.getElementById('notebook-sidebar');
    if (!sidebar || !sidebar.classList.contains('visible')) {
        if (sidebar && immediate) hidePane(sidebar, true);
        return;
    }
    hidePane(sidebar, immediate);
    document.getElementById('notebook-btn').setAttribute('aria-expanded', 'false');
    if (!switching) {
        setNavigationPage('home');
        ipcRenderer.send('set-settings-visibility', false);
        searchBar.disabled = false;
        searchBar.placeholder = 'Type here to search';
        if (notebookPage === 'day') setStateIdle();
        (notebookPreviousFocus && notebookPreviousFocus.isConnected && notebookPreviousFocus !== document.body && !notebookPreviousFocus.closest('[inert]') ? notebookPreviousFocus : document.getElementById('notebook-btn')).focus({ preventScroll: true });
    }
    refreshVisualActivity();
}
async function setupNotebookAndSystemControls() {
    notebookData = await ipcRenderer.invoke('get-notebook');
    notebookData.profile = { name: '', home: '', work: '', weatherCity: '', ...notebookData.profile };
    notebookAnim = new AnimationManager(document.getElementById('notebook-idle-canvas'));
    notebookAnim.renderer.active = false;
    notebookAnim.setThemeColor(themeColor);
    document.getElementById('notebook-my-day').onclick = () => showMyDay();
    document.getElementById('notebook-btn').onclick = () => openNotebook();
    document.getElementById('navigation-toggle').onclick = () => {
        const expanded = document.getElementById('cortana-navigation').classList.toggle('expanded');
        document.getElementById('navigation-toggle').setAttribute('aria-expanded', String(expanded));
        document.getElementById('navigation-toggle').setAttribute('aria-label', expanded ? 'Collapse navigation' : 'Expand navigation');
    };
    document.getElementById('navigation-home').onclick = () => { closeNotebook(); closeSettings(); setNavigationPage('home'); };
    document.getElementById('navigation-about').onclick = () => openNotebook('about');
    document.getElementById('navigation-feedback').onclick = () => ipcRenderer.send('open-external-link', 'https://github.com/SoftBluey/Cortana-Electron/issues');
    document.getElementById('notebook-back').onclick = () => notebookPage === 'overview' ? closeNotebook() : selectNotebookPage();
    document.getElementById('todo-form').onsubmit = event => {
        event.preventDefault();
        const input = document.getElementById('todo-text');
        const text = input.value.trim();
        if (!text) return;
        const current=CortanaLists.all(notebookData).find(list=>list.id===selectedListId);
        if (current.items.length >= 200) { document.getElementById('notebook-save-status').textContent = 'You can keep up to 200 tasks. Remove a task before adding another.'; return; }
        current.items.push({ id: crypto.randomUUID(), text, done: false });
        input.value = ''; renderTodos(); persistNotebook(); input.focus();
    };
    document.getElementById('notebook-list-select').onchange=event=>{selectedListId=event.target.value;renderTodos();};
    document.getElementById('list-form').onsubmit=async event=>{event.preventDefault();const input=document.getElementById('list-name');const result=CortanaLists.apply(notebookData,{action:'create',name:input.value},()=>crypto.randomUUID());if(result.success){selectedListId=result.listId;input.value='';renderTodos();await persistNotebook();}else document.getElementById('notebook-save-status').textContent=result.message;};
    document.getElementById('delete-list').onclick=()=>{const list=notebookData.lists?.find(list=>list.id===selectedListId);if(!list||!confirm(`Delete your ${list.name} list and its ${list.items.length} items?`))return;notebookData.lists=notebookData.lists.filter(item=>item!==list);selectedListId='tasks';renderTodos();persistNotebook();};
    const notes = document.getElementById('notebook-notes-text'); notes.value = notebookData.notes;
    notes.oninput = () => { notebookData.notes = notes.value; persistNotebook(); };
    for (const tab of document.querySelectorAll('[data-page]')) tab.onclick = () => selectNotebookPage(tab.dataset.page);
    for (const [id, key] of [['notebook-name','name']]) {
        const input = document.getElementById(id); input.value = notebookData.profile[key];
        input.oninput = () => { notebookData.profile[key] = input.value; persistNotebook(); };
    }
    const weatherCityInput = document.getElementById('weather-city-input');
    weatherCityInput.value = notebookData.profile.weatherCity;
    weatherCityInput.onchange = async () => {
        notebookData.profile.weatherCity = weatherCityInput.value.trim();
        showSavedToast('Saving...');
        if (await persistNotebook()) {
            settingSaveErrors.delete('weatherCity');
            if (!settingSaveErrors.size) document.getElementById('settings-save-error').hidden = true;
            showSavedToast();
        } else { const message = 'Could not save your weather city. Your entry is still here; try again.'; settingSaveErrors.set('weatherCity', message); showSettingsError(message); }
    };
    document.getElementById('notebook-add-reminder').onclick = () => { closeNotebook(); showReminderUI(); };
    document.addEventListener('keydown', event => {
        const sidebar = document.getElementById('notebook-sidebar');
        if (event.key === 'Escape' && document.getElementById('cortana-navigation').classList.contains('expanded')) { event.preventDefault(); collapseNavigation(); return; }
        if (settingsContainer.classList.contains('visible') && event.key === 'Escape') { event.preventDefault(); customActionFormContainer.classList.contains('visible') ? hideCustomActionForm() : closeSettings(); return; }
        if (sidebar.classList.contains('visible') && event.key === 'Escape') { event.preventDefault(); notebookPage === 'overview' ? closeNotebook() : selectNotebookPage(); }
        if (sidebar.classList.contains('visible') && event.key === 'Tab') {
            const controls = [...document.querySelectorAll('#cortana-navigation button, #notebook-sidebar button, #notebook-sidebar input, #notebook-sidebar textarea, #notebook-sidebar select')].filter(el => !el.disabled && el.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
        if (['Enter', ' '].includes(event.key) && event.target.matches('[role="button"]')) { event.preventDefault(); event.target.click(); }
    });
    for (const [id, key] of [['close-to-tray-toggle', 'closeToTray'], ['hotkey-listen-toggle', 'hotkeyStartsListening']]) {
        document.getElementById(id).onchange = async event => {
            const enabled = event.target.checked;
            const result = await saveSetting(key, enabled);
            if (result.success && key === 'closeToTray') updateCloseButton(enabled);
        };
    }
    document.getElementById('save-assistant-hotkey').onclick = async () => {
        const button = document.getElementById('save-assistant-hotkey');
        const field = document.getElementById('assistant-hotkey');
        const value = field.value.trim(); button.disabled = true;
        try {
            const result = await ipcRenderer.invoke('set-assistant-hotkey', value);
            document.getElementById('assistant-hotkey-status').textContent = result.success
                ? (result.accelerator ? 'Active: ' + formatShortcut(result.accelerator) : 'Shortcut disabled') : result.error;
            if (result.success) { field.value = formatShortcut(result.accelerator); showSavedToast(); }
        } catch (_) { document.getElementById('assistant-hotkey-status').textContent = 'Could not apply this shortcut. Try again.'; }
        finally { button.disabled = false; }
    };
    document.getElementById('copy-speech-diagnostics').onclick = async () => {
        const data = await ipcRenderer.invoke('speech-diagnostics');
        window.cortana.copyDiagnostics(JSON.stringify(data, null, 2));
        document.getElementById('speech-diagnostics-status').textContent = 'Copied environment, speech stages and error codes. No API keys or recognized speech are included.';
    };
    document.getElementById('recognition-mode-select').onchange = event => {
        saveSetting('recognitionMode', event.target.value);
    };
    document.getElementById('listening-sounds-toggle').onchange = event => {
        listeningSounds = event.target.checked;
        saveSetting('listeningSounds', listeningSounds);
    };
    // Chromium reports output/camera changes too. Only a changed input identity
    // should reset capture; debounce bursts from virtual audio endpoints.
    let inputIdentity = null, deviceChangeTimer;
    const inputs = async () => CortanaAudioDevicePolicy.inputFingerprint(await navigator.mediaDevices.enumerateDevices());
    if (navigator.mediaDevices) {
        const identityReady = inputs().then(identity => { inputIdentity = identity; }).catch(() => {});
        navigator.mediaDevices.addEventListener('devicechange', () => {
            clearTimeout(deviceChangeTimer);
            deviceChangeTimer = setTimeout(async () => {
                await identityReady;
                const next = await inputs().catch(() => null);
                if (next === null || next === inputIdentity) return;
                const hadIdentity = inputIdentity !== null;
                inputIdentity = next;
                if (hadIdentity) { ipcRenderer.send('speech-device-changed'); refreshSpeechDiagnostics(); }
            }, 750);
        });
    }
}
