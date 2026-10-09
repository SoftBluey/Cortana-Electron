const {createMutationQueue}=require('./preferences');
const MAX_DURATION=30*86400000;
function createTimers({read,write,onFire,now=Date.now,setTimeout:later=setTimeout,clearTimeout:clear=clearTimeout}) {
  let timers=[], writable=true, counter=0;
  const handles=new Map(), mutate=createMutationQueue();
  const snapshots=values=>values.map(({id,label,endTime,durationMs})=>({id,label,endTime,durationMs}));
  function schedule(timer) {
    clear(handles.get(timer.id));
    const remaining=timer.endTime-now();
    handles.set(timer.id,later(()=>{
      if(timer.endTime>now()){schedule(timer);return;}
      mutate(async()=>{
        if(!timers.includes(timer))return;
        const next=timers.filter(item=>item!==timer);
        try {await write(snapshots(next));}
        catch { handles.set(timer.id,later(()=>schedule(timer),10000)); return; }
        timers=next;handles.delete(timer.id);onFire(timer);
      }).catch(()=>{});
    },Math.max(0,Math.min(remaining,2147483647))));
  }
  const view=timer=>({...timer,remaining:Math.max(0,timer.endTime-now()),active:true});
  return {
    async load() {
      try {
        const values=await read();
        if(!Array.isArray(values)||values.length>20||values.some(t=>!t||!Number.isSafeInteger(t.id)||t.id<=0||typeof t.label!=='string'||t.label.length>128||!Number.isFinite(t.endTime)||!Number.isSafeInteger(t.durationMs)||t.durationMs<=0||t.durationMs>MAX_DURATION)||new Set(values.map(t=>t.id)).size!==values.length)throw Error('Invalid timers');
        timers=snapshots(values); counter=Math.max(0,...timers.map(t=>t.id)); timers.forEach(schedule);
      } catch(error) { if(error.code!=='ENOENT')writable=false; }
    },
    list:()=>timers.map(view),
    start:payload=>mutate(async()=>{
      const {ms,label=''}=payload||{};
      if(!Number.isSafeInteger(ms)||ms<=0||ms>MAX_DURATION)return {success:false,error:'Timers can be set for between one millisecond and 30 days.'};
      if(typeof label!=='string'||label.length>128)return {success:false,error:'Timer names can be up to 128 characters.'};
      if(!writable)return {success:false,error:'Your saved timers could not be read safely. The original file has been kept.'};
      if(timers.length>=20)return {success:false,error:'You can run up to 20 timers at once.'};
      if(label.trim()&&timers.some(t=>t.label.toLowerCase()===label.trim().toLowerCase()))return {success:false,error:'A timer with that name is already running. Choose a different name.'};
      const timer={id:counter+1,label:label.trim(),durationMs:ms,endTime:now()+ms};
      try {await write(snapshots([...timers,timer]));}catch{return {success:false,error:'Could not save your timer. Try again.'};}
      ++counter;timers.push(timer);schedule(timer);return {success:true,...view(timer)};
    }),
    cancel:id=>mutate(async()=>{
      const timer=timers.find(t=>t.id===id);if(!timer)return {success:false,error:'Timer not found or already finished.'};
      const next=timers.filter(t=>t!==timer);
      try {await write(snapshots(next));}catch{return {success:false,error:'Could not cancel this timer. It is still running. Try again.'};}
      timers=next;clear(handles.get(id));handles.delete(id);return {success:true};
    }),
    resume:()=>timers.forEach(schedule),
    stop:()=>{for(const handle of handles.values())clear(handle);handles.clear();},
  };
}
module.exports={createTimers};
