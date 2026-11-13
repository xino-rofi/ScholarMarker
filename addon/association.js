/* Existing highlight companion. No annotation creation API is used. */
(function(scope){
 'use strict';
 const PREFIX='scholarmarker:poc:v1:',MARKERS=['smile','wow'];
 const owned=name=>name===PREFIX+'reaction:smile'||name===PREFIX+'reaction:wow'||name.startsWith(PREFIX+'id:');
 function plan(tags,key,marker){
  if(!/^[A-Z0-9]{8}$/.test(key)||marker!==null&&!MARKERS.includes(marker))throw Error('Unsupported key or Marker');
  const before=tags.map(t=>({...t}));
  if(before.some(t=>typeof t.tag!=='string'))throw Error('Invalid native tags');
  // Unknown SM versions/Marker IDs are preserved and block edits; never migrate implicitly.
  if(before.some(t=>t.tag.startsWith('scholarmarker:')&&!owned(t.tag)))throw Error('Unsupported SM metadata; association left unchanged');
  const next=before.filter(t=>!owned(t.tag));
  if(marker!==null)next.push({tag:PREFIX+'reaction:'+marker,type:0},{tag:PREFIX+'id:'+key,type:0});
  const normalize=t=>JSON.stringify(t.map(x=>[x.tag,x.type||0]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const same=normalize(before)===normalize(next);
  return {before,next,changed:!same,status:same?(marker===null?'Already removed':'Already associated'):marker===null?'Removed':before.some(t=>owned(t.tag))?'Updated':'Saved'};
 }
 class Controller{
  constructor(api){this.api=api;this.tail=Promise.resolve();this.closed=false;this.blocked=false;}
  update(parentID,ids,marker){
   const keys=Array.isArray(ids)?ids.slice():[];
   const run=async()=>{
    if(this.closed||this.blocked)throw Error('Association writes unavailable');
    if(keys.length!==1||typeof keys[0]!=='string')throw Error('Select exactly one existing highlight');
    let result,touched=null;
    try{
     result=await this.api.transaction(async()=>{
      if(this.closed)throw Error('Plugin is shutting down');
      const item=await this.api.resolve(parentID,keys[0]);
      const change=plan(item.getTags(),keys[0],marker);
      if(change.changed){touched=item;item.setTags(change.next);await item.save();}
      return {status:change.status,key:keys[0],marker};
     });
    }catch(error){
     // Resolve again after rollback, and reload persisted tags rather than replaying stale snapshots.
     try{if(touched)await this.api.recover(touched);}catch(recovery){this.blocked=true;throw Error('Association recovery failed; writes locked: '+recovery.message);}
     throw error;
    }
    return result;
   };
   const result=this.tail.then(run);this.tail=result.catch(()=>{});return result;
  }
  async close(){this.closed=true;await this.tail;}
 }
 const api={PREFIX,MARKERS,plan,Controller};if(typeof module!=='undefined')module.exports=api;else scope.SMAssociation=api;
})(this);
