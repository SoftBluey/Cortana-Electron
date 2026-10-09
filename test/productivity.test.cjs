const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validNotebook}=require('../lib/preferences');
const lists=require('../lib/lists');
const {nextOccurrence}=require('../lib/recurrence');
const {createTimers}=require('../lib/timers');
const {createMedia}=require('../lib/media');
test('named lists preserve old Tasks and use exact item matching with duplicate ambiguity',()=>{
  const data={notes:'keep',todos:[{id:'old',text:'Existing',done:false}],introduced:true};let counter=0;
  const apply=query=>lists.apply(data,lists.parse(query),()=>String(++counter));
  assert.equal(apply('create a Shopping list').success,true);
  assert.equal(apply('add Milk to my shopping list').success,true);
  assert.equal(apply('add Milk to my shopping list').success,true);
  assert.equal(apply('remove milk from my shopping list').success,false);
  assert.equal(data.lists[0].items.length,2);
  assert.equal(apply('add Fresh bread to my shopping list').success,true);
  assert.equal(apply('mark Fresh bread as done on my shopping list').success,true);
  assert.equal(data.lists[0].items[2].done,true);
  assert.equal(data.todos[0].id,'old');assert.equal(validNotebook(data),true);
  assert.equal(apply('create a shopping list').success,false);
  assert.equal(apply('add mail to my task list').success,true);
  assert.equal(data.todos.length,2);
  assert.equal(lists.parse('explain linked list'),null);
  assert.equal(lists.parse('open Photoshop Help'),null);
});
test('Notebook rejects malformed or colliding named lists without losing legacy compatibility',()=>{
  const original={notes:'',todos:[],introduced:false};assert.equal(validNotebook(original),true);
  for(const lists of [[{id:'a',name:'Tasks',items:[]}],[{id:'a',name:'Shop',items:[]},{id:'b',name:' shop ',items:[]}],[{id:'a',name:'Shop',items:[{id:'x',text:'',done:false}]}]])assert.equal(validNotebook({...original,lists}),false);
});
test('recurrence skips missed events without skipping today and preserves weekly day and local clock',()=>{
  const now=new Date(2026,9,9,12).getTime();
  const daily=new Date(nextOccurrence(new Date(2025,0,1,15).toISOString(),'daily',now));
  assert.equal(daily.getDate(),9);assert.equal(daily.getHours(),15);
  const week=new Date(nextOccurrence(new Date(2025,0,3,15).toISOString(),'weekly',now));
  assert.equal(week.getDay(),5);assert.equal(week.getDate(),9);
  const weekdays=new Date(nextOccurrence(new Date(2026,9,9,15).toISOString(),'weekdays',new Date(2026,9,9,16).getTime()));
  assert.equal(weekdays.getDay(),1);assert.equal(weekdays.getDate(),12);assert.equal(weekdays.getHours(),15);
  const dst=new Date(nextOccurrence(new Date(2026,9,31,9).toISOString(),'daily',new Date(2026,9,31,10).getTime()));
  assert.equal(dst.getHours(),9);assert.equal(dst.getDate(),1);
  assert.equal(nextOccurrence(new Date().toISOString(),null),null);
});
test('a skipped daylight-saving clock does not permanently move a daily reminder',()=>{
  const clock={hour:2,minute:30};
  const first=nextOccurrence(new Date(2026,2,7,2,30).toISOString(),'daily',new Date(2026,2,7,3).getTime(),clock);
  const next=new Date(nextOccurrence(first,'daily',new Date(2026,2,8,4).getTime(),clock));
  assert.equal(next.getDate(),9);assert.equal(next.getHours(),2);assert.equal(next.getMinutes(),30);
});
function timerHarness(saved=[]) {
  let clock=1000,fail=false,stored=structuredClone(saved),counter=0;
  const callbacks=new Map(),fires=[];
  const controller=createTimers({read:async()=>stored,write:async values=>{if(fail)throw Error('disk');stored=structuredClone(values);},onFire:timer=>fires.push(timer),now:()=>clock,
    setTimeout:(callback,delay)=>{const id=++counter;callbacks.set(id,{callback,delay});return id;},clearTimeout:id=>callbacks.delete(id)});
  return {controller,callbacks,fires,get stored(){return stored;},set fail(v){fail=v;},set clock(v){clock=v;}};
}
test('multiple named timers persist before success and failed cancellation keeps both running',async()=>{
  const h=timerHarness();await h.controller.load();
  const a=await h.controller.start({ms:5000,label:'Tea'}),b=await h.controller.start({ms:10000,label:'Oven'});
  assert.equal(a.success,true);assert.equal(b.success,true);assert.equal(h.stored.length,2);
  assert.equal((await h.controller.start({ms:20,label:'tea'})).success,false);
  assert.equal((await h.controller.start({ms:30*86400000+1})).success,false);
  h.fail=true;assert.equal((await h.controller.cancel(a.id)).success,false);assert.equal(h.controller.list().length,2);
  assert.equal((await h.controller.start({ms:50,label:'Fail'})).success,false);
  h.fail=false;assert.equal((await h.controller.cancel(a.id)).success,true);assert.equal(h.stored[0].id,b.id);
});
test('restored overdue timer fires once only after its removal is stored and long timers use bounded waits',async()=>{
  const h=timerHarness([{id:5,label:'Old',endTime:900,durationMs:100}]);await h.controller.load();
  const callback=[...h.callbacks.values()][0].callback;callback();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.fires.length,1);assert.equal(h.stored.length,0);callback();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.fires.length,1);
  await h.controller.start({ms:30*86400000});assert.ok([...h.callbacks.values()].every(t=>t.delay<=2147483647));
});
test('unreadable timer data is preserved and cannot be replaced by a new timer',async()=>{
  const controller=createTimers({read:async()=>({bad:true}),write:()=>assert.fail('overwrite'),onFire:()=>{}});
  await controller.load();assert.equal((await controller.start({ms:50})).success,false);
});
test('explicit media states remain idempotent and rejected native actions are reported',async()=>{
  let status=4,plays=0,pauses=0,volume=80,muted=false;
  const session={getPlaybackInfo:()=>({playbackStatus:status}),tryPlayAsync:async()=>{plays++;status=4;return true;},tryPauseAsync:async()=>{pauses++;status=5;return true;},trySkipNextAsync:async()=>false};
  const media=createMedia({getManager:async()=>({getCurrentSession:()=>session}),volume:async(action,level)=>{if(action==='mute')muted=true;if(action==='unmute')muted=false;if(action==='setvolume')volume=level;return {success:true,volume,muted};}});
  await media.control('play');assert.equal(plays,0);
  await media.control('pause');await media.control('pause');assert.equal(pauses,1);
  await media.control('play');await media.control('play');assert.equal(plays,1);
  await media.control('unmute');await media.control('unmute');assert.equal(muted,false);
  await media.control({action:'setvolume',level:30});assert.equal(volume,30);
  assert.equal((await media.control({action:'setvolume',level:130})).success,false);assert.equal(volume,30);
  assert.equal((await media.control('next')).success,false);
  const empty=createMedia({getManager:async()=>({getCurrentSession:()=>null}),volume:async()=>({success:true})});assert.equal((await empty.control('play')).success,false);
});
