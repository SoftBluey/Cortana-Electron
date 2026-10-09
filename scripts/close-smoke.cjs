// Verify the real close lifecycle without modifying the installed app's profile.
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.verification');fs.mkdirSync(output,{recursive:true});
const movable=process.argv.includes('--movable'),dismiss=process.argv.includes('--dismiss'),cancel=process.argv.includes('--cancel');
const label=process.argv.find(arg=>arg.startsWith('--label='))?.slice(8)||'close';
app.setPath('userData',fs.mkdtempSync(path.join(output,'close-')));app.setAppPath(root);app.setLoginItemSettings=()=>{};
const shortcut='CommandOrControl+Shift+Alt+F12';let reopen;
const originalRegister=globalShortcut.register.bind(globalShortcut);
globalShortcut.register=(key,callback)=>{if(key===shortcut)reopen=callback;return originalRegister(key,callback);};
fs.writeFileSync(path.join(app.getPath('userData'),'settings.json'),JSON.stringify({firstRunComplete:true,firstRunRelease:'8.1.0',openAtLogin:false,heyCortana:false,isMovable:movable,closeToTray:dismiss,assistantHotkey:shortcut,hotkeyStartsListening:false}));
require('../main.js');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let started,acknowledged=false,ackMs,quitObserved=false;
ipcMain.prependListener('hide-window',()=>{if(started!==undefined){acknowledged=true;ackMs=performance.now()-started;}});
function save(result){fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify(result,null,2));console.log('CLOSE_RESULT',JSON.stringify(result));}
app.whenReady().then(async()=>{
 try{
  let win;for(let i=0;i<100&&!win;i++){win=BrowserWindow.getAllWindows()[0];if(!win)await delay(50);}
  if(!win)throw Error('No window');await delay(5000);win.show();win.focus();
  const js=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()');
  await js("appContainer.classList.add('visible');window.closeProbe={events:[]};appContainer.addEventListener('transitionend',event=>{if(event.target===appContainer)closeProbe.events.push({property:event.propertyName,elapsed:event.elapsedTime});});");
  await delay(350);
  app.on('before-quit',()=>{
   if(quitObserved||started===undefined)return;quitObserved=true;
   const passed=!dismiss&&!cancel&&acknowledged&&(movable||ackMs>=130);
   save({passed,dismiss,movable,viaNativeClose:process.argv.includes('--native'),acknowledged,ackMs,quitObserved});
   if(!passed)app.exit(1);
  });
  started=performance.now();
  if(process.argv.includes('--native'))win.close();else await js("document.getElementById('close-btn').click();");
  if(cancel){
   await delay(40);if(!reopen)throw Error('Reopen shortcut unavailable');reopen();
   await delay(450);const visible=await js("return appContainer.classList.contains('visible');");
   const passed=win.isVisible()&&visible&&!acknowledged&&!quitObserved;
   save({passed,cancelled:true,visible:win.isVisible(),containerVisible:visible,acknowledged,quitObserved});app.exit(passed?0:1);
  }else if(dismiss){
   await delay(600);const events=await js('return closeProbe.events;');
   const passed=!win.isVisible()&&acknowledged&&!quitObserved&&(movable||events.some(e=>e.property==='transform'&&e.elapsed>=.13));
   save({passed,dismiss:true,movable,ackMs,events,visible:win.isVisible(),quitObserved});app.exit(passed?0:1);
  }else{
   await delay(2000);throw Error('Quit did not finish');
  }
 }catch(error){save({passed:false,error:error.message,acknowledged,ackMs});app.exit(1);}
});
setTimeout(()=>app.exit(1),15000).unref();
