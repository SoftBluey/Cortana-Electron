const {createMutationQueue}=require('./preferences');
function createMedia({getManager,volume,dispose=()=>{}}) {
  const mutate=createMutationQueue();
  const actions={play:'tryPlayAsync',pause:'tryPauseAsync',stop:'tryStopAsync',next:'trySkipNextAsync',prev:'trySkipPreviousAsync'};
  async function playback(action) {
    const manager=await getManager();
    let session,info;
    try {
      session=manager.getCurrentSession();
      if(!session)return {success:false,error:'No controllable media is open. Start a song or video in a supported player first.'};
      info=session.getPlaybackInfo();const status=info.playbackStatus;
      if((action==='play'&&status===4)||(action==='pause'&&[2,5].includes(status))||(action==='stop'&&status===2))return {success:true,already:true};
      if(action==='playpause')action=status===4?'pause':'play';
      const success=await session[actions[action]](AbortSignal.timeout(5000));
      return success?{success:true}:{success:false,error:'This player did not accept that media command.'};
    } finally { dispose(info);dispose(session);dispose(manager); }
  }
  return {
    control:payload=>mutate(async()=>{
      const action=typeof payload==='string'?payload:payload?.action;
      try {
        if(['mute','unmute','setvolume','volup','voldown'].includes(action)) {
          const level=payload?.level;
          if(action==='setvolume'&&(!Number.isFinite(level)||level<0||level>100))return {success:false,error:'Choose a volume between 0 and 100 percent.'};
          return await volume(action,level);
        }
        if(action==='playpause'||Object.hasOwn(actions,action))return await playback(action);
        return {success:false,error:'Unknown media request.'};
      }catch{return {success:false,error:'Windows media controls are unavailable. Open a supported player and try again.'};}
    }),
    async state() {
      const audio=await volume('state');
      let manager,session,info;
      try {
        manager=await getManager();session=manager.getCurrentSession();info=session?.getPlaybackInfo();
        return {...audio,player:session?.sourceAppUserModelId||null,playbackStatus:info?.playbackStatus??null};
      }catch{return {...audio,player:null,playbackStatus:null};}
      finally { dispose(info);dispose(session);dispose(manager); }
    },
  };
}
module.exports={createMedia};
