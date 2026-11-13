/* Preference-only ordering and flat official-menu commands. No native annotation APIs. */
(function(scope){
 'use strict';
 const KEY='extensions.scholarmarker.quickMarkers.v1',valid=id=>typeof id==='string'&&/^m-[a-f0-9]{32}$/.test(id);
 class Pins{
  constructor(read,write){this.read=read;this.write=write;}
  load(){try{const raw=this.read(KEY);if(raw===undefined||raw==='')return [];if(typeof raw!=='string'||raw.length>512)return [];const ids=JSON.parse(raw);if(!Array.isArray(ids)||ids.length>4||ids.some(id=>!valid(id))||new Set(ids).size!==ids.length)return [];return ids;}catch{return [];}}
  list(definitions){const byID=new Map(definitions.map(m=>[m.id,m]));return this.load().filter(id=>byID.has(id)).map(id=>byID.get(id));}
  save(ids){this.write(KEY,JSON.stringify(ids));}
  pin(id,definitions){if(!valid(id)||!definitions.some(m=>m.id===id))throw Error('Unknown Marker');const ids=this.list(definitions).map(m=>m.id);if(ids.includes(id))return;if(ids.length===4)throw Error('Quick Marker limit: 4');this.save([...ids,id]);}
  unpin(id){this.save(this.load().filter(x=>x!==id));}
  move(id,delta,definitions){const ids=this.list(definitions).map(m=>m.id),i=ids.indexOf(id),j=i+delta;if(i<0||![-1,1].includes(delta)||j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];this.save(ids);}
 }
 function items(definitions,command,disabled=false){return definitions.slice(0,4).map(m=>({label:'ScholarMarker · 常用表情: '+m.name,disabled,persistent:true,onCommand:command(m.id)}));}
 class Actions{
  constructor(queue){this.queue=queue;this.pending=new Map();this.closed=false;}
  run(reader,fn){if(this.closed)return Promise.reject(Error('Reader closed'));if(this.pending.has(reader))return this.pending.get(reader);const p=this.queue(()=>{if(this.closed)throw Error('Reader closed');return fn();});this.pending.set(reader,p);const done=()=>{if(this.pending.get(reader)===p)this.pending.delete(reader);};p.then(done,done);return p;}
  close(){this.closed=true;this.pending.clear();}
 }
 const api={KEY,Pins,items,Actions};if(typeof module!=='undefined')module.exports=api;else scope.SMQuickMarkers=api;
})(this);
