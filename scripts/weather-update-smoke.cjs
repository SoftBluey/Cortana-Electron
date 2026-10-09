// Uses a disposable profile. Fixtures exercise the real IPC and UI without opening a browser.
const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs'), path = require('node:path'), https = require('node:https');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '..'), output = path.join(root, '.verification');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'weather-update-')));
app.setAppPath(root); app.setLoginItemSettings = () => {};
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({openAtLogin:false,heyCortana:false,isMovable:true}));
const label = process.argv.find(value => value.startsWith('--label='))?.slice(8) || 'weather-update';
const version = require('../package.json').version, checks = [], errors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
require('../main.js');
app.whenReady().then(async () => {
  try {
    let win;
    for (let i=0;i<100&&!win;i++) { win=BrowserWindow.getAllWindows()[0];if(!win)await delay(50); }
    if(!win)throw Error('No window');
    win.webContents.on('console-message', event => { if(event.level==='error')errors.push(event.message); });
    await delay(5000);
    const js = code => win.webContents.executeJavaScript('(async()=>{' + code + '})()');
    const run = async (name, action) => {
      const result = await action(); const passed = result===true || result?.passed===true;
      checks.push({name,passed,result});console.log(passed?'PASS':'FAIL', name, passed?'':JSON.stringify(result));
      if(!passed)throw Error(name);
    };
    await js("speak=(text,done)=>done?.();Audio.prototype.play=()=>Promise.resolve();notebookData.profile.weatherCity='Chicago';");
    if(!process.argv.includes('--offline')) {
      await run('Live saved-city weather reaches Chicago through the actual service', () => js(`
        window.weatherLive=[];const original=window.fetch;
        window.fetch=(url,...args)=>{if(String(url).includes('open-meteo.com'))weatherLive.push(String(url));return original(url,...args);};
        try{processQuery('My weather');for(let i=0;i<160&&!resultsDisplay.textContent.includes('Currently in Chicago');i++)await new Promise(r=>setTimeout(r,100));
          return {passed:resultsDisplay.textContent.includes('Currently in Chicago')&&weatherLive.some(url=>url.includes('name=Chicago'))&&!weatherLive.some(url=>url.includes('name=My')),urls:weatherLive,text:resultsDisplay.textContent};
        }finally{window.fetch=original;}
      `));
      await run('Live GitHub release check uses the running app version', () => js(`
        const result=await ipcRenderer.invoke('check-for-updates');
        return {passed:!result.error&&result.currentVersion===${JSON.stringify(version)}&&typeof result.remoteVersion==='string',...result};
      `));
    }
    await run('Weather phrases use the saved city and explicit places override it', () => js(`
      const original=window.fetch;const requests=[];
      window.fetch=async url=>{url=String(url);requests.push(url);return {ok:true,json:async()=>url.includes('geocoding-api')?{results:[{name:'Test city',admin1:'Test region',country:'Test country',latitude:1,longitude:2}]}:{current_weather:{temperature:20,windspeed:4,weathercode:0}}};};
      const phrases=['My weather',"What's my weather?",'What’s my weather?','weather',"What's the weather?",'what is the weather like today','weather here','weather near me','weather in my area','weather for me','forecast','show me my weather'];
      try {
        for(const query of phrases){requests.length=0;processQuery(query);await new Promise(r=>setTimeout(r,20));const geo=requests.find(url=>url.includes('geocoding-api'));if(!geo||new URL(geo).searchParams.get('name')!=='Chicago')return {query,requests};}
        for(const [query,city] of [['weather in London','London'],["what is the weather like in New York?",'New York'],['São Paulo weather','São Paulo'],['weather in St. Louis today','St. Louis']]){requests.length=0;processQuery(query);await new Promise(r=>setTimeout(r,20));if(new URL(requests[0]).searchParams.get('name')!==city)return {query,requests};}
        return true;
      }finally{window.fetch=original;}
    `));
    await run('Missing city and future forecasts never geocode grammar words', () => js(`
      const original=window.fetch,profile=notebookData.profile;let calls=0;
      window.fetch=()=>{calls++;throw Error('Unexpected lookup');};
      try{for(const saved of ['',undefined]){notebookData.profile={...profile,weatherCity:saved};for(const query of ['my weather',"what's my weather",'weather in']){processQuery(query);if(!resultsDisplay.textContent.includes('Which city'))return {query,text:resultsDisplay.textContent};}}
        for(const query of ['weather tomorrow','weather in Chicago tomorrow','forecast for tonight']){processQuery(query);if(!resultsDisplay.textContent.includes("don't have a forecast"))return {query,text:resultsDisplay.textContent};}return calls===0;
      }finally{window.fetch=original;notebookData.profile=profile;}
    `));
    await run('Search-panel Execute uses the same saved-city weather route', () => js(`
      const originalFetch=window.fetch,originalInvoke=ipcRenderer.invoke;let city;
      window.fetch=async url=>{city??=new URL(String(url)).searchParams.get('name');return {ok:true,json:async()=>String(url).includes('geocoding-api')?{results:[{name:'Chicago',country:'US',latitude:1,longitude:2}]}:{current_weather:{temperature:20,windspeed:4,weathercode:0}}};};
      ipcRenderer.invoke=(channel,...args)=>channel==='search-web'?Promise.resolve([]):originalInvoke.call(ipcRenderer,channel,...args);
      try{const categories=await generateCategorizedResults("what's my weather?");showSearchPanel(categories);const item=allPanelItems.find(item=>item.el.textContent.includes('Use a built-in command'));if(!item)return false;item.action();await new Promise(r=>setTimeout(r,20));hideSearchPanel();return city==='Chicago';}
      finally{window.fetch=originalFetch;ipcRenderer.invoke=originalInvoke;}
    `));
    const originalGet=https.get, originalOpen=shell.openExternal;
    let fixture, calls=0, opened=[];
    shell.openExternal=async url=>{opened.push(url);};
    https.get=(url,options,callback)=>{
      if(String(url)!=='https://api.github.com/repos/SoftBluey/Cortana-Electron/releases/latest')return originalGet(url,options,callback);
      calls++; const selected=fixture,req=new EventEmitter();
      req.destroy=error=>{queueMicrotask(()=>req.emit('error',error));};
      req.setTimeout=(_ms,onTimeout)=>{if(selected.timeout)queueMicrotask(onTimeout);return req;};
      setTimeout(()=>{
        if(selected.timeout)return;
        if(selected.networkError){req.emit('error',Error('Simulated offline'));return;}
        const res=new EventEmitter();res.statusCode=selected.status||200;res.resume=()=>{};res.setEncoding=()=>{};
        callback(res);if(res.statusCode!==200)return;
        if(selected.aborted){res.emit('aborted');return;}
        res.emit('data',selected.raw??JSON.stringify(selected.release));res.emit('end');
      },20);return req;
    };
    const release=tag=>({tag_name:tag,html_url:'https://github.com/SoftBluey/Cortana-Electron/releases/tag/'+tag});
    try{
      await js('await showSettingsUI();');
      fixture={release:release('v99.0.0')};calls=0;
      await run('Concurrent real IPC update checks share one request',()=>js(`const results=await Promise.all([cortana.checkForUpdates(),cortana.checkForUpdates()]);return results.every(r=>r.available&&r.currentVersion===${JSON.stringify(version)}&&r.remoteVersion==='99.0.0');`).then(result=>result&&calls===1));
      await run('Newer-release banner opens only its verified GitHub page',async()=>{
        const result=await js("const banner=document.getElementById('update-available'),button=document.getElementById('update-button');const visible=banner.style.display==='block'&&!button.disabled&&banner.textContent.includes('99.0.0');button.click();await new Promise(r=>setTimeout(r,50));return visible;");
        return result&&opened.length===1&&opened[0]===release('v99.0.0').html_url;
      });
      for(const tag of ['v'+version,'v1.0.0']){
        fixture={release:release(tag)};
        await run('Equal or older release cannot offer a downgrade ('+tag+')',()=>js("const result=await cortana.checkForUpdates();return !result.error&&!result.available&&document.getElementById('update-available').style.display==='none'&&document.getElementById('update-button').disabled;"));
      }
      const failures=[['HTTP failure',{status:503}],['network failure',{networkError:true}],['timeout',{timeout:true}],['interrupted response',{aborted:true}],['invalid JSON',{raw:'{broken'}],['oversized response',{raw:JSON.stringify(release('v99.0.0'))+' '.repeat(1024*1024)}],['draft',{release:{...release('v99.0.0'),draft:true}}],['prerelease',{release:{...release('v99.0.0'),prerelease:true}}],['untrusted release URL',{release:{...release('v99.0.0'),html_url:'https://example.com/download'}}]];
      for(const [name,value]of failures){fixture=value;await run('Update check recovers safely from '+name,()=>js(`await document.getElementById('check-updates-button').onclick();const result=await cortana.openUpdateRelease();return !document.getElementById('check-updates-button').disabled&&document.getElementById('update-feedback').textContent.includes('Could not check')&&document.getElementById('update-button').disabled&&!result.success;`));}
      fixture={release:release('v'+version)};
      await run('Retry after an update failure restores the normal UI',()=>js("await document.getElementById('check-updates-button').onclick();return document.getElementById('update-feedback').textContent.includes('latest release')&&!document.getElementById('check-updates-button').disabled;"));
    }finally{https.get=originalGet;shell.openExternal=originalOpen;}
    fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify({checks,errors},null,2));
    console.log('WEATHER_UPDATE_RESULT',JSON.stringify({passed:checks.filter(c=>c.passed).length,total:checks.length,errors}));
    app.exit(errors.length?1:0);
  }catch(error){fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify({checks,errors,error:error.message},null,2));console.error(error);app.exit(1);}
});
setTimeout(()=>app.exit(1),60000).unref();
