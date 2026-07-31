const { ipcRenderer } = require('electron');
const path = require('path');
const https = require('https');
const { parseGIF, decompressFrames } = require('gifuct-js');

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

let reminderContainer, reminderTextInput, reminderTimeInput, reminderSoundInput, reminderSaveBtn, reminderCancelBtn, reminderIcon, reminderSoundBrowseBtn;

let settingsContainer, settingsBtn, settingsBackBtn, voiceSelect, startupToggle, startupWarning, voiceWarning, searchEngineSelect, themeColorPicker, movableToggle, pitchSlider, rateSlider, resetVoiceBtn, resetReminderSoundBtn, resetAllBtn, reminderSoundSettingInput, reminderSoundBrowseSettingBtn, reminderSoundResetSettingBtn;
let ttsEngineSelect, edgeVoiceSelect, edgeVoiceContainer;
let timeFormatSelect;
let idleGreetingModeSelect, specificGreetingContainer, specificGreetingSelect, customGreetingContainer, customGreetingInput;
let customActionFormContainer, customActionTriggerInput, customActionSaveBtn, customActionCancelBtn, customActionsList, addCustomActionBtn, actionSequenceList, actionSequenceWarning;
let aiToggle, openaiApiKeyInput, openaiApiKeyContainer;
let aiModelInput, aiApiUrlInput, aiSystemPromptInput, aiPresetSelect, aiCustomFields, aiModelItem, aiApiUrlItem;
let useAccentToggle;
let heyCortanaToggle;

let availableVoices = [];
let customActions = [];
let currentVoice = null;
let editingActionIndex = null;
let preferredVoiceName = "Microsoft Zira Desktop";
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

let timerId = null;
let timerInterval = null;
let timerEndTime = null;
let timerDuration = null;


const appRoot = path.resolve(__dirname, __dirname.includes('app.asar') ? '../assets' : 'assets');

const idleVideo = path.join(appRoot, 'idle.png');
const speakingVideo = path.join(appRoot, 'speaking.png');
const speakingEndVideo = path.join(appRoot, 'speaking-end.png');
const thinkingVideo = path.join(appRoot, 'thinking.png');
const listeningVideo = path.join(appRoot, 'listening.png');
const errorVideo = path.join(appRoot, 'error.png');

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

let isBusy = false;
let lastQuery = '';
let anim = null;

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
  SPIN: 'spin',
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
  [AnimationState.SPIN]: 'circle_spin.gif',
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
  { name: 'Space', start: 'space_start.gif', loop: 'space_end.gif' },
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
  }

  loadSync(path) {
    this.stop();
    const buffer = require('fs').readFileSync(path);
    const gif = parseGIF(buffer);
    const rawFrames = decompressFrames(gif);

    this.gifWidth = gif.lsd.width;
    this.gifHeight = gif.lsd.height;
    this.canvas.width = this.gifWidth;
    this.canvas.height = this.gifHeight;

    this.frames = [];
    let prevData = new Uint8ClampedArray(this.gifWidth * this.gifHeight * 4);
    let prevDisposal = 0;

    for (const raw of rawFrames) {
      const { left, top, width, height } = raw.dims;
      const pixels = raw.pixels;
      const colorTable = raw.colorTable;
      const frameData = new Uint8ClampedArray(this.gifWidth * this.gifHeight * 4);

      if (prevDisposal === 0 || prevDisposal === 1) {
        frameData.set(prevData);
      }

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const si = y * width + x;
          const di = ((top + y) * this.gifWidth + (left + x)) * 4;

          const index = pixels[si];
          const color = colorTable[index];
          if (!color) continue;

          const pr = color[0];
          const pg = color[1];
          const pb = color[2];

          const lum = getLuminance(pr, pg, pb);

          if (lum < CHROMA_KEY_THRESHOLD) {
            frameData[di] = 0;
            frameData[di + 1] = 0;
            frameData[di + 2] = 0;
            frameData[di + 3] = 0;
          } else {
            frameData[di] = pr;
            frameData[di + 1] = pg;
            frameData[di + 2] = pb;
            frameData[di + 3] = 255;
          }
        }
      }

      this.frames.push({
        data: frameData,
        delay: Math.max(raw.delay, 20),
      });

      prevData = raw.disposalType === 2
        ? new Uint8ClampedArray(this.gifWidth * this.gifHeight * 4)
        : new Uint8ClampedArray(frameData);
      prevDisposal = raw.disposalType;
    }

    this.currentIndex = 0;
    this.loops = 0;
  }

  start(loop = true) {
    this.stop();
    this.running = true;
    this.currentIndex = 0;
    this.loops = 0;
    this.maxLoops = loop ? Infinity : 1;
    this._tick();
  }

  playOneShot(onComplete) {
    this.start(false);
    this.onComplete = onComplete;
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.onComplete = null;
  }

  _tick() {
    if (!this.running) return;

    this._renderFrame(this.currentIndex);

    this.currentIndex++;

    if (this.currentIndex >= this.frames.length) {
      this.loops++;
      if (this.loops >= this.maxLoops) {
        this.running = false;
        if (this.onComplete) {
          const cb = this.onComplete;
          this.onComplete = null;
          cb();
        }
        return;
      }
      this.currentIndex = 0;
      if (this.onLoop) this.onLoop();
    }

    const delay = this.frames[this.currentIndex].delay;
    this.timer = setTimeout(() => this._tick(), delay);
  }

  _renderFrame(index) {
    const frame = this.frames[index];
    if (!frame) return;

    const imageData = this.ctx.createImageData(this.gifWidth, this.gifHeight);
    const pxData = frame.data;
    const { r, g, b } = this.themeColor;

    for (let i = 0; i < pxData.length; i += 4) {
      const pr = pxData[i];
      const pg = pxData[i + 1];
      const pb = pxData[i + 2];
      const pa = pxData[i + 3];

      if (pa === 0 || (pr === 0 && pg === 0 && pb === 0)) {
        imageData.data[i] = 0;
        imageData.data[i + 1] = 0;
        imageData.data[i + 2] = 0;
        imageData.data[i + 3] = 0;
        continue;
      }

      const lum = getLuminance(pr, pg, pb);
      const intensity = lum / 255;
      imageData.data[i] = Math.round(r * intensity);
      imageData.data[i + 1] = Math.round(g * intensity);
      imageData.data[i + 2] = Math.round(b * intensity);
      imageData.data[i + 3] = pa;
    }

    this.ctx.putImageData(imageData, 0, 0);
  }

  setThemeColor(hex) {
    this.themeColor = parseHexColor(hex);
    if (this.frames.length > 0) {
      this._renderFrame(this.currentIndex % this.frames.length);
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

    this._isPlayingSpecial = false;
    this._currentSpecialIndex = -1;
    this._lastSpecialIndex = -1;

    this.renderer.onComplete = () => this._onAnimationEnd();
  }

  init() {
    this.renderer.loadSync(path.join(appRoot, ANIMATION_FILES[AnimationState.STATIC]));
    this.state = AnimationState.STATIC;
    this.renderer.start(true);
  }

  goToState(state, options = {}) {
    if (this._destroyed) return;

    this.queue = [];
    this._stopIdleCycle();
    this._stopSpecial();
    this._playState(state, options);
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
    this.renderer.stop();
    this._stopIdleCycle();
    this.queue = [];
  }

  _playState(state, options = {}) {
    if (this._destroyed) return;

    this.state = state;
    this._pendingNext = options.nextState || null;

    if (state === AnimationState.IDLE) {
      this._startIdleCycle();
      return;
    }

    const file = ANIMATION_FILES[state];
    if (!file) {
      console.warn(`No animation file for state: ${state}`);
      return;
    }

    this.renderer.loadSync(path.join(appRoot, file));

    const isLooping = (
      state === AnimationState.LISTENING ||
      state === AnimationState.SPEAKING ||
      state === AnimationState.THINKING
    );

    if (state === AnimationState.STATIC || isLooping) {
      this.renderer.start(true);
    } else {
      this.renderer.playOneShot(() => this._onAnimationEnd());
    }
  }

  _onAnimationEnd() {
    if (this._destroyed) return;

    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this._playState(next);
      return;
    }

    if (this._pendingNext) {
      const next = this._pendingNext;
      this._pendingNext = null;
      this._playState(next);
      return;
    }

    const autoNext = {
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
      [AnimationState.SPIN]: AnimationState.TRANSITION_TO_IDLE,
    };

    const next = autoNext[this.state];
    if (next) {
      this._playState(next);
    }
  }

  _startIdleCycle() {
    this._idlePlaying = true;
    this._idleCycleIndex = 1;
    this._playIdleFrame();
  }

  _playIdleFrame() {
    if (this._destroyed || !this._idlePlaying) return;

    const files = ['idle_start', 'idle_mid', 'idle_end'];
    const key = files[this._idleCycleIndex];
    const file = ANIMATION_FILES[key];

    if (!file) {
      this._idleCycleIndex = (this._idleCycleIndex + 1) % files.length;
      this._playIdleFrame();
      return;
    }

    this.renderer.loadSync(path.join(appRoot, file));
    this.renderer.playOneShot(() => {
      if (this._destroyed || !this._idlePlaying) return;
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

  playSpecial(id) {
    if (this._destroyed || id < 0 || id >= SPECIAL_ANIMATIONS.length) return;
    this._stopIdleCycle();
    this._stopSpecial();
    this._isPlayingSpecial = true;
    this._currentSpecialIndex = id;
    this._playSpecialStart();
  }

  _stopSpecial() {
    if (this._isPlayingSpecial) {
      this._isPlayingSpecial = false;
      this.renderer.stop();
      this._currentSpecialIndex = -1;
    }
  }

  _playSpecialStart() {
    const special = SPECIAL_ANIMATIONS[this._currentSpecialIndex];
    this.renderer.loadSync(path.join(appRoot, special.start));
    this.renderer.playOneShot(() => this._onSpecialStartEnd());
  }

  _onSpecialStartEnd() {
    if (this._destroyed || !this._isPlayingSpecial) return;
    this._playSpecialLoop();
  }

  _playSpecialLoop() {
    const special = SPECIAL_ANIMATIONS[this._currentSpecialIndex];
    this.renderer.loadSync(path.join(appRoot, special.loop));
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

const idleMessages = [
    "What's on your mind?",
    "Hello!",
    "How can I help?",
    "Hi!",
    "Ask me anything."
];

function getIdleMessage() {
    switch (idleGreetingMode) {
        case 'specific':
            return specificIdleGreeting;
        case 'custom':
            return customIdleGreeting.trim() || "Hello!";
        case 'random':
        default:
            return idleMessages[Math.floor(Math.random() * idleMessages.length)];
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
    
    const circleCanvas = document.getElementById('circle-canvas');
    anim = new AnimationManager(circleCanvas);
    anim.init();

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

    updateButton?.addEventListener('click', () => {
        ipcRenderer.send('open-github-releases');
    });

    ipcRenderer.on('update-status', (event, { available, currentVersion, remoteVersion }) => {

        if (currentVersionSpan) {
            currentVersionSpan.textContent = currentVersion;
        }
        if (updateAvailableDiv) {
            updateAvailableDiv.style.display = available ? 'block' : 'none';
            if (available) {
                const updateMessage = updateAvailableDiv.querySelector('.update-message');
                if (updateMessage) {
                    updateMessage.textContent = `A new version (${remoteVersion}) is available!`;
                }
            }
        }

    });
    webLinkContainer = document.getElementById('web-link-container');
    webLink = document.getElementById('web-link');
    webIcon = document.getElementById('web-icon');

    reminderContainer = document.getElementById('reminder-container');
    reminderIcon = document.getElementById('reminder-icon');
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

    ttsEngineSelect = document.getElementById('tts-engine-select');
    edgeVoiceSelect = document.getElementById('edge-voice-select');
    edgeVoiceContainer = document.getElementById('edge-voice-container');
    timeFormatSelect = document.getElementById('time-format-select');

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
    reminderIcon.src = idleVideo;

    const assetsToPreload = [idleVideo, speakingVideo, speakingEndVideo, thinkingVideo, listeningVideo, errorVideo, drumrollSound.src];
    assetsToPreload.forEach(src => { new Image().src = src; });

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
    searchBar.addEventListener('keydown', onSearchKeyDown);
    searchBar.addEventListener('blur', () => {
        if (speechActive) {
            stopSpeechRecognition();
            searchBar.placeholder = 'Type here to search';
            return;
        }
        searchIcon.src = cortanaIcon;
        if (animationContainer.className === 'idle') return;
        blurCleanupTimer = setTimeout(() => {
            hideSearchPanel();
            searchBar.value = '';
            searchBar.placeholder = 'Type here to search';
            setStateIdle();
        }, 200);
        anim.goToState(AnimationState.IDLE);
        offSound.play();
    });

    searchBar.addEventListener('focus', () => {
        if (speechActive) {
            stopSpeechRecognition();
        }
        searchIcon.src = searchIconPng;
        if (animationContainer.className === 'active') {
            setStateIdle();
            return;
        }
    });

    let speechActive = false;
    let speechFinal = '';
    let speechPartial = '';
    let speechShuffleTimer = null;

    function speechShuffle() {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        let s = '';
        const len = 7 + Math.floor(Math.random() * 2); // 7-8 chars
        for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * 26)];
        return s;
    }

    function flashMicError() {
        micBtn.classList.add('error');
        setTimeout(() => micBtn.classList.remove('error'), 1200);
    }

    function startSpeechUI() {
        speechActive = true;
        speechFinal = '';
        speechPartial = '';
        clearTimeout(blurCleanupTimer);
        micBtn.classList.add('listening');
        anim.goToState(AnimationState.LISTENING_BEGIN);
        onSound.play();
        searchBar.placeholder = 'Listening...';
        searchBar.style.color = '#888888';
        setTimeout(() => { searchBar.value = speechShuffle(); hideSearchPanel(); }, 0);
        speechShuffleTimer = setInterval(() => {
            if (!speechActive) return;
            searchBar.value = speechFinal.trim() || speechShuffle();
        }, 120);
    }

    function startSpeechRecognition() {
        startSpeechUI();
        ipcRenderer.send('speech-start');
    }

    function stopSpeechRecognition() {
        speechActive = false;
        if (speechShuffleTimer) { clearInterval(speechShuffleTimer); speechShuffleTimer = null; }
        searchBar.style.color = '';
        searchBar.value = '';
        micBtn.classList.remove('listening');
        ipcRenderer.send('speech-stop');
        offSound.play();
        if (document.body.classList.contains('slim-mode')) {
            document.body.classList.remove('slim-mode');
            ipcRenderer.send('close-app');
            return;
        }
        setStateIdle();
    }

    async function submitVoiceSearch() {
        speechActive = false;
        if (speechShuffleTimer) { clearInterval(speechShuffleTimer); speechShuffleTimer = null; }
        searchBar.style.color = '';
        micBtn.classList.remove('listening');
        ipcRenderer.send('speech-stop');
        searchBar.placeholder = 'Type here to search';
        document.body.classList.remove('slim-mode');

        const query = speechFinal.trim();
        if (!query) {
            searchBar.value = '';
            setStateIdle();
            return;
        }

        searchBar.value = '';
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
            speechFinal += (data.text || '') + ' ';
            searchBar.value = speechFinal.trim();
            submitVoiceSearch();
        }
    });

    ipcRenderer.on('speech-error', (event, message) => {
        if (!speechActive) return;
        console.error('[speech]', message || 'Speech error');
        searchBar.placeholder = message || 'Speech error';
        setTimeout(() => { searchBar.placeholder = 'Type here to search'; }, 5000);
        flashMicError();
        stopSpeechRecognition();
    });

    micBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (speechActive) {
            stopSpeechRecognition();
        } else {
            speechActive = true;
            startSpeechRecognition();
        }
    });

    ipcRenderer.on('wake-slim', () => {
        document.body.classList.add('slim-mode');
        startSpeechUI();
    });

    ipcRenderer.on('wake-listen', () => {
        if (document.body.classList.contains('slim-mode')) {
            document.body.classList.remove('slim-mode');
        }
        startSpeechUI();
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
        ipcRenderer.send('set-setting', { key: 'useWindowsAccent', value: useWindowsAccent });
        if (useWindowsAccent) {
            themeColorPicker.disabled = true;
            await fetchAndApplyAccentColor();
        } else {
            themeColorPicker.disabled = false;
            applyThemeColor(themeColor);
        }
        showSavedToast();
    });
    heyCortanaToggle.addEventListener('change', () => {
        heyCortanaEnabled = heyCortanaToggle.checked;
        ipcRenderer.send('set-setting', { key: 'heyCortana', value: heyCortanaEnabled });
        ipcRenderer.send('hey-cortana-toggle', heyCortanaEnabled);
        showSavedToast();
    });
    movableToggle.addEventListener('change', onMovableToggleChanged);
    pitchSlider.addEventListener('input', onPitchChanged);
    rateSlider.addEventListener('input', onRateChanged);
    ttsEngineSelect.addEventListener('change', onTtsEngineChanged);
    edgeVoiceSelect.addEventListener('change', onEdgeVoiceChanged);
    timeFormatSelect.addEventListener('change', onTimeFormatChanged);
    resetVoiceBtn.addEventListener('click', onResetVoiceSettings);
    resetReminderSoundBtn.addEventListener('click', onResetReminderSound);
    resetThemeBtn.addEventListener('click', onResetThemeColors);
    resetAllBtn.addEventListener('click', onResetAllSettings);
    
    aiToggle.addEventListener('change', onAIChanged);
    openaiApiKeyInput.addEventListener('input', onOpenAIKeyChanged);
    aiModelInput.addEventListener('input', onAIModelChanged);
    aiApiUrlInput.addEventListener('input', onAIApiUrlChanged);
    aiSystemPromptInput.addEventListener('input', onAISystemPromptChanged);
    aiPresetSelect.addEventListener('change', onPresetChanged);

    idleGreetingModeSelect.addEventListener('change', onIdleGreetingModeChanged);
    specificGreetingSelect.addEventListener('change', onSpecificIdleGreetingChanged);
    customGreetingInput.addEventListener('input', onCustomIdleGreetingChanged);

    const everythingToggle = document.getElementById('everything-toggle');
    const everythingPortInput = document.getElementById('everything-port-input');
    if (everythingToggle) {
      everythingToggle.addEventListener('change', (e) => {
        useEverythingSearch = e.target.checked;
        document.getElementById('everything-port-container').style.display = useEverythingSearch ? 'block' : 'none';
        ipcRenderer.send('set-setting', { key: 'useEverythingSearch', value: useEverythingSearch });
        showSavedToast();
        if (useEverythingSearch) {
          ipcRenderer.invoke('check-everything').then(ok => {
            const warning = document.getElementById('everything-warning');
            if (warning) {
              warning.textContent = ok ? 'Everything HTTP server is reachable.' : 'Cannot reach Everything HTTP server. Check that it is enabled in Everything options.';
              warning.style.color = ok ? 'green' : '#e74c3c';
            }
          });
        }
      });
    }
    if (everythingPortInput) {
      everythingPortInput.addEventListener('input', (e) => {
        everythingPort = parseInt(e.target.value) || 80;
        ipcRenderer.send('set-setting', { key: 'everythingPort', value: everythingPort });
      });
    }

    // Reminder sound setting event listeners
    if (reminderSoundSettingInput) {
        reminderSoundSettingInput.addEventListener('change', (e) => {
            reminderSound = e.target.value;
            ipcRenderer.send('set-setting', {
                key: 'reminderSound',
                value: e.target.value
            });
            showSavedToast();
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
                        // Save the setting
                        ipcRenderer.send('set-setting', { 
                            key: 'reminderSound', 
                            value: fullPath 
                        });
                        showSavedToast();
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
                // Save the setting
                ipcRenderer.send('set-setting', { 
                    key: 'reminderSound', 
                    value: "notify.wav" 
                });
                showSavedToast();
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
        if (!appContainer.classList.contains('visible')) return;
        if (speechActive) stopSpeechRecognition();

        const onAnimationEnd = () => {
            if (!appContainer.classList.contains('visible')) {
                ipcRenderer.send('hide-window');
                setStateIdle();
            }
        };

        appContainer.addEventListener('transitionend', onAnimationEnd, { once: true });
        appContainer.classList.remove('visible');
    });

    let entranceReceived = false;
    ipcRenderer.on('trigger-enter-animation', (event, { timeSinceHidden }) => {
        entranceReceived = true;
        appContainer.classList.add('visible');
        const state = timeSinceHidden > 5000
            ? AnimationState.ENTRANCE
            : AnimationState.RESUME;
        anim.goToState(state);
    });

    ipcRenderer.on('command-failed', (event, { command }) => {
        let errorText = `Sorry, I had trouble with that command.`;
        if (command === 'open-application') {
            errorText = `Sorry, I had trouble opening that. Make sure it's installed correctly.`;
        } else if (command === 'run-command') {
            errorText = `Sorry, that command failed to run.`;
        }
        displayAndSpeak(errorText, onActionFinished, {}, true);
    });

    ipcRenderer.on('show-settings-ui', showSettingsUI);

    ipcRenderer.on('play-reminder-sound', (event, soundFile) => {
        playReminderSound(soundFile);
    });

    await loadAndApplySettings();
    setupTTS();

    animationContainer.className = 'idle';
    if (!entranceReceived) {
        anim.goToState(AnimationState.IDLE);
    }

    const p = document.createElement('p');
    p.className = 'fade-in-item';
    p.textContent = getIdleMessage();
    resultsDisplay.appendChild(p);

    webLinkContainer.style.display = 'none';
    webLinkContainer.style.opacity = '0';
    searchBar.disabled = false;
    searchBar.placeholder = 'Type here to search';
    isBusy = false;
    searchIcon.src = cortanaIcon;
    } catch (e) {
        console.error('Init error:', e);
        ipcRenderer.send('renderer-error', e.message + '\n' + (e.stack || ''));
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

async function onSearchInput(event) {
    window.speechSynthesis.cancel();
    const query = searchBar.value.trim();
    if (query.length === 0) {
        hideSearchPanel();
        return;
    }
    const categories = await generateCategorizedResults(query);
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
                    executeActionSequence(a.actions);
                }
            });
        }
    }
    if (customActionItems.length > 0) {
        categories.push({ name: 'Custom Actions', items: customActionItems });
    }

    const cortanaItems = [];

    const matchedCommand = commands.find(c => lowerQuery.match(c.regex));

    if (matchedCommand) {
        cortanaItems.push({
            type: 'cortana',
            title: `Execute "${query}"`,
            subtitle: 'Run this Cortana function',
            icon: PANEL_ICONS.cortana,
            action: () => {
                lastQuery = query;
                isBusy = true;
                setStateActive();
                resultsDisplay.innerHTML = '';
                matchedCommand.handler(lowerQuery.match(matchedCommand.regex));
            }
        });
    }

    cortanaItems.push({
        type: 'cortana',
        title: `Search for "${query}"`,
        subtitle: 'Continue with Cortana regular',
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

    if (aiEnabled) {
        cortanaItems.push({
            type: 'cortana',
            title: `Ask AI about "${query}"`,
            subtitle: navigator.onLine ? 'Get an AI-generated answer' : 'Requires internet connection',
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
                ipcRenderer.invoke('ask-openai', query).then(result => {
                    if (result.success) {
                        displayAndSpeak(result.text, onActionFinished, {}, false);
                    } else {
                        displayAndSpeak(result.error || "Sorry, I couldn't get an answer from AI.", onActionFinished, {}, true);
                    }
                });
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

    const webSuggestions = await generateWebSuggestions(query);
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
    return new Promise((resolve) => {
        const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };
        const req = https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const suggestions = json[1] || [];
                    resolve(suggestions.slice(0, 4));
                } catch {
                    resolve([]);
                }
            });
        });
        req.on('error', () => resolve([]));
        req.setTimeout(3000, () => { req.destroy(); resolve([]); });
    });
}

function showSearchPanel(categories) {
    selectedPanelIndex = -1;
    allPanelItems = [];
    searchPanel.innerHTML = '';
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
                searchBar.value = '';
                item.action();
                searchIcon.src = cortanaIcon;
            });

            allPanelItems.push({ el, action: item.action });
            searchPanel.appendChild(el);
            globalIndex++;
        });
    });

    if (allPanelItems.length > 0) {
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
    searchPanel.classList.remove('visible');
    allPanelItems = [];
    selectedPanelIndex = -1;
    micBtn.style.display = '';
}

function onSearchKeyDown(event) {
    if (allPanelItems.length === 0) {
        if (event.key === 'Enter') {
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
                searchBar.value = '';
                enterItems[enterIndex].action();
            } else {
                onSearch();
            }
            break;

        case 'Escape':
            event.preventDefault();
            hideSearchPanel();
            searchBar.value = '';
            searchBar.placeholder = 'Type here to search';
            setStateIdle();
            break;
    }
}

function updatePanelSelection() {
    allPanelItems.forEach((item, index) => {
        if (index === selectedPanelIndex) {
            item.el.classList.add('selected');
            item.el.scrollIntoView({ block: 'nearest' });
        } else {
            item.el.classList.remove('selected');
        }
    });
}

async function showSettingsUI() {
    animationContainer.style.display = 'none';
    reminderContainer.classList.remove('visible');
    ipcRenderer.send('set-settings-visibility', true);

    settingsContainer.classList.add('visible');
    document.querySelector('.settings-main-content').style.display = 'block';
    customActionFormContainer.classList.remove('visible');

    // Refresh all settings when opening settings UI to ensure they're current
    await loadAndApplySettings();

    searchBar.disabled = true;
    searchBar.placeholder = 'Unavailable...';
    isBusy = false;
}

function closeSettings() {
    ipcRenderer.send('set-settings-visibility', false);
    settingsContainer.classList.remove('visible');
    animationContainer.style.display = 'block';
    setStateIdle();
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

async function loadAndApplySettings() {
    const settings = await ipcRenderer.invoke('get-settings');
    preferredVoiceName = settings.preferredVoice;

    startupToggle.checked = settings.openAtLogin;
    startupWarning.style.display = settings.openAtLogin ? 'none' : 'block';

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
            applyThemeColor('#' + accentHex.slice(0, 6));
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

    if (ttsEngine === 'edge') {
        await loadEdgeVoices();
    }

    timeFormat = settings.timeFormat || '12';
    timeFormatSelect.value = timeFormat;

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

    aiEnabled = settings.aiEnabled === true;
    aiToggle.checked = aiEnabled;
    openaiApiKeyInput.value = settings.openaiApiKey || '';
    aiModelInput.value = settings.aiModel || 'gpt-4o-mini';
    aiApiUrlInput.value = settings.aiApiUrl || 'https://api.openai.com/v1/chat/completions';
    aiSystemPromptInput.value = settings.aiSystemPrompt || '';
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
            summarySpan.textContent = item.actions.map(a => a.type.replace('_', ' ')).join(' → ');
    
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'custom-action-item-actions';
    
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit';
            editBtn.className = 'reminder-action-btn';
            editBtn.onclick = () => showCustomActionForm({ index, data: item });
    
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'reminder-action-btn delete';
            deleteBtn.onclick = () => {
                customActions.splice(index, 1);
                saveCustomActions();
                renderCustomActions();
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
    customActionFormContainer.classList.remove('visible');
    document.querySelector('.settings-main-content').style.display = 'block';
    editingActionIndex = null;
}

function onSaveCustomAction() {
    const trigger = customActionTriggerInput.value.trim();
    const actions = getCurrentActionsFromForm();

    if (!trigger || actions.length === 0) return;

    const newAction = { trigger, actions };
    if (editingActionIndex !== null) {
        customActions[editingActionIndex] = newAction;
    } else {
        customActions.push(newAction);
    }
    saveCustomActions();
    renderCustomActions();
    hideCustomActionForm();
    showSavedToast();
}

function saveCustomActions() {
    ipcRenderer.send('set-custom-actions', customActions);
}

let savedToastTimer = null;

function showSavedToast() {
    const toast = document.getElementById('settings-saved-toast');
    if (!toast) return;
    toast.classList.add('visible');
    if (savedToastTimer) clearTimeout(savedToastTimer);
    savedToastTimer = setTimeout(() => {
        toast.classList.remove('visible');
        savedToastTimer = null;
    }, 1200);
}

function applyThemeColor(color) {
    themeColor = color;
    document.documentElement.style.setProperty('--primary-color', color);
    anim.setThemeColor(color);

    const defaultHue = 207;
    const newHsl = hexToHsl(color);
    const hueDifference = newHsl.h - defaultHue;
    document.documentElement.style.setProperty('--hue-rotate-deg', `${hueDifference}deg`);
}

async function fetchAndApplyAccentColor() {
    const result = await ipcRenderer.invoke('get-accent-color');
    if (result.success) {
        const accentHex = result.color.replace('#', '');
        applyThemeColor('#' + accentHex.slice(0, 6));
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
    ipcRenderer.send('set-setting', { key: 'useWindowsAccent', value: false });
    applyThemeColor(themeColor);
    ipcRenderer.send('set-setting', { key: 'themeColor', value: themeColor });
    showSavedToast();
}

function onPitchChanged(event) {
    pitch = parseFloat(event.target.value);
    ipcRenderer.send('set-setting', { key: 'pitch', value: pitch });
    showSavedToast();
}

function onRateChanged(event) {
    rate = parseFloat(event.target.value);
    ipcRenderer.send('set-setting', { key: 'rate', value: rate });
    showSavedToast();
}

function onResetVoiceSettings() {
    ttsEngine = 'system';
    ttsEngineSelect.value = 'system';
    ipcRenderer.send('set-setting', { key: 'ttsEngine', value: 'system' });

    edgeVoice = 'en-US-JennyNeural';
    edgeVoiceSelect.value = edgeVoice;
    ipcRenderer.send('set-setting', { key: 'edgeVoice', value: edgeVoice });
    updateTtsEngineUI();

    const defaultVoice = availableVoices.find(v => v.name.includes("Zira")) || availableVoices[0];
    
    if (defaultVoice) {
        preferredVoiceName = defaultVoice.name;
        voiceSelect.value = preferredVoiceName;
        currentVoice = defaultVoice;
        ipcRenderer.send('set-setting', { key: 'preferredVoice', value: preferredVoiceName });
    }

    pitch = 1;
    rate = 1;
    pitchSlider.value = pitch;
    rateSlider.value = rate;
    ipcRenderer.send('set-setting', { key: 'pitch', value: pitch });
    ipcRenderer.send('set-setting', { key: 'rate', value: rate });
    showSavedToast();
}

function onResetReminderSound() {
    if (reminderSoundSettingInput) {
        reminderSoundSettingInput.value = "notify.wav";
        reminderSound = "notify.wav";
        // Save the setting
        ipcRenderer.send('set-setting', { 
            key: 'reminderSound', 
            value: "notify.wav" 
        });
        showSavedToast();
    }
}

function onResetThemeColors() {
    useAccentToggle.checked = false;
    useWindowsAccent = false;
    themeColorPicker.disabled = false;
    ipcRenderer.send('set-setting', { key: 'useWindowsAccent', value: false });

    const defaultColor = '#0078d7';
    suppressThemeInput = true;
    themeColorPicker.value = defaultColor;
    suppressThemeInput = false;
    applyThemeColor(defaultColor);
    ipcRenderer.send('set-setting', { key: 'themeColor', value: defaultColor });

    showSavedToast();
}

function onResetAllSettings() {
    const confirmation = confirm(
        "Are you sure you want to reset EVERYTHING?\n\n" +
        "This will erase all your custom settings, reminders, and custom actions. " +
        "The application will restart. This action cannot be undone."
    );

    if (confirmation) {
        ipcRenderer.send('reset-all-settings');
    }
}


function onVoiceChanged() {
    const selectedVoiceName = voiceSelect.value;
    preferredVoiceName = selectedVoiceName;
    currentVoice = availableVoices.find(v => v.name === selectedVoiceName) || null;
    ipcRenderer.send('set-setting', { key: 'preferredVoice', value: selectedVoiceName });
    showSavedToast();
}

function onStartupToggleChanged() {
    const isEnabled = startupToggle.checked;
    startupWarning.style.display = isEnabled ? 'none' : 'block';
    ipcRenderer.send('set-setting', { key: 'openAtLogin', value: isEnabled });
    showSavedToast();
}

function onMovableToggleChanged() {
    const isEnabled = movableToggle.checked;
    ipcRenderer.send('set-setting', { key: 'isMovable', value: isEnabled });
    showSavedToast();
}

function onSearchEngineChanged() {
    currentSearchEngine = searchEngineSelect.value;
    ipcRenderer.send('set-setting', { key: 'searchEngine', value: currentSearchEngine });
    showSavedToast();
}

function updateTtsEngineUI() {
    const isEdge = ttsEngine === 'edge';
    edgeVoiceContainer.style.display = isEdge ? 'flex' : 'none';
    voiceSelect.parentElement.style.display = isEdge ? 'none' : 'flex';
    pitchSlider.parentElement.style.display = isEdge ? 'none' : 'flex';
    rateSlider.parentElement.style.display = isEdge ? 'none' : 'flex';
}

async function loadEdgeVoices() {
    if (edgeVoices.length > 0) return;
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
}

async function onTtsEngineChanged() {
    ttsEngine = ttsEngineSelect.value;
    ipcRenderer.send('set-setting', { key: 'ttsEngine', value: ttsEngine });
    updateTtsEngineUI();
    if (ttsEngine === 'edge') {
        await loadEdgeVoices();
    }
    showSavedToast();
}

function onEdgeVoiceChanged() {
    edgeVoice = edgeVoiceSelect.value;
    ipcRenderer.send('set-setting', { key: 'edgeVoice', value: edgeVoice });
    showSavedToast();
}

function onTimeFormatChanged() {
    timeFormat = timeFormatSelect.value;
    ipcRenderer.send('set-setting', { key: 'timeFormat', value: timeFormat });
    showSavedToast();
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
    ipcRenderer.send('set-setting', { key: 'aiEnabled', value: aiEnabled });
    updateAIUI();
    showSavedToast();
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
  'google-gemini': { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-3.6-flash', keyHint: 'AIza...' },
  deepseek:   { url: 'https://api.deepseek.com/v1/chat/completions',         model: 'deepseek-chat',            keyHint: 'sk-...' },
};

function onPresetChanged() {
    const val = aiPresetSelect.value;
    const isCustom = val === 'custom';
    const preset = AI_PRESETS[val];

    const showLocalOrCustom = isCustom || preset?.local;
    aiCustomFields.style.display = isCustom ? 'block' : 'none';
    aiModelItem.style.display = showLocalOrCustom ? '' : 'none';
    aiApiUrlItem.style.display = showLocalOrCustom ? '' : 'none';

    if (preset) {
        aiApiUrlInput.value = preset.url;
        aiModelInput.value = preset.local ? '' : preset.model;
        openaiApiKeyInput.value = '';
        openaiApiKeyInput.placeholder = preset.keyHint || 'No API key needed';
        ipcRenderer.send('set-setting', { key: 'openaiApiKey', value: '' });
        ipcRenderer.send('set-setting', { key: 'aiApiUrl', value: preset.url });
        ipcRenderer.send('set-setting', { key: 'aiModel', value: aiModelInput.value });
    }
    showSavedToast();
}

function onOpenAIKeyChanged() {
    ipcRenderer.send('set-setting', { key: 'openaiApiKey', value: openaiApiKeyInput.value });
    showSavedToast();
}

function onAIModelChanged() {
    ipcRenderer.send('set-setting', { key: 'aiModel', value: aiModelInput.value });
    showSavedToast();
}

function onAIApiUrlChanged() {
    ipcRenderer.send('set-setting', { key: 'aiApiUrl', value: aiApiUrlInput.value });
    showSavedToast();
}

function onAISystemPromptChanged() {
    ipcRenderer.send('set-setting', { key: 'aiSystemPrompt', value: aiSystemPromptInput.value });
    showSavedToast();
}

function updateAIUI() {
    openaiApiKeyContainer.style.display = aiEnabled ? 'block' : 'none';
}

function onIdleGreetingModeChanged(event) {
    idleGreetingMode = event.target.value;
    ipcRenderer.send('set-setting', { key: 'idleGreetingMode', value: idleGreetingMode });
    updateGreetingUI();
    showSavedToast();
}

function onSpecificIdleGreetingChanged(event) {
    specificIdleGreeting = event.target.value;
    ipcRenderer.send('set-setting', { key: 'specificIdleGreeting', value: specificIdleGreeting });
    showSavedToast();
}

function onCustomIdleGreetingChanged(event) {
    customIdleGreeting = event.target.value;
    ipcRenderer.send('set-setting', { key: 'customIdleGreeting', value: customIdleGreeting });
    showSavedToast();
}

function displayAndSpeak(text, callback, options = {}, isError = false) {
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
        anim.goToState(AnimationState.ERROR);

        let errorHandled = false;
        const handleErrorEnd = () => {
            if (errorHandled) return;
            errorHandled = true;
            errorSound.onended = null;
            anim.goToState(AnimationState.SPEAKING_BEGIN);
            speak(text, () => {
                anim.goToState(AnimationState.ERROR);
                setTimeout(() => {
                    isBusy = false;
                    searchBar.disabled = false;
                    searchBar.placeholder = 'Type here to search';
                    anim.goToState(AnimationState.TRANSITION_TO_IDLE);
                }, 3800);
            });
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

        if (preferredVoiceIsAvailable) {
            voiceSelect.value = preferredVoiceName;
        } else {
            const defaultVoice = availableVoices.find(v => v.name.includes("Zira")) || availableVoices[0];
            if (defaultVoice) {
                voiceSelect.value = defaultVoice.name;
                preferredVoiceName = defaultVoice.name;
                ipcRenderer.send('set-setting', { key: 'preferredVoice', value: preferredVoiceName });
            }
        }
        
        currentVoice = availableVoices.find(v => v.name === voiceSelect.value) || null;
    }

    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = populateAndSetVoices;
    } else {
        populateAndSetVoices();
    }
}

function speak(text, onSpeechEndCallback) {
    window.speechSynthesis.cancel();
    if (!text) {
        if (onSpeechEndCallback) onSpeechEndCallback();
        return;
    }

    if (ttsEngine === 'edge') {
        speakEdge(text, onSpeechEndCallback);
    } else {
        speakSystem(text, onSpeechEndCallback);
    }
}

let currentEdgeAudio = null;

function speakEdge(text, onSpeechEndCallback) {
    if (currentEdgeAudio) {
        currentEdgeAudio.pause();
        currentEdgeAudio = null;
    }

    ipcRenderer.invoke('synthesize-edge-tts', {
        text,
        voice: edgeVoice,
        pitch,
        rate
    }).then(result => {
        if (!result.success) {
            console.error('Edge TTS failed:', result.error);
            if (onSpeechEndCallback) onSpeechEndCallback();
            return;
        }
        const audio = new Audio('file://' + result.filePath.replace(/\\/g, '/'));
        currentEdgeAudio = audio;
        audio.onended = () => {
            currentEdgeAudio = null;
            try { require('fs').unlinkSync(result.filePath); } catch(e) {}
            if (onSpeechEndCallback) onSpeechEndCallback();
        };
        audio.onerror = () => {
            currentEdgeAudio = null;
            try { require('fs').unlinkSync(result.filePath); } catch(e) {}
            if (onSpeechEndCallback) onSpeechEndCallback();
        };
        audio.play().catch(err => {
            console.error('Edge TTS audio play failed:', err);
            currentEdgeAudio = null;
            if (onSpeechEndCallback) onSpeechEndCallback();
        });
    }).catch(err => {
        console.error('Edge TTS invoke failed:', err);
        if (onSpeechEndCallback) onSpeechEndCallback();
    });
}

function speakSystem(text, onSpeechEndCallback) {
    if (!currentVoice) {
        if (onSpeechEndCallback) onSpeechEndCallback();
        return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = currentVoice;
    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.onend = () => { if (onSpeechEndCallback) onSpeechEndCallback(); };
    utterance.onerror = () => { if (onSpeechEndCallback) onSpeechEndCallback(); };
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
    if (settingsContainer.classList.contains('visible')) return;
    if (animationContainer.className === 'idle' && document.activeElement === searchBar) return;
    
    if (searchResultsActive) {
        searchResultsActive = false;
    }

    editingReminderId = null;
    editingReminderSound = null; // Also reset the editing sound
    reminderContainer.classList.remove('visible');
    animationContainer.style.display = 'block';

    clearTimeout(finishSpeakingTimeout);
    window.speechSynthesis.cancel();
    if (currentEdgeAudio) {
        currentEdgeAudio.pause();
        currentEdgeAudio = null;
    }
    requestSound.pause();
    requestSound.currentTime = 0;
    drumrollSound.pause();
    drumrollSound.currentTime = 0;

    isBusy = false;

    animationContainer.className = 'idle';
    if (document.activeElement === searchBar) {
        searchIcon.src = searchIconPng;
    } else {
        searchIcon.src = cortanaIcon;
    }
    anim.goToState(AnimationState.IDLE);

    if (!isBusy) {
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
    searchResultsActive = true;
    if (document.activeElement === searchBar) {
        searchIcon.src = searchIconPng;
    }
    anim.goToState(AnimationState.THINKING);
    resultsDisplay.innerHTML = '';
    const loadingP = document.createElement('p');
    loadingP.className = 'fade-in-item';
    loadingP.textContent = `Searching the web for "${query}"...`;
    resultsDisplay.appendChild(loadingP);
    searchBar.disabled = false;
    searchBar.value = '';
    searchBar.placeholder = 'Type here to search';

    const result = await ipcRenderer.invoke('search-web', query);
    if (!searchResultsActive) return;

    resultsDisplay.innerHTML = '';
    if (result.success && result.results.length > 0) {
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
            resultsDisplay.appendChild(item);
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
        p.textContent = 'No results found.';
        resultsDisplay.appendChild(p);
        anim.goToState(AnimationState.SPEAKING_BEGIN);
        setTimeout(() => {
            isBusy = false;
            anim.goToState(AnimationState.TRANSITION_TO_IDLE);
        }, 1000);
    }
}

function hideSearchResults() {
    if (!searchResultsActive) return;
    searchResultsActive = false;
    searchBar.placeholder = 'Type here to search';
    searchBar.value = '';
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

function calculate(query) {
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
                index++; // consume operator
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
                index++; // consume operator
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
            
            const num = parseFloat(numStr);
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
        displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, false);
    } catch (error) {
        responseText = `Sorry, that doesn't look like a valid calculation.`;
        displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
    }
}

async function getWeather(location) {
    let responseText;
    try {
        const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
        if (!geoResponse.ok) {
            responseText = `Sorry, I had trouble connecting to the location service.`;
            displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
            return;
        }

        const geoData = await geoResponse.json();
        if (!geoData.results || geoData.results.length === 0) {
            responseText = `Sorry, I couldn't find a location named ${location}.`;
            displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
            return;
        }

        const { name, admin1, country, latitude, longitude } = geoData.results[0];
        const locationNameForSpeech = (admin1 && admin1.toLowerCase() !== name.toLowerCase()) ? `${name}, ${admin1}` : `${name}, ${country}`;

        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
        if (!weatherResponse.ok) {
            responseText = `Sorry, I couldn't get the weather for ${locationNameForSpeech}.`;
            displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, true);
            return;
        }

        const weatherData = await weatherResponse.json();
        const { temperature, windspeed, weathercode } = weatherData.current_weather;
        const tempUnit = weatherData.current_weather_units?.temperature || '°C';
        const conditions = getWeatherDescription(weathercode);

        lastQuery = `weather in ${location}`;
        responseText = `Currently in ${locationNameForSpeech}: ${temperature}${tempUnit}, ${conditions}. Wind speed is ${windspeed} kilometers per hour.`;

        displayAndSpeak(responseText, onActionFinished, { showWebLink: true }, false);

    } catch (error) {
        responseText = `Sorry, an unexpected error occurred while getting the weather.`;
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

async function getTimeForLocation(rawInput) {
    let text;
    try {
        const result = await ipcRenderer.invoke('get-time-for-location', rawInput.trim(), timeFormat);

        if (result.ambiguous) {
            text = "I found a few places with that name. Which one did you mean?";
            
            resultsDisplay.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'fade-in-item';
            p.style.marginBottom = '10px';
            p.textContent = text;
            resultsDisplay.appendChild(p);

            result.options.forEach((option, index) => {
                const label = option.province ? `${option.city}, ${option.province}, ${option.country}` : `${option.city}, ${option.country}`;
                const btn = document.createElement('button');
                btn.textContent = label;
                btn.className = 'choice-button fade-in-item';
                btn.style.animationDelay = `${index * 100}ms`;
                btn.onclick = () => {
                    processQuery(`what is the time in ${option.fullQuery}`);
                };
                resultsDisplay.appendChild(btn);
            });

            anim.goToState(AnimationState.SPEAKING_BEGIN);
            speak(text, onActionFinished);
            showWebLink();

        } else {
            text = `The time in ${result.city}, ${result.country} is ${result.time}.`;
            displayAndSpeak(text, onActionFinished, { showWebLink: true }, false);
        }

    } catch (error) {
        text = `Sorry, I couldn't find the time for '${rawInput.trim()}'. Please try a more specific city name.`;
        displayAndSpeak(text, onActionFinished, { showWebLink: true }, true);
    }
}

function getLocalTime() {
    const now = new Date();
    const text = `The local time is ${now.toLocaleTimeString([], formatTimeOptions())}`;
    displayAndSpeak(text, onActionFinished, { showWebLink: true }, false);
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
    const { initialText = '', initialTime = '', initialSound = '', id = null } = options;
    editingReminderId = id;
    editingReminderSound = initialSound; // Store the initial sound for this reminder

    animationContainer.style.display = 'none';
    reminderContainer.classList.add('visible');

    reminderTextInput.value = initialText;
    reminderTimeInput.value = initialTime;
    // Set the sound - use initialSound if provided (for editing), otherwise use default
    // Note: In this version, we don't dynamically modify the UI, but sound is handled in the background
    // The sound is passed through the reminder payload when saving

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

function parseDateTime(text) {
    const now = new Date();
    let date = new Date(now);
    text = text.toLowerCase();
    let timeFound = false;
    let hasSpecificHour = false;

    if (text.includes('tonight')) {
        date.setHours(21, 0, 0, 0);
        timeFound = true;
        hasSpecificHour = true;
    }
    else if (text.includes('tomorrow')) {
        date.setDate(now.getDate() + 1);
        timeFound = true;
    }
    else {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        for (let i = 0; i < days.length; i++) {
            if (text.includes(days[i])) {
                const dayIndex = i;
                const currentDay = now.getDay();
                let dayDiff = dayIndex - currentDay;
                if (dayDiff <= 0) {
                    dayDiff += 7;
                }
                date.setDate(now.getDate() + dayDiff);
                timeFound = true;
                break;
            }
        }
    }

    const timeMatch = text.match(/(\d{1,2})(:\d{2})?\s?(am|pm)?/);
    if (timeMatch) {
        let [_, hourStr, minuteStr, ampm] = timeMatch;
        let hour = parseInt(hourStr, 10);
        let minute = minuteStr ? parseInt(minuteStr.slice(1), 10) : 0;

        if (ampm === 'pm' && hour < 12) {
            hour += 12;
        } else if (ampm === 'am' && hour === 12) {
            hour = 0;
        }

        date.setHours(hour, minute, 0, 0);
        if (date < now && !timeFound) {
            date.setDate(date.getDate() + 1);
        }
        timeFound = true;
        hasSpecificHour = true;
    }

    const relativeTimeMatch = text.match(/(\d+)\s*(minute|second|hour)s?/);
    if (relativeTimeMatch) {
        const timeValue = parseInt(relativeTimeMatch[1]);
        const unit = relativeTimeMatch[2];
        let newDate;
        if (unit === 'minute') {
            newDate = new Date(now.getTime() + timeValue * 60000);
        } else if (unit === 'second') {
            newDate = new Date(now.getTime() + timeValue * 1000);
        } else if (unit === 'hour') {
            newDate = new Date(now.getTime() + timeValue * 3600000);
        }
        if (newDate) {
            date = newDate;
            timeFound = true;
            hasSpecificHour = true;
        }
    }
    
    if (!timeFound) return null;

    if (!hasSpecificHour) {
        date.setHours(9, 0, 0, 0);
    }

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

function onSaveReminder() {
    const reminder = reminderTextInput.value.trim();
    const timeValue = reminderTimeInput.value;
    
    let soundValue;
    if (editingReminderId && editingReminderSound) {
        // If we're editing an existing reminder, use the sound that was initially set for this reminder during editing
        // This preserves the original reminder's sound unless the user somehow changed it in the UI (which isn't currently possible)
        soundValue = editingReminderSound;
    } else {
        // For new reminders, read directly from the settings input field to ensure we get the latest value
        soundValue = reminderSoundSettingInput.value || "notify.wav";
    }

    if (reminder && timeValue) {
        const reminderDate = new Date(timeValue);
        const reminderPayload = { 
            reminder, 
            reminderTime: reminderDate.toISOString(),
            sound: soundValue
        };
        let text;

        if (editingReminderId) {
            ipcRenderer.send('update-reminder', { id: editingReminderId, ...reminderPayload });
            text = `OK. I've updated your reminder.`;
        } else {
            ipcRenderer.send('set-reminder', reminderPayload);
            const friendlyTime = reminderDate.toLocaleString([], formatDateTimeOptions());
            text = `OK. I'll remind you to "${reminder}" on ${friendlyTime}.`;
        }

        // Reset editing variables
        editingReminderId = null;
        editingReminderSound = null;

        reminderContainer.classList.remove('visible');
        animationContainer.style.display = 'block';
        setStateActive();
        anim.goToState(AnimationState.SPEAKING_BEGIN);

        displayAndSpeak(text, onActionFinished, {}, false);
    } else {
        const errorText = "Please enter both a reminder and a valid time.";
        displayAndSpeak(errorText, onActionFinished, {}, true);
    }
}


async function handleOpenApplication(appName, silent = false) {
    // Handle special Windows commands
    const specialCommands = {
        'settings': 'ms-settings:',
        'windows settings': 'ms-settings:',
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

    if (apps.length === 0) {
        const fallbackSuccess = await ipcRenderer.invoke('open-application-fallback', appName);
        if (fallbackSuccess) {
            if (!silent) {
                const responseText = `I couldn't find "${appName}" in your Start Menu, but I'm opening it directly.`;
                displayAndSpeak(responseText, onActionFinished, {}, false);
            } else { isBusy = false; setStateIdle(); }
        } else {
            if (!silent) {
                const responseText = `I couldn't find "${appName}" and couldn't open it directly.`;
                displayAndSpeak(responseText, onActionFinished, {}, true);
            } else { isBusy = false; setStateIdle(); }
        }
    } else if (apps.length === 1) {
        ipcRenderer.send('open-path', apps[0].path);
        if (!silent) {
            const responseText = `Opening ${apps[0].name}...`;
            displayAndSpeak(responseText, onActionFinished, {}, false);
        } else { isBusy = false; setStateIdle(); }
    } else if (silent) {
        ipcRenderer.send('open-path', apps[0].path);
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
            btn.style.animationDelay = `${index * 100}ms`;
            btn.onclick = () => {
                ipcRenderer.send('open-path', app.path);
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

        reminders.forEach((reminder, index) => {
            const item = document.createElement('div');
            item.className = 'reminder-list-item fade-in-item';
            item.style.animationDelay = `${index * 100}ms`;

            const textContainer = document.createElement('div');
            textContainer.className = 'reminder-text-container';

            const text = document.createElement('span');
            text.textContent = reminder.text;
            text.className = 'reminder-text';

            const time = document.createElement('span');
            const reminderDate = new Date(reminder.time);
            time.textContent = reminderDate.toLocaleString([], formatReminderListOptions());
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
                    initialSound: reminder.sound || reminderSound || "notify.wav",
                    id: reminder.id
                });
            };

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'reminder-action-btn delete';
            deleteBtn.onclick = () => {
                ipcRenderer.send('remove-reminder', reminder.id);
                item.style.animation = 'fadeOut 0.3s forwards';
                setTimeout(() => showReminders(), 300);
            };

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
        anim.goToState(AnimationState.TRANSITION_TO_IDLE);
    });
}

const commands = [
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
        handler: (match) => {
            let reminderText = '';
            let timeText = '';
            const fullReminderText = match[1].trim();
            const timeExtractionMatch = fullReminderText.match(/(.+)( at | on | in )(.+)/i);
            reminderText = fullReminderText;
            if (timeExtractionMatch) {
                const potentialText = timeExtractionMatch[1].trim();
                const potentialTime = timeExtractionMatch[3].trim();
                const parsedDate = parseDateTime(potentialTime);
                if (parsedDate) {
                    reminderText = potentialText;
                    timeText = formatDateTimeForInput(parsedDate);
                }
            }
            showReminderUI({ initialText: reminderText, initialTime: timeText });
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
        regex: /^(open|launch|start|run) (.+)/i,
        handler: (match) => {
            handleOpenApplication(match[2].trim());
        }
    },
    {
        regex: /^(weather today|weather forecast|current weather|today'?s weather)$/i,
        handler: () => {
            displayAndSpeak("I need a location to check the weather. Try asking 'What's the weather in New York?'", onActionFinished, {}, false);
        }
    },
    {
        regex: /(?:what's|how's|what is) the weather(?: in| for| like in)?\s+(.+)/i,
        handler: (match) => {
            const location = match[1].trim().replace(/\?$/, '');
            getWeather(location);
        }
    },
    {
        regex: /^(?:weather|forecast) (?:in|for|of) (.+)/i,
        handler: (match) => {
            getWeather(match[1].trim());
        }
    },
    {
        regex: /^(.+) (?:weather|forecast)$/i,
        handler: (match) => {
            getWeather(match[1].trim());
        }
    },
    {
        regex: /(?:what's|what is) the time (?:in|for|at) (.+)/i,
        handler: (match) => {
            getTimeForLocation(match[1]);
        }
    },
    {
        regex: /what(?:'s| is) the time|what time is it/i,
        handler: () => {
            getLocalTime();
        }
    },
    {
        regex: /(?:what's|what is) (?:the date|today's date)|what day is it|what's today/i,
        handler: () => {
            getDate();
        }
    },
    {
        regex: /^(?:what is|calculate|compute) ([\d\s\.\+\-\*\/(),]+)\??$/i,
        handler: (match) => {
            calculate(match[1]);
        }
    },
    {
        regex: /^[\d\s\.\+\-\*\/(),]+$/,
        handler: (match) => {
            calculate(match[0]);
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
            const response = "I am a remake of the 1607 styled Cortana from late 2016 Windows 10, created by BlueySoft.";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /are you official\??/i,
        handler: () => {
            const response = "No. I am a third party remade client made by BlueySoft. This project is not affiliated with Microsoft. I exist because she had fond memories with me.";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /what can you do|what are your skills|help|what can i ask you\??/i,
        handler: () => {
            const response = "I can get the time, date, and weather. I can also do math and unit conversions, set reminders, timers, and alarms, control volume, open apps, create calendar events, look up information, tell jokes, and search the web.";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /marry me\??/i,
        handler: () => {
            const response = "I honestly don't think that's in the cards for us.";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /(hide|dispose of) a body\??/i,
        handler: () => {
            const response = "What kind of assistant do you think I am??";
            displayAndSpeak(response, onActionFinished, {}, true);
        }
    },
    {
        regex: /^(?:set|start) a timer (?:for )?(?:about )?(\d+)\s*(minute|min|second|sec|hour|hr)s?\s*$/i,
        handler: (match) => {
            const value = parseInt(match[1]);
            const unit = match[2].toLowerCase();
            let ms;
            if (unit.startsWith('min')) ms = value * 60000;
            else if (unit.startsWith('sec')) ms = value * 1000;
            else if (unit.startsWith('hour') || unit.startsWith('hr')) ms = value * 3600000;
            else { displayAndSpeak("Sorry, I didn't understand that time unit.", onActionFinished, {}, true); return; }
            startTimer(value, unit, ms);
        }
    },
    {
        regex: /^(?:cancel|stop) (?:the )?timer$/i,
        handler: () => {
            if (timerId) {
                clearTimeout(timerId);
                timerId = null;
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = null;
                timerEndTime = null;
                timerDuration = null;
                displayAndSpeak("Timer cancelled.", onActionFinished, {}, false);
            } else {
                displayAndSpeak("There's no timer running.", onActionFinished, {}, false);
            }
        }
    },
    {
        regex: /^how much time (?:is )?left(?: on the timer)?\??$/i,
        handler: () => {
            if (!timerEndTime) {
                displayAndSpeak("There's no timer running.", onActionFinished, {}, false);
                return;
            }
            const remaining = Math.max(0, timerEndTime - Date.now());
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            displayAndSpeak(`${mins} minute${mins !== 1 ? 's' : ''} and ${secs} second${secs !== 1 ? 's' : ''} remaining.`, onActionFinished, {}, false);
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
            ipcRenderer.send('set-reminder', {
                reminder: 'Alarm',
                reminderTime: parsedDate.toISOString(),
                sound: 'notify.wav'
            });
            displayAndSpeak(`Alarm set for ${friendlyTime}.`, onActionFinished, {}, false);
        }
    },
    {
        regex: /^(mute|unmute)( volume| sound| system)?(!|\.)?$/i,
        handler: () => {
            ipcRenderer.invoke('media-control', 'mute');
            displayAndSpeak("OK.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^(volume|turn(?: the)? volume) (up|increase|raise|louder)( please)?(!|\.)?$/i,
        handler: () => {
            ipcRenderer.invoke('media-control', 'volup');
            displayAndSpeak("Got it.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^(volume|turn(?: the)? volume) (down|decrease|lower|quieter)( please)?(!|\.)?$/i,
        handler: () => {
            ipcRenderer.invoke('media-control', 'voldown');
            displayAndSpeak("Sure thing.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^(?:play|pause|unpause|resume)(?: music| media| audio| song| track)?$/i,
        handler: () => {
            ipcRenderer.invoke('media-control', 'playpause');
            displayAndSpeak("There you go.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^(?:next|skip)(?: track| song| music)?$/i,
        handler: () => {
            ipcRenderer.invoke('media-control', 'next');
            displayAndSpeak("Skipping ahead.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^(?:previous|prev)(?: track| song| music)?$/i,
        handler: () => {
            ipcRenderer.invoke('media-control', 'prev');
            displayAndSpeak("Going back.", onActionFinished, {}, false);
        }
    },
    {
        regex: /^stop(?: media| music| audio| track| song)?$/i,
        handler: () => {
            ipcRenderer.invoke('media-control', 'stop');
            displayAndSpeak("Stopped.", onActionFinished, {}, false);
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
        regex: /^(\d+(?:\.\d+)?)\s*(celsius|c|fahrenheit|f|kelvin|k)\s+(?:to|in)\s+(celsius|c|fahrenheit|f|kelvin|k)\s*$/i,
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
            const fromLabel = from[0].toUpperCase();
            const toLabel = to[0].toUpperCase();
            displayAndSpeak(`${value}${String.fromCharCode(176)}${fromLabel} is ${result.toFixed(1)}${String.fromCharCode(176)}${toLabel}.`, onActionFinished, { showWebLink: true }, false);
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
            displayAndSpeak(`${value} ${from} is ${result.toFixed(2)} ${to}.`, onActionFinished, { showWebLink: true }, false);
        }
    },
    {
        regex: /^(?:schedule|create|add|make) (?:an? |a )?(?:event|appointment|calendar event|meeting|reminder|call)(?: for| about|:)?\s+(.+)/i,
        handler: (match) => {
            const full = match[1].trim();
            const timeMatch = full.match(/(.+?)\s+(?:for|at|on)\s+(.+)/i);
            let title, timeText;
            if (timeMatch) {
                title = timeMatch[1].trim();
                timeText = timeMatch[2].trim();
            } else {
                title = full;
                timeText = null;
            }
            if (!timeText) {
                displayAndSpeak("What time should I schedule that for?", onActionFinished, {}, false);
                return;
            }
            const parsedDate = parseDateTime(timeText);
            if (!parsedDate) {
                displayAndSpeak(`Sorry, I couldn't understand "${timeText}". Try "schedule meeting for tomorrow at 3 pm".`, onActionFinished, {}, true);
                return;
            }
            ipcRenderer.invoke('create-calendar-event', { title, dateTime: parsedDate.toISOString() }).then(result => {
                if (result.success) {
                    const friendlyTime = parsedDate.toLocaleString([], formatDateTimeOptions());
                    displayAndSpeak(`Added "${title}" to your calendar for ${friendlyTime}.`, onActionFinished, {}, false);
                } else {
                    displayAndSpeak("Sorry, I couldn't create that calendar event.", onActionFinished, {}, true);
                }
            });
        }
    },
    {
        regex: /^(?:what is |tell me about |who (?:is|was) |define )(.+)$|^what does (.+) mean\??$/i,
        handler: (match) => {
            const topic = (match[1] || match[2] || '').trim().replace(/[?!.]+$/, '');
            anim.goToState(AnimationState.THINKING);
            resultsDisplay.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'fade-in-item';
            p.textContent = `Looking up "${topic}"...`;
            resultsDisplay.appendChild(p);
            ipcRenderer.invoke('wikipedia-lookup', topic).then(result => {
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
                    displayAndSpeak(result.error || "Sorry, I couldn't find information on that.", onActionFinished, {}, true);
                }
            }).catch(() => {
                performWebSearch(topic);
            });
        }
    },
    {
        regex: /^(what's up|sup|how's it going|how are you)\??$/i,
        handler: () => {
            const response = "Nothing much. What may I help you with?";
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /^(thanks|thank you|thx|ty)(.+)?(!|\.)?$/i,
        handler: () => {
            const responses = ["You're welcome!", "No problem.", "Happy to help!"];
            const response = responses[Math.floor(Math.random() * responses.length)];
            displayAndSpeak(response, onActionFinished, {}, false);
        }
    },
    {
        regex: /^(bye|goodbye|see ya|later|cya|see you later)(!|\.)?$/i,
        handler: () => {
            const responses = ["Goodbye!", "See you later.", "Catch you later."];
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
            const responses = ["Hello there. How can I help you?", "Hi! What's on your mind?", "Hey! What can I do for you?"];
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
    
    // Check if it matches any built-in command
    for (const command of commands) {
        if (lowerText.match(command.regex)) {
            return true;
        }
    }
    
    return false;
}

function startTimer(value, unit, ms) {
    if (timerId) {
        clearTimeout(timerId);
        timerId = null;
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    timerEndTime = Date.now() + ms;
    timerDuration = ms;

    anim.goToState(AnimationState.SPEAKING_BEGIN);
    speak(`Timer set for ${value} ${unit}${value !== 1 ? 's' : ''}.`, () => {
        if (!timerEndTime) return;
        anim.goToState(AnimationState.TRANSITION_TO_IDLE);
    });

    resultsDisplay.innerHTML = '';
    const timerDisplay = document.createElement('p');
    timerDisplay.className = 'fade-in-item';
    timerDisplay.id = 'timer-display';
    timerDisplay.style.fontSize = '24px';
    timerDisplay.style.textAlign = 'center';
    timerDisplay.style.fontWeight = 'bold';
    resultsDisplay.appendChild(timerDisplay);

    const updateTimer = () => {
        const remaining = Math.max(0, timerEndTime - Date.now());
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const display = document.getElementById('timer-display');
        if (display) {
            display.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
        if (remaining <= 0 && timerId) {
            clearInterval(timerInterval);
            timerInterval = null;
            timerId = null;
            timerEndTime = null;
            timerDuration = null;
            if (display) display.textContent = 'Time\'s up!';
            const notifyAudio = new Audio(path.join(appRoot, 'notify.wav'));
            notifyAudio.play();
            anim.goToState(AnimationState.SPEAKING_BEGIN);
            speak('Time\'s up! Your timer has finished.', () => {
                isBusy = false;
                searchBar.disabled = false;
                searchBar.placeholder = 'Type here to search';
                anim.goToState(AnimationState.TRANSITION_TO_IDLE);
            });
        }
    };

    updateTimer();
    timerInterval = setInterval(updateTimer, 250);
    timerId = setTimeout(() => {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }, ms + 1000);

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

function processQuery(query) {
    webLinkContainer.style.display = 'none';
    webLinkContainer.style.opacity = '0';
    resultsDisplay.innerHTML = '';
    const lowerCaseQuery = query.toLowerCase();

    // Check for custom actions with exact match or word boundary matching
    // This prevents false triggers (e.g., "open chrome" won't trigger a "chrome" custom action)
    const customAction = customActions.find(a => {
        if (!a.trigger) return false;
        const triggerLower = a.trigger.toLowerCase();
        // Check for exact match first
        if (lowerCaseQuery === triggerLower) return true;
        // Check if trigger appears as a complete word/phrase
        const regex = new RegExp(`\\b${triggerLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        return regex.test(lowerCaseQuery);
    });
    if (customAction && customAction.actions.length > 0) {
        executeActionSequence(customAction.actions);
        return;
    }

    for (const command of commands) {
        const match = lowerCaseQuery.match(command.regex);
        if (match) {
            command.handler(match);
            return;
        }
    }

    if (aiEnabled && navigator.onLine) {
        anim.goToState(AnimationState.THINKING);
        resultsDisplay.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'fade-in-item';
        p.textContent = 'Thinking...';
        resultsDisplay.appendChild(p);
        ipcRenderer.invoke('ask-openai', query).then(result => {
            if (result.success) {
                displayAndSpeak(result.text, onActionFinished, {}, false);
            } else {
                performWebSearch(query);
            }
        }).catch(() => {
            performWebSearch(query);
        });
        return;
    }

    performWebSearch(query);
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
    searchBar.value = '';
    resultsDisplay.innerHTML = '';

    requestSound.currentTime = 0;
    requestSound.play();
    processQuery(query);
}

async function executeActionSequence(actions) {
    for (const action of actions) {
        try {
            switch (action.type) {
                case 'speak':
                    await new Promise(resolve => {
                        displayAndSpeak(action.value, resolve, {}, false);
                    });
                    break;
                case 'open_app':
                    ipcRenderer.send('open-path', action.value);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
                case 'open_url':
                    ipcRenderer.send('open-external-link', action.value);
                    await new Promise(resolve => setTimeout(resolve, 500));
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
                    ipcRenderer.send('run-command', action.value);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    break;
            }
        } catch (error) {
            console.error(`Error executing action ${action.type}:`, error);
            displayAndSpeak(`Sorry, I had a problem with the action: ${action.type}.`, onActionFinished, {}, true);
            return;
        }
    }
    onActionFinished();
}

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
        upBtn.onclick = () => moveAction(index, -1);
        controls.appendChild(upBtn);
    }

    if (!isLastItem) {
        const downBtn = document.createElement('button');
        downBtn.innerHTML = '&#xE70D;';
        downBtn.onclick = () => moveAction(index, 1);
        controls.appendChild(downBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '&#xE74D;';
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
        'speak': 'Speak Text',
        'open_app': 'Open App',
        'open_url': 'Open URL',
        'play_sound': 'Play Sound',
        'run_command': 'Run Command'
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
    valueInput.placeholder = 'Enter value...';
    valueInput.oninput = validateAndApplyActionFormState;

    body.appendChild(typeSelect);
    body.appendChild(valueInput);
    
    if (action.type === 'open_app' || action.type === 'play_sound') {
        const browseBtn = document.createElement('button');
        browseBtn.textContent = '...';
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

    itemDiv.appendChild(header);
    itemDiv.appendChild(body);
    return itemDiv;
}

function getCurrentActionsFromForm() {
    const actionItems = actionSequenceList.querySelectorAll('.action-item');
    return Array.from(actionItems).map(item => ({
        type: item.querySelector('.action-item-type-select').value,
        value: item.querySelector('.action-item-value-input').value
    }));
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
        soundPath = 'file://' + soundFile.replace(/\\/g, '/');
    } else {
        // If it's just a filename, construct the path relative to appRoot (for backward compatibility)
        fullFilePath = path.join(appRoot, soundFile);
        soundPath = 'file://' + fullFilePath.replace(/\\/g, '/');
    }
    
    // Check if the file exists before trying to play it
    const fs = require('fs');
    if (!fs.existsSync(fullFilePath)) {
        console.warn(`Reminder sound file not found: ${fullFilePath}, using fallback`);
        // Use fallback immediately if file doesn't exist
        if (soundFile !== "notify.wav") {
            const fallbackPath = path.join(appRoot, "notify.wav");
            if (fs.existsSync(fallbackPath)) {
                const fallbackAudio = new Audio('file://' + fallbackPath.replace(/\\/g, '/'));
                fallbackAudio.play().catch(fallbackError => {
                    console.error('Failed to play fallback reminder sound:', fallbackError);
                });
            }
        }
        return;
    }
    
    const audio = new Audio(soundPath);
    
    // Play the sound
    audio.play().catch(error => {
        console.error(`Failed to play reminder sound ${soundFile}:`, error);
        // Fallback: try with the default notify.wav if a custom sound fails
        if (soundFile !== "notify.wav") {
            const fallbackPath = 'file://' + path.join(appRoot, "notify.wav").replace(/\\/g, '/');
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
        warningMessage = 'The "Speak Text" action can only be the first step.';
    }

    if (actions.some(a => !a.value.trim())) {
        isValid = false;
        if (!warningMessage) warningMessage = 'All action steps must have a value.';
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
}