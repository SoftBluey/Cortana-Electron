(function(root,factory) {
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.CortanaLists=factory();
})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const key=value=>String(value).normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  function validItems(items) {
    return Array.isArray(items)&&items.length<=200&&items.every(item=>item&&typeof item.id==='string'&&item.id.length<=64&&typeof item.text==='string'&&item.text.trim()&&item.text.length<=512&&typeof item.done==='boolean')&&new Set(items.map(item=>item.id)).size===items.length;
  }
  function validLists(lists) {
    return lists===undefined||(Array.isArray(lists)&&lists.length<=20&&lists.every(list=>list&&typeof list.id==='string'&&list.id.length<=64&&list.id!=='tasks'&&typeof list.name==='string'&&list.name.trim()&&list.name.length<=80&&!['tasks','task','to do','to-do','todo'].includes(key(list.name))&&validItems(list.items))&&new Set(lists.map(list=>list.id)).size===lists.length&&new Set(lists.map(list=>key(list.name))).size===lists.length);
  }
  function all(data) { return [{id:'tasks',name:'Tasks',items:data.todos},...(data.lists||[])]; }
  function find(data,name) { const wanted=key(name);return all(data).find(list=>key(list.name)===wanted||(list.id==='tasks'&&['to do','to-do','todo','task'].includes(wanted))); }
  function parse(query) {
    const text=query.trim().replace(/[.!?]+$/,'');let m;
    if((m=text.match(/^(?:create|make)(?: a| my)? (.+?) list$/i)))return {action:'create',name:m[1]};
    if((m=text.match(/^add (.+?) to (?:my |the )?(.+?) list$/i)))return {action:'add',name:m[2],text:m[1]};
    if((m=text.match(/^(?:show|read|open)(?: me)? (?:my |the )?(.+?) list$/i)))return {action:'read',name:m[1]};
    if((m=text.match(/^(?:mark|check off) (.+?)(?: as (?:done|complete))? (?:on|in|from) (?:my |the )?(.+?) list$/i)))return {action:'done',name:m[2],text:m[1]};
    if((m=text.match(/^remove (.+?) from (?:my |the )?(.+?) list$/i)))return {action:'remove',name:m[2],text:m[1]};
    return null;
  }
  function apply(data,command,id) {
    const name=command.name.trim().replace(/\s+/g,' ');
    if(!name||name.length>80)return {success:false,message:'List names can be up to 80 characters.'};
    let list=find(data,name);
    if(command.action==='create') {
      if(list)return {success:false,listId:list.id,message:`You already have a ${list.name} list.`};
      if((data.lists||[]).length>=20)return {success:false,message:'You can keep up to 20 named lists, plus Tasks.'};
      list={id:id(),name,items:[]};data.lists||=[];data.lists.push(list);
      return {success:true,changed:true,listId:list.id,message:`Created your ${name} list.`};
    }
    if(!list)return {success:false,message:`I couldn't find your ${name} list. Say “create a ${name} list” first.`};
    if(command.action==='read') {
      const pending=list.items.filter(item=>!item.done);
      return {success:true,listId:list.id,message:pending.length?`${list.name}: ${pending.map(item=>item.text).join('; ')}.`:`Your ${list.name} list is all clear.`};
    }
    const text=String(command.text||'').trim();if(!text||text.length>512)return {success:false,message:'List items can be up to 512 characters.'};
    if(command.action==='add') {
      if(list.items.length>=200)return {success:false,message:'This list has 200 items. Remove an item before adding another.'};
      list.items.push({id:id(),text,done:false});
      return {success:true,changed:true,listId:list.id,message:`Added ${text} to your ${list.name} list.`};
    }
    const matches=list.items.filter(item=>key(item.text)===key(text));
    if(matches.length!==1)return {success:false,listId:list.id,message:matches.length?'There is more than one matching item. Choose the item in your list.':`I couldn't find ${text} on your ${list.name} list.`};
    if(command.action==='done')matches[0].done=true;
    else if(command.action==='remove')list.items.splice(list.items.indexOf(matches[0]),1);
    else return {success:false,message:'Unknown list request.'};
    return {success:true,changed:true,listId:list.id,message:`${command.action==='done'?'Checked off':'Removed'} ${text} ${command.action==='done'?'on':'from'} your ${list.name} list.`};
  }
  return {all,find,parse,apply,validLists,validItems};
});
