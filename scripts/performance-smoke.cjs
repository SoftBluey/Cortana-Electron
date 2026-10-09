// Measures the real renderer using a disposable profile and no microphone/startup changes.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), output = path.join(root, '.verification');
fs.mkdirSync(output, { recursive: true });
const label = process.argv.find(value => value.startsWith('--label='))?.slice(8) || 'performance';
const profile = fs.mkdtempSync(path.join(output, 'performance-'));
app.setPath('userData', profile); app.setAppPath(root); app.setLoginItemSettings = () => {};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ firstRunComplete: true, openAtLogin: false, heyCortana: false,
  isMovable: !process.argv.includes('--classic'), themeColor: '#c04090', useWindowsAccent: false,
  ttsEngine: process.argv.includes('--edge') ? 'edge' : 'system' }));
const started = performance.now(), errors = [], result = { label };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const instrumentation = `window.perfProbe={tasks:[],paints:[],gaps:[],colors:[],phases:[]};
const voices=speechSynthesis.getVoices.bind(speechSynthesis);speechSynthesis.getVoices=()=>{const start=performance.now(),result=voices();perfProbe.phases.push({name:'getVoices',duration:performance.now()-start});return result;};
const setup=setupTTS;setupTTS=(...args)=>{const start=performance.now(),result=setup(...args);perfProbe.phases.push({name:'setupTTS',duration:performance.now()-start});return result;};
new PerformanceObserver(list=>perfProbe.tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
new PerformanceObserver(list=>perfProbe.paints.push(...list.getEntries().map(e=>({name:e.name,start:e.startTime})))).observe({type:'paint',buffered:true});
let previous=performance.now(),wasVisible=false;function sample(now){const visible=!document.hidden;if(visible&&wasVisible)perfProbe.gaps.push(now-previous);previous=now;wasVisible=visible;const text=document.getElementById('results-display');if(text?.textContent&&perfProbe.colors.length<180)perfProbe.colors.push({time:now,color:getComputedStyle(text).color,visible:document.visibilityState});requestAnimationFrame(sample);}requestAnimationFrame(sample);`;
app.on('browser-window-created', (_event, win) => {
  result.windowCreatedMs = performance.now() - started;
  win.on('show', () => { result.firstShowMs ??= performance.now() - started; });
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  win.webContents.on('dom-ready', () => win.webContents.executeJavaScript(instrumentation));
});
require('../main.js');
app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 300 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await delay(50); }
    if (!win) throw Error('Window never created');
    const js = code => win.webContents.executeJavaScript('(async()=>{' + code + '})()');
    await delay(5000); win.show(); win.focus();
    result.startup = await js("return {...perfProbe,initialized:!!notebookAnim,theme:themeColor};");
    await js("perfProbe.tasks=[];perfProbe.gaps=[];anim.renderer.active=true;");
    result.animations = [];
    for (const state of ['SPEAKING', 'LISTENING', 'THINKING', 'IDLE']) {
      const transition = await js(`const start=performance.now();await anim.goToState(AnimationState.${state});return {state:'${state}',loadMs:performance.now()-start,width:anim.renderer.gifWidth,height:anim.renderer.gifHeight};`);
      await delay(1200); result.animations.push(transition);
    }
    result.playback = await js("return {tasks:perfProbe.tasks,gaps:perfProbe.gaps,cacheEntries:gifCache.size,cacheBytes:[...gifCache.values()].reduce((n,e)=>n+(e.bytes||0),0)};");
    await js("ipcRenderer.emit('window-visibility',{},false);ipcRenderer.emit('window-focus',{},false);");
    result.hidden = await js("return {active:anim.renderer.active,timer:!!anim.renderer.timer};");
    await js("ipcRenderer.emit('window-visibility',{},true);ipcRenderer.emit('window-focus',{},true);");
    await delay(100);
    result.resumed = await js("return {active:anim.renderer.active,timer:!!anim.renderer.timer};");
    result.controls = await js("updateCloseButton(true);const dismiss=document.getElementById('close-btn').title==='Dismiss Cortana';updateCloseButton(false);const close=document.getElementById('close-btn').title==='Close Cortana';updateCloseButton(true);return {dismiss,close,correctTheme:getComputedStyle(resultsDisplay).color==='rgb(200, 89, 158)',lazyNotebook:notebookAnim.state===null,presentationKeys:Object.keys(window.cortana.presentation)};");
    await js("await anim.goToState(AnimationState.STATIC);");await delay(100);
    fs.writeFileSync(path.join(output,label+'-orb.png'),(await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, label + '.json'), JSON.stringify({ ...result, errors }, null, 2));
    const summarize = sample => ({ longTasks: sample.tasks.length, longestMs: Math.round(Math.max(0, ...sample.tasks.map(t => t.duration))),
      longestFrameGapMs: Math.round(Math.max(0, ...sample.gaps)), frames: sample.gaps.length });
    console.log('PERFORMANCE_RESULT', JSON.stringify({ windowCreatedMs:Math.round(result.windowCreatedMs),firstShowMs:Math.round(result.firstShowMs),
      startup:summarize(result.startup),playback:summarize(result.playback),phases:result.startup.phases,initialColors:[...new Set(result.startup.colors.map(c=>c.color))],animations:result.animations,
      hidden:result.hidden,resumed:result.resumed,controls:result.controls,cacheMB:Math.round(result.playback.cacheBytes/1048576),errors }));
    const passed = !errors.length && result.controls.dismiss && result.controls.close && result.controls.correctTheme && result.controls.lazyNotebook &&
      result.startup.colors.every(sample => sample.color === 'rgb(200, 89, 158)') && result.hidden.active === false && result.hidden.timer === false && result.resumed.active && result.resumed.timer;
    app.exit(passed ? 0 : 1);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => app.exit(1), 60000).unref();
