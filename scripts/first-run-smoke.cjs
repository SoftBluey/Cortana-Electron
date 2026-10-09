// Real onboarding, disposable profiles, original GIFs. Never enables microphone or startup.
const { app, BrowserWindow } = require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.verification');fs.mkdirSync(output,{recursive:true});
const reuse=process.argv.find(value=>value.startsWith('--profile='))?.slice(10);
const profile=reuse?path.resolve(reuse):fs.mkdtempSync(path.join(output,'first-run-'));
if(!profile.toLowerCase().startsWith(output.toLowerCase()+path.sep))throw Error('Only disposable verification profiles allowed');
const existing=process.argv.includes('--existing'),completed=process.argv.includes('--completed'),skip=process.argv.includes('--skip');
const label=process.argv.find(value=>value.startsWith('--label='))?.slice(8)||'first-run';
app.setPath('userData',profile);app.setAppPath(root);app.setLoginItemSettings=()=>{throw Error('Unexpected startup mutation');};
if(existing&&!reuse)fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({openAtLogin:false,heyCortana:false,isMovable:true,themeColor:'#c04090'}));
if(!reuse)fs.writeFileSync(path.join(profile,'notebook.json'),JSON.stringify({notes:'Keep this note',todos:[{id:'keep',text:'Keep this task',done:false}],introduced:true,profile:{name:'',home:'',work:'',weatherCity:''}}));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[],errors=[];
require('../main.js');
app.whenReady().then(async()=>{
 try{
  let win;for(let i=0;i<100&&!win;i++){win=BrowserWindow.getAllWindows()[0];if(!win)await delay(50);}
  if(!win)throw Error('No window');win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  await delay(2500);win.show();win.focus();await delay(350);
  const js=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()');
  const run=async(name,code)=>{const result=await js(code),passed=result===true||result?.passed===true;checks.push({name,passed,result});console.log(passed?'PASS':'FAIL',name,passed?'':JSON.stringify(result));if(!passed)throw Error(name);};
  await js("speak=(text,done)=>done?.();Audio.prototype.play=()=>Promise.resolve();");
  if(completed){
   await run('Finished or skipped setup stays closed after a real process restart',"const settings=await cortana.getSettings(),data=await cortana.getNotebook();return settings.firstRunComplete&&!firstRun.visible&&!searchBar.disabled&&data.notes==='Keep this note'&&data.todos[0].id==='keep';");
   if(!skip)await run('Chosen name and weather city survive restart',"return notebookData.profile.name==='Bluey'&&notebookData.profile.weatherCity==='Chicago';");
  }else{
   if(existing){
    await run('Existing installation migrates without interrupting Home',"return (await cortana.getSettings()).firstRunComplete&&!firstRun.visible&&!searchBar.disabled;");
    await js("await showSettingsUI();document.getElementById('first-run-replay').click();");await delay(350);
    await run('Settings can replay the original introduction',"return firstRun.visible&&settingsContainer.hidden&&document.getElementById('first-run-next').textContent==='Next';");
   }else await run('Fresh or unfinished installation opens the tour before Home',"return !(await cortana.getSettings()).firstRunComplete&&firstRun.visible&&searchBar.disabled&&micBtn.disabled&&animationContainer.inert;");
   fs.writeFileSync(path.join(output,label+'-welcome.png'),(await win.webContents.capturePage()).toPNG());
   await run('Original layout keeps its header, scrolling cards and fixed footer above Search',"const panel=document.getElementById('first-run-panel').getBoundingClientRect(),scroll=document.getElementById('first-run-features').getBoundingClientRect(),footer=document.querySelector('.first-run-actions').getBoundingClientRect(),search=document.querySelector('.search-container').getBoundingClientRect(),close=document.getElementById('close-btn').getBoundingClientRect();const closeVisible=close.width>0?!!document.elementFromPoint(close.left+close.width/2,close.top+close.height/2)?.closest('#close-btn'):document.body.classList.contains('movable-mode');return {passed:panel.left===48&&panel.bottom<=search.top+1&&scroll.bottom<=footer.top+1&&footer.bottom<=search.top+1&&closeVisible,panel:panel.toJSON(),scroll:scroll.toJSON(),footer:footer.toJSON(),search:search.toJSON()};");
   await js("window.tourFrames={};const render=GifRenderer.prototype._renderFrame;GifRenderer.prototype._renderFrame=function(...args){const file=this.canvas.dataset.tourGif;if(file)tourFrames[file]=(tourFrames[file]||0)+1;return render.apply(this,args);};");
   await delay(300);
   await run('Supplied reminder illustration loops in the live view',"return (tourFrames['reminder.gif']||0)>2;");
   await run('GIFs are tinted in the accent colour with transparent backgrounds',"applyThemeColor('#c04090');const canvas=document.querySelector('[data-tour-gif=\"reminder.gif\"]'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let clear=false,tinted=false;for(let i=0;i<pixels.length;i+=4){clear||=pixels[i+3]===0;tinted||=pixels[i]>150&&pixels[i+1]<80&&pixels[i+2]>100;}return clear&&tinted;");
   await run('Action text stays readable with a very light accent',"applyThemeColor('#ffffff');const style=getComputedStyle(document.getElementById('first-run-next'));const readable=style.color==='rgb(0, 0, 0)'&&style.backgroundColor==='rgb(255, 255, 255)';applyThemeColor('#c04090');return readable;");
   await js("document.getElementById('first-run-features').scrollTop=100000;");await delay(300);
   await run('Offscreen cards pause while newly visible cards animate',"const before=tourFrames['reminder.gif']||0,other=tourFrames['others.gif']||0;await new Promise(r=>setTimeout(r,300));return (tourFrames['reminder.gif']||0)===before&&(tourFrames['others.gif']||0)>other;");
   win.hide();await delay(150);
   await run('Hidden tour pauses every illustration',"const before=JSON.stringify(tourFrames);await new Promise(r=>setTimeout(r,250));return JSON.stringify(tourFrames)===before;");
   win.show();win.focus();await delay(350);
   await run('Reopening resumes the same tour without revealing Home underneath',"const before=tourFrames['others.gif']||0;await new Promise(r=>setTimeout(r,200));return firstRun.visible&&animationContainer.inert&&(tourFrames['others.gif']||0)>before;");
   win.webContents.debugger.attach('1.3');
   await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(150);
   await run('Reduced motion keeps the illustrations static',"const before=JSON.stringify(tourFrames);await new Promise(r=>setTimeout(r,200));return matchMedia('(prefers-reduced-motion: reduce)').matches&&JSON.stringify(tourFrames)===before;");
   await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});win.webContents.debugger.detach();await delay(150);
   await run('Reminder alerts do not speak over the introduction',"let count=0;const previous=speak;speak=()=>{count++;};try{ipcRenderer.emit('timer-fired',{}, {id:'tour-test',label:'Test'});return firstRun.visible&&count===0;}finally{speak=previous;}");
   await js("await showSettingsUI();applyThemeColor('#0078d7');document.getElementById('navigation-home').click();");await delay(200);
   if(!existing)await run('Returning from Settings resumes unfinished setup',"return firstRun.visible&&searchBar.disabled;");
   else await js('await openFirstRun();');
   if(skip){
    await js("document.getElementById('first-run-back').click();");await delay(200);
    await run('Not interested remembers the choice without changing personal details',"return (await cortana.getSettings()).firstRunComplete&&!firstRun.visible&&!searchBar.disabled&&notebookData.profile.name===''&&notebookData.profile.weatherCity==='';");
   }else{
    await js("document.getElementById('first-run-next').click();document.getElementById('first-run-name').value='Bluey';document.getElementById('first-run-weather').value='Chicago';");
    await run('Optional setup shows flat controls and focuses the name field',"return document.getElementById('first-run-features').hidden&&!document.getElementById('first-run-personal').hidden&&document.activeElement.id==='first-run-name'&&document.getElementById('first-run-next').textContent==='Get started'&&getComputedStyle(document.getElementById('first-run-name')).borderRadius==='0px';");
    await delay(250);fs.writeFileSync(path.join(output,label+'-personal.png'),(await win.webContents.capturePage()).toPNG());
    await js("document.getElementById('first-run-back').click();document.getElementById('first-run-next').click();");
    await run('Back and Next retain the optional entries',"return document.getElementById('first-run-name').value==='Bluey'&&document.getElementById('first-run-weather').value==='Chicago';");
    if(!existing){
      await js("document.getElementById('close-btn').click();");await delay(300);
      if(win.isVisible())throw Error('Setup did not dismiss');
      win.show();win.focus();await js("ipcRenderer.emit('trigger-enter-animation',{}, {timeSinceHidden:1000});");await delay(100);
      await run('Dismissing during setup retains the current page and unsaved entries',"return firstRun.visible&&!document.getElementById('first-run-personal').hidden&&document.getElementById('first-run-name').value==='Bluey'&&document.getElementById('first-run-weather').value==='Chicago'&&!(await cortana.getSettings()).firstRunComplete;");
    }
    win.webContents.setZoomFactor(1.25);await delay(100);
    await run('Larger text keeps fields and action buttons inside the setup pane',"const panel=document.getElementById('first-run-panel').getBoundingClientRect(),buttons=[...document.querySelectorAll('.first-run-actions button')].map(e=>e.getBoundingClientRect()),fields=[...document.querySelectorAll('#first-run-personal input')].map(e=>e.getBoundingClientRect()),search=document.querySelector('.search-container').getBoundingClientRect();return buttons.concat(fields).every(r=>r.left>=panel.left&&r.right<=panel.right+1)&&panel.bottom<=search.top+1;");
    win.webContents.setZoomFactor(1);await delay(100);
    await run('Failed saves keep the tour, editable fields and retry available',"const invoke=ipcRenderer.invoke;ipcRenderer.invoke=(channel,...args)=>channel==='save-notebook'?Promise.resolve({success:false,error:'Test: setup not saved'}):invoke.call(ipcRenderer,channel,...args);try{document.getElementById('first-run-next').click();await new Promise(r=>setTimeout(r,100));return firstRun.visible&&!document.getElementById('first-run-error').hidden&&!document.getElementById('first-run-next').disabled&&!document.getElementById('first-run-continue').hidden&&document.getElementById('first-run-name').value==='Bluey';}finally{ipcRenderer.invoke=invoke;}");
    if(process.argv.includes('--continue-for-now')) {
      await js("document.getElementById('first-run-continue').click();");
      await run('An unsaved setup can be left without blocking Home or claiming it was saved',"return !firstRun.visible&&!firstRunNeeded&&!searchBar.disabled&&!(await cortana.getSettings()).firstRunComplete&&notebookData.profile.name==='';");
    }else {
    await run('A completion-save failure preserves saved details and permits a safe retry',"const invoke=ipcRenderer.invoke,before=(await cortana.getSettings()).firstRunComplete;ipcRenderer.invoke=(channel,...args)=>channel==='set-setting'&&args[0]?.key==='firstRunComplete'?Promise.resolve({success:false,error:'Test: completion not saved'}):invoke.call(ipcRenderer,channel,...args);try{document.getElementById('first-run-next').click();await new Promise(r=>setTimeout(r,150));const data=await cortana.getNotebook();return firstRun.visible&&!document.getElementById('first-run-next').disabled&&!document.getElementById('first-run-error').hidden&&data.profile.name==='Bluey'&&data.profile.weatherCity==='Chicago'&&(await cortana.getSettings()).firstRunComplete===before;}finally{ipcRenderer.invoke=invoke;}");
    await js("document.getElementById('first-run-name').focus();");
    win.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'char',keyCode:'\r'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});await delay(250);
    await run('Finishing saves name and city, preserves old Notebook data and returns to Home',"const data=await cortana.getNotebook(),settings=await cortana.getSettings();return {passed:settings.firstRunComplete&&!firstRun.visible&&!searchBar.disabled&&!micBtn.disabled&&!animationContainer.inert&&data.profile.name==='Bluey'&&data.profile.weatherCity==='Chicago'&&data.notes==='Keep this note'&&data.todos[0].id==='keep'&&settings.heyCortana===false,data,complete:settings.firstRunComplete,visible:firstRun.visible,active:document.activeElement.id,buttonType:document.getElementById('first-run-next').type};");
    await run('Setup weather city is used by the actual command route',"const original=getWeather;let location;getWeather=city=>{location=city;};try{processQuery('my weather');return location==='Chicago';}finally{getWeather=original;setStateIdle();}");
    }
   }
  }
  fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify({profile,checks,errors},null,2));console.log('FIRST_RUN_RESULT',JSON.stringify({profile,passed:checks.length,total:checks.length,errors}));app.exit(errors.length?1:0);
 }catch(error){fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify({profile,checks,errors,error:error.message},null,2));console.error(error);app.exit(1);}
});
setTimeout(()=>app.exit(1),45000).unref();
