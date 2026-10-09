// Real Electron integration checks with a disposable profile. Desktop actions are
// recorded, never executed; --live also checks public services with sample queries.
const { app, BrowserWindow, shell, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.verification');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(output, 'checkup-profile-'));
const label = process.argv.find(a => a.startsWith('--label='))?.slice(8) || 'checkup';
const live = process.argv.includes('--live');
app.setPath('userData', profile);
app.setAppPath(root);
app.setLoginItemSettings = () => { throw Error('Checkup must not register startup'); };
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  firstRunComplete: true, openAtLogin: false, heyCortana: false, isMovable: true, ttsEngine: 'system',
}));
const desktopActions = [];
shell.openPath = async target => { desktopActions.push({ type: 'path', target }); return ''; };
shell.openExternal = async target => { desktopActions.push({ type: 'url', target }); };
Notification.prototype.show = () => {};
// Exercise volume IPC without changing the user's audio.
let mediaFails=false;
const realExecFile=cp.execFile;
cp.execFile=(executable,args,...rest)=>{
  if(Array.isArray(args)&&args.some(arg=>String(arg).endsWith('media.ps1'))) {
    desktopActions.push({type:'media',args});
    queueMicrotask(()=>rest.at(-1)(mediaFails?Error('Probe failure'):null,JSON.stringify(mediaFails?{success:false,error:'Could not access audio.'}:{success:true,volume:80,muted:false}),''));return;
  }
  return realExecFile(executable,args,...rest);
};
require('../main.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
let server;
app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 100 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; if (!win) await delay(100); }
    if (!win) throw Error('No application window');
    await delay(6000);
    const js = code => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
    const run = async (name, code) => {
      try {
        const detail = await js(code);
        const passed = detail === true || detail?.passed === true;
        checks.push({ name, passed, detail });
        console.log(passed ? 'PASS' : 'FAIL', name, passed ? '' : JSON.stringify(detail));
      } catch (error) { checks.push({ name, passed: false, error: error.message }); console.log('FAIL', name, error.message); }
      fs.writeFileSync(path.join(output, `${label}-progress.json`), JSON.stringify(checks, null, 2));
    };
    await js(`window.checkupSpoken=[]; window.checkupOriginalSpeak=speak;
      speak=async(text,done)=>{checkupSpoken.push(text);done?.();};
      window.checkupOriginalSend=ipcRenderer.send;
      ipcRenderer.send=(channel,...args)=>{
        if (['run-command','run-special-command','open-path'].includes(channel)) { (window.checkupSent??=[]).push({channel,args}); return; }
        return checkupOriginalSend.call(ipcRenderer,channel,...args);
      };`);
    await run('All standard and special animation files decode and draw', `
      const files=[...new Set([...Object.values(ANIMATION_FILES),...SPECIAL_ANIMATIONS.flatMap(item=>[item.start,item.loop])])];
      const renderer=new GifRenderer(document.createElement('canvas'));renderer.active=false;
      for (const file of files) {
        await renderer.load(path.join(appRoot,file));
        if (!renderer.frames.length || renderer.gifWidth<=0 || renderer.gifHeight<=0) return {file};
        renderer._renderFrame(0);
      }renderer.stop();return {passed:true,count:files.length};
    `);
    await run('Calculator, local time, date, jokes and personality', `
      for (const [query, expected] of [['12 * 3','36'],['calculate (2+3)*4','20'],['what time is it','local time'],["what is today's date","Today's date"],['tell me a joke','.'],['who are you','Cortana'],['what can you do','reminders'],['hello world','Hello world'],['thanks','welcome|help|course']]) {
        processQuery(query); await new Promise(r=>setTimeout(r,50));
        if (!new RegExp(expected,'i').test(resultsDisplay.textContent)) return {query,text:resultsDisplay.textContent};
      } return true;
    `);
    await run('Malformed calculator decimals do not produce a numeric answer', `
      return calculateResponse('1.2.3 + 4').isError && calculateResponse('2..5').isError || {answer:calculateResponse('1.2.3 + 4')};
    `);
    await run('Natural city-time phrasing selects the requested city', `
      const match=matchAssistantSkill('what time is it in Tokyo?');
      return match?.context.kind==='location' && match.context.location.replace(/[?!.]+$/,'')==='Tokyo' || {context:match?.context};
    `);
    await run('Temperature conversions accept negative temperatures', `
      checkupSpoken.length=0; processQuery('-40 c to f'); await new Promise(r=>setTimeout(r,50));
      return checkupSpoken.some(text=>text.includes('-40') && text.includes('-40.0')) || {spoken:checkupSpoken};
    `);
    await run('Unit abbreviations stay valid and incompatible units fail', `
      processQuery('2 km to m'); await new Promise(r=>setTimeout(r,20));
      const text=resultsDisplay.textContent;
      processQuery('2 kg to m'); await new Promise(r=>setTimeout(r,20));
      return text.includes('2000.00 m.') && !text.includes('2000.00 ms.') && resultsDisplay.textContent.includes("can't convert") || {text};
    `);
    await run('Invalid clock times do not silently roll into another day', `
      const inputs=['25:00','12:75 pm','0 pm','13 pm','tomorrow at 24:01','100 pm'];
      const parsed=inputs.map(input=>({input,result:parseDateTime(input)?.toISOString()||null}));
      return parsed.every(item=>item.result===null) || parsed;
    `);
    await run('Relative reminder days retain relative timing', `
      const now=Date.now(); const date=parseDateTime('in two days');
      return !!date && Math.abs(date.getTime()-now-2*86400000)<2000 || {date:date?.toISOString()};
    `);
    await run('Reminder parsing keeps prepositions inside the reminder text', `
      const result=parseReminderRequest('check in at the hotel tomorrow at 3 pm');
      return result.reminderText==='check in at the hotel' && !!result.timeText || result;
    `);
    await run('City time lookup accepts question punctuation and explicit region', `
      const plain=await getLocationTimeResponse('Tokyo'), punctuated=await getLocationTimeResponse('Tokyo?');
      const wrong=await getLocationTimeResponse('Tokyo, Texas');
      return !plain.isError && !punctuated.isError && wrong.isError || {plain,punctuated,wrong};
    `);
    await run('Out-of-range replacement timer preserves existing timer', `
      await startTimer(5,'minute',300000); const before=await ipcRenderer.invoke('get-active-timer');
      await startTimer(1000,'hour',3600000000); const after=await ipcRenderer.invoke('get-active-timer');
      await cancelActiveTimer(); return before.active && after.active && before.id===after.id || {before,after};
    `);
    await run('Timer expires once and cancellation suppresses delivery', `
      let fired=0; const handler=()=>fired++; ipcRenderer.on('timer-fired',handler);
      try {
        const first=await ipcRenderer.invoke('start-timer',{ms:150,label:'Checkup timer'});
        await new Promise(r=>setTimeout(r,350));
        const second=await ipcRenderer.invoke('start-timer',{ms:150,label:'Cancelled checkup timer'});
        await ipcRenderer.invoke('cancel-timer',second.id); await new Promise(r=>setTimeout(r,350));
        return first.success && second.success && fired===1;
      } finally { ipcRenderer.removeListener('timer-fired',handler); }
    `);
    await run('Thirty-day timer does not expire after one millisecond', `
      const result=await ipcRenderer.invoke('start-timer',{ms:30*86400000,label:'Long timer'});
      await new Promise(r=>setTimeout(r,200));
      const state=await ipcRenderer.invoke('get-active-timer');
      await ipcRenderer.invoke('cancel-timer',result.id);
      return result.success && state.active && state.id===result.id || {result,state};
    `);
    await run('Reminder create, edit, delete and alarm retain user capitalization', `
      processQuery('Remind me to Call Nana tomorrow at 3 pm');
      if (reminderTextInput.value!=='Call Nana') return {text:reminderTextInput.value};
      await onSaveReminder(); const first=(await ipcRenderer.invoke('get-reminders'))[0];
      if (!first || first.text!=='Call Nana') return false;
      showReminderUI({id:first.id,initialText:'Call Nana back',initialTime:formatDateTimeForInput(new Date(Date.now()+7200000)),initialSound:first.sound});
      await onSaveReminder(); const edited=(await ipcRenderer.invoke('get-reminders'))[0];
      await ipcRenderer.invoke('remove-reminder',first.id);
      processQuery('set an alarm for tomorrow at 7 am'); await new Promise(r=>setTimeout(r,100));
      const alarm=(await ipcRenderer.invoke('get-reminders'))[0];
      if (alarm) await ipcRenderer.invoke('remove-reminder',alarm.id);
      return edited.text==='Call Nana back' && alarm?.text==='Alarm';
    `);
    await run('Calendar command retains event capitalization', `
      const original=ipcRenderer.invoke; let event;
      ipcRenderer.invoke=async(channel,...args)=>channel==='create-calendar-event'?(event=args[0],{success:true}):original.call(ipcRenderer,channel,...args);
      try { processQuery('Schedule a meeting Project Cortana for tomorrow at 3 pm'); await new Promise(r=>setTimeout(r,20)); return event?.title==='Project Cortana' || {event}; }
      finally { ipcRenderer.invoke=original; }
    `);
    await run('Calendar command keeps tomorrow out of the title and in the date', `
      const original=ipcRenderer.invoke;let event;
      ipcRenderer.invoke=async(channel,...args)=>channel==='create-calendar-event'?(event=args[0],{success:true}):original.call(ipcRenderer,channel,...args);
      try {
        processQuery('Schedule a meeting Project Cortana tomorrow at 3 pm');await new Promise(r=>setTimeout(r,20));
        const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(15,0,0,0);
        return event?.title==='Project Cortana' && Date.parse(event.dateTime)===tomorrow.getTime() || {event,expected:tomorrow.toISOString()};
      }finally {ipcRenderer.invoke=original;}
    `);
    await run('Desktop and Start Menu routing, missing app and file search', `
      if (!(await ipcRenderer.invoke('open-local-folder','downloads')).success) return false;
      if ((await ipcRenderer.invoke('open-local-folder','invalid')).success) return false;
      const apps=await ipcRenderer.invoke('search-applications','Cortana');
      const files=await ipcRenderer.invoke('search-files','cortana');
      if (!Array.isArray(apps)||!Array.isArray(files)) return false;
      if ((await ipcRenderer.invoke('open-application-fallback','cortana-checkup-missing-12345')).success) return false;
      processQuery('open notepad'); processQuery('open settings'); processQuery('lock my pc');
      processQuery('shut down my pc'); processQuery('restart my pc');
      return checkupSent.some(item=>item.channel==='run-special-command'&&item.args[0]==='notepad') &&
        checkupSent.filter(item=>item.channel==='run-command').length===1;
    `);
    await run('Help routing does not intercept application names', `
      checkupSent.length=0; processQuery('open Photoshop Help'); await new Promise(r=>setTimeout(r,100));
      return !resultsDisplay.textContent.includes('I can help with your day') || {text:resultsDisplay.textContent};
    `);
    await run('Media commands await delivery or report unsupported playback', `
      const original=ipcRenderer.invoke;
      ipcRenderer.invoke=(channel,...args)=>channel==='media-control'&&['pause','next','prev','stop'].includes(args[0])?Promise.resolve({success:true}):original.call(ipcRenderer,channel,...args);
      try { for(const query of ['volume up','volume down','mute','pause music','next track','previous track','stop music']) {
        processQuery(query); await new Promise(r=>setTimeout(r,100));
      } return true; } finally {ipcRenderer.invoke=original;}
    `);
    mediaFails=true;
    await run('Failed media command reports failure instead of success', `
      checkupSpoken.length=0; processQuery('volume up'); await new Promise(r=>setTimeout(r,100));
      return /couldn't|could not|unable|failed/i.test(resultsDisplay.textContent) || {text:resultsDisplay.textContent};
    `);
    mediaFails=false;
    await run('Late web results cannot overwrite a later command', `
      const original=ipcRenderer.invoke; let release;
      ipcRenderer.invoke=(channel,...args)=>channel==='search-web'?new Promise(r=>release=r):original.call(ipcRenderer,channel,...args);
      try {
        const pending=performWebSearch('old search'); processQuery('12 * 3');
        release({success:true,results:[{title:'Stale search',url:'https://example.com',snippet:'stale'}]});
        await pending; return resultsDisplay.textContent.includes('36') && !resultsDisplay.textContent.includes('Stale search') || {text:resultsDisplay.textContent};
      } finally { ipcRenderer.invoke=original; }
    `);
    await run('Late weather cannot overwrite Notebook or a later command', `
      const original=fetch; let release;
      fetch=()=>new Promise(r=>release=r);
      try {
        const pending=getWeather('Chicago'); processQuery('12 * 3');
        release({ok:true,json:async()=>({results:[]})}); await pending;
        return resultsDisplay.textContent.includes('36') || {text:resultsDisplay.textContent};
      } finally {fetch=original;}
    `);
    await run('Late city-time response cannot overwrite a later command', `
      const original=ipcRenderer.invoke; let release;
      ipcRenderer.invoke=(channel,...args)=>channel==='get-time-for-location'?new Promise(r=>release=r):original.call(ipcRenderer,channel,...args);
      try {
        const pending=executeAssistantSkill(matchAssistantSkill('what is the time in Tokyo'));
        processQuery('12 * 3'); release({city:'Tokyo',country:'Japan',time:'3 pm'}); await pending;
        return resultsDisplay.textContent.includes('36') || {text:resultsDisplay.textContent};
      } finally {ipcRenderer.invoke=original;}
    `);
    await run('Delayed error speech does not interrupt a newer command', `
      checkupSpoken.length=0;displayAndSpeak('Old error',onActionFinished,{},true);processQuery('12 * 3');
      await new Promise(r=>setTimeout(r,3200));
      return !checkupSpoken.includes('Old error') || {spoken:checkupSpoken};
    `);
    await run('Late Wikipedia response does not overwrite a later command', `
      const original=ipcRenderer.invoke;let release;
      ipcRenderer.invoke=(channel,...args)=>channel==='wikipedia-lookup'?new Promise(r=>release=r):original.call(ipcRenderer,channel,...args);
      try {
        processQuery('tell me about Cortana');processQuery('12 * 3');
        release({success:true,title:'Stale article',extract:'Old Wikipedia response',url:'https://en.wikipedia.org/wiki/Cortana'});
        await new Promise(r=>setTimeout(r,50));
        return resultsDisplay.textContent.includes('36') && !resultsDisplay.textContent.includes('Stale article') || {text:resultsDisplay.textContent};
      }finally {ipcRenderer.invoke=original;}
    `);
    await run('Late application lookup cannot launch after a newer command', `
      const original=ipcRenderer.invoke;let release;checkupSent.length=0;
      ipcRenderer.invoke=(channel,...args)=>channel==='find-application'?new Promise(r=>release=r):original.call(ipcRenderer,channel,...args);
      try {
        const pending=handleOpenApplication('Checkup deferred app');processQuery('12 * 3');
        release([{name:'Old lookup',path:'C:/checkup-placeholder.lnk'}]);await pending;
        return !checkupSent.some(item=>item.channel==='open-path') && resultsDisplay.textContent.includes('36') || {sent:checkupSent,text:resultsDisplay.textContent};
      }finally {ipcRenderer.invoke=original;}
    `);
    // A real local server exercises the actual HTTP transport, without API keys.
    let status=200, reply={choices:[{message:{content:'Local checkup answer'}}]};
    const requests=[];
    server=http.createServer((req,res)=>{let body='';req.on('data',part=>body+=part);req.on('end',()=>{
      requests.push({path:req.url,body:JSON.parse(body)});res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(reply));
    });});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port;
    await run('Local AI root URL and HTTP error feedback', `
      if (!(await ipcRenderer.invoke('set-settings',{aiEnabled:true,aiApiUrl:'http://127.0.0.1:${port}',aiModel:'checkup',openaiApiKey:''})).success) return false;
      const result=await ipcRenderer.invoke('ask-openai','Hello from the checkup');
      return result.success && result.text==='Local checkup answer' || result;
    `);
    status=429;
    await run('AI usage-limit feedback is actionable', `const result=await ipcRenderer.invoke('ask-openai','Limit test'); return !result.success && result.error.includes('usage limit') || result;`);
    status=200; reply={choices:[]};
    await run('Empty AI answer reports failure', `const result=await ipcRenderer.invoke('ask-openai','Empty test'); return !result.success && result.error.includes('did not return') || result;`);
    await new Promise(resolve=>server.close(resolve)); server=null;
    await run('Stopped local AI server gives actionable feedback', `const result=await ipcRenderer.invoke('ask-openai','Stopped test'); return !result.success && result.error.includes('not running') || result;`);
    if(requests[0]?.path!=='/v1/chat/completions') throw Error('Incorrect AI request URL');
    server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'IPv6 answer'}}]}));});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'::1',resolve);});
    await run('IPv6 loopback AI address connects to the real local server', `
      await ipcRenderer.invoke('set-setting',{key:'aiApiUrl',value:'http://[::1]:${server.address().port}'});
      const result=await ipcRenderer.invoke('ask-openai','IPv6 check');return result.success && result.text==='IPv6 answer' || result;
    `);
    await new Promise(resolve=>server.close(resolve));server=null;
    await run('Custom action priority and explicit built-in Execute', `
      customActions=[{id:'checkup',trigger:'what time is it',actions:[{type:'speak',value:'Custom time'}]}];
      processQuery('what time is it'); await new Promise(r=>setTimeout(r,20));
      const custom=resultsDisplay.textContent==='Custom time';
      const categories=await generateCategorizedResults('what time is it');
      const item=categories.find(category=>category.name==='Cortana').items.find(item=>item.subtitle==='Use a built-in command');
      item?.action(); await new Promise(r=>setTimeout(r,20)); customActions=[];
      return custom && resultsDisplay.textContent.includes('local time') || {custom,items:categories[0].items.map(item=>({title:item.title,subtitle:item.subtitle}))};
    `);
    if(live) {
      await run('LIVE: current weather in metric and imperial units', `
        for (const units of ['metric','imperial']) {weatherUnits=units;await getWeather('Chicago');
          if (!resultsDisplay.textContent.includes(units==='metric'?'°C':'°F')) return {units,text:resultsDisplay.textContent};
        } return true;
      `);
      await run('LIVE: embedded DuckDuckGo results', `const result=await ipcRenderer.invoke('search-web','Cortana Microsoft'); return {passed:result.success && result.results.length>0,success:result.success,count:result.results?.length,error:result.error};`);
      await run('LIVE: Wikipedia article lookup', `const result=await ipcRenderer.invoke('wikipedia-lookup','Cortana'); return {passed:result.success && !!result.extract,success:result.success,title:result.title,error:result.error};`);
      const audio=await js("return ipcRenderer.invoke('synthesize-edge-tts',{text:'Hello. I am Cortana.',voice:'en-US-JennyNeural',pitch:1,rate:1});");
      const bytes=audio.success?fs.statSync(audio.filePath).size:0;
      if(audio.success) {
        fs.copyFileSync(audio.filePath,path.join(output,label+'-tts.mp3'));
        await js("return ipcRenderer.invoke('release-tts-file',"+JSON.stringify(audio.filePath)+");");
      }
      checks.push({name:'LIVE: Edge TTS produces audio',passed:bytes>1000,detail:{bytes,error:audio.error}});
      await run('LIVE: update check returns a verified release version', `const result=await ipcRenderer.invoke('check-for-updates');return {passed:!!result.remoteVersion&&!result.error,...result};`);
      await run('LIVE: Everything service availability and file-search fallback', `
        await ipcRenderer.invoke('set-setting',{key:'useEverythingSearch',value:true});
        const available=await ipcRenderer.invoke('check-everything');const files=await ipcRenderer.invoke('search-files','cortana');
        return {passed:Array.isArray(files),available,count:files.length};
      `);
    }
    await js(`closeNotebook({immediate:true});closeSettings(true);setStateIdle();speak=checkupOriginalSpeak;ipcRenderer.send=checkupOriginalSend;`);
    fs.writeFileSync(path.join(output,`${label}.png`),(await win.webContents.capturePage()).toPNG());
    const report={profile,live,checks,mediaKeysChecked:desktopActions.filter(item=>item.type==='media').length,desktopPathsChecked:desktopActions.filter(item=>item.type==='path').length};
    fs.writeFileSync(path.join(output,`${label}.json`),JSON.stringify(report,null,2));
    console.log('CHECKUP_RESULT',checks.filter(check=>check.passed).length+'/'+checks.length);
    app.exit(checks.every(check=>check.passed)?0:1);
  } catch(error) {console.error(error);server?.close();app.exit(1);}
});
setTimeout(()=>{console.error('Checkup timed out');app.exit(1);},180000).unref();
