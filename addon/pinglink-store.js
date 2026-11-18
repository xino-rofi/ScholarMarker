/* Independent relationship protocol. Default-deny. No production IO or native writer. */
(function(scope){'use strict';
 const capacity=typeof module!=='undefined'?require('./ping-capacity.js'):scope.SMPingCapacity;const G=typeof module!=='undefined'?require('./pinglink-geometry.js'):scope.SMPingLinkGeometry;
 const clone=x=>JSON.parse(JSON.stringify(x)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,KEY=/^[A-Z0-9]{8}$/,HASH=/^[a-f0-9]{64}$/,MID=/^m-[a-f0-9]{32}$/;
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(','),integer=x=>Number.isSafeInteger(x)&&x>=0;
 function source(s){const r=s?.record;if(!exact(s,'epoch,record')||!UUID.test(s.epoch)||!exact(r,'pingID,libraryID,attachmentKey,pageIndex,pointPDF,viewBox,markerID,assetID,createdAt,revision')||!UUID.test(r.pingID)||!Number.isSafeInteger(r.libraryID)||r.libraryID<1||!KEY.test(r.attachmentKey)||!integer(r.pageIndex)||r.pageIndex>=100000||!MID.test(r.markerID)||!HASH.test(r.assetID)||!integer(r.createdAt)||!integer(r.revision)||!G.inside(r.pointPDF,r.viewBox))throw Error('LINK_SOURCE_INVALID');return s;}
 const key=s=>s.record.libraryID+'/'+s.record.attachmentKey+'/'+s.record.pingID;
 function state(v){if(!exact(v,'schemaVersion,revision,links')||v.schemaVersion!==1||!integer(v.revision)||!Array.isArray(v.links)||v.links.length>capacity.perProfile)throw Error('LINK_STATE_INVALID');const seen=new Set(),ids=new Set();for(const l of v.links){if(!exact(l,'linkID,linkVersion,source,target,offset,createdAt,updatedAt')||!UUID.test(l.linkID)||ids.has(l.linkID)||!Number.isSafeInteger(l.linkVersion)||l.linkVersion<1||!integer(l.createdAt)||!integer(l.updatedAt)||l.updatedAt<l.createdAt||!G.point(l.offset))throw Error('LINK_RECORD_INVALID');source(l.source);G.target(l.target);G.offset(l.source,l.target);const k=key(l.source);if(seen.has(k))throw Error('LINK_DUPLICATE_SOURCE');seen.add(k);ids.add(l.linkID);}return v;}
 function failure(error,outcome='UNKNOWN'){const e=Error(String(error?.message||'LINK_ERROR').slice(0,240));e.outcome=error?.outcome||outcome;return e;}
 class Store{
  constructor({io,host,authorize=()=>false,clock=()=>Date.now()}){if(!io||!host||typeof io.digest!=='function'||typeof io.withLock!=='function')throw Error('LINK_ADAPTER_REQUIRED');this.io=io;this.host=host;this.authorize=authorize;this.clock=clock;this.tail=Promise.resolve();this.closed=false;this.blocked=false;this.pending=0;this.history=[];}
  log(stage){this.history.push({stage});if(this.history.length>48)this.history.shift();}
  pack(value){const text=JSON.stringify(value);if(text.length>1000000)throw Error('LINK_LIMIT');return JSON.stringify({format:1,hash:this.io.digest(text),value});}
  unpack(raw){if(typeof raw!=='string'||raw.length>2000000)throw Error('LINK_FILE_INVALID');let e;try{e=JSON.parse(raw);}catch{throw Error('LINK_FILE_CORRUPT');}if(!exact(e,'format,hash,value')||e.format!==1||!HASH.test(e.hash)||this.io.digest(JSON.stringify(e.value))!==e.hash)throw Error('LINK_CHECKSUM');return e.value;}
  async raw(name){if(await this.io.exists(name+'.tmp'))throw Error('LINK_UNFINISHED_TEMP');return this.io.read(name);}
  async fromPrimary(raw,allowJournalMissing=false){
   if(raw===null&&!allowJournalMissing&&await this.io.exists('backup-v1.json'))throw Error('LINK_PRIMARY_MISSING');
   return {raw,value:raw===null?{schemaVersion:1,revision:0,links:[]}:state(this.unpack(raw))};
  }
  async current(allowJournalMissing=false){return this.fromPrimary(await this.raw('links-v1.json'),allowJournalMissing);}
  journal(raw){const j=this.unpack(raw);if(!exact(j,'schemaVersion,operationID,kind,before,after,sourceBefore,sourceAfter')||j.schemaVersion!==1||!UUID.test(j.operationID)||!['LINK','MOVE','UNLINK','DELETE'].includes(j.kind)||typeof j.after!=='string'||j.before!==null&&typeof j.before!=='string')throw Error('LINK_INTENT_INVALID');source(j.sourceBefore);if(j.sourceAfter!==null){source(j.sourceAfter);if(key(j.sourceBefore)!==key(j.sourceAfter)||j.sourceBefore.epoch!==j.sourceAfter.epoch)throw Error('LINK_INTENT_SOURCE');}const before=j.before===null?{schemaVersion:1,revision:0,links:[]}:state(this.unpack(j.before)),after=state(this.unpack(j.after));if(after.revision!==before.revision+1)throw Error('LINK_INTENT_REVISION');if((j.kind==='DELETE')!==(j.sourceAfter===null))throw Error('LINK_INTENT_KIND');if(j.kind==='LINK'&&!equal(j.sourceBefore,j.sourceAfter))throw Error('LINK_INTENT_SOURCE');return j;}
  run(fn,writing=false,recovery=false){if(this.closed||this.pending>=16)return Promise.reject(Error('LINK_QUEUE_UNAVAILABLE'));this.pending++;const task=this.tail.then(async()=>{if(this.closed||writing&&this.blocked&&!recovery)throw Error('LINK_CLOSED_OR_BLOCKED');return this.io.withLock(fn);});this.tail=task.catch(()=>{});return task.catch(e=>{if(writing&&e.outcome==='UNKNOWN')this.blocked=true;throw e;}).finally(()=>this.pending--);}
  permit(kind,s,t,proof){if(this.closed)throw Error('LINK_CLOSED');if(this.authorize({kind,source:s,target:t,proof})!==true)throw Error('LINK_WRITING_DISABLED');}
  async fresh(s){source(s);const found=await this.host.readPing(s);if(!equal(found,s))throw Error('LINK_SOURCE_CHANGED');return found;}
  async ready(locked=false){
   const files=locked&&this.io.readLockedFiles
    ?await this.io.readLockedFiles(['intent-v1.json','backup-v1.json','links-v1.json'])
    :null;
   const intent=files?files[0]:await this.raw('intent-v1.json');
   if(intent!==null)throw Error('LINK_RECOVERY_REQUIRED');
   const backup=files?files[1]:await this.raw('backup-v1.json');
   if(backup!==null){
    const b=this.unpack(backup);
    if(!exact(b,'present,text')||typeof b.present!=='boolean'||b.present!==(b.text!==null))throw Error('LINK_BACKUP_INVALID');
    if(b.present)state(this.unpack(b.text));
   }
   if(files&&files[2]===null&&backup!==null)throw Error('LINK_PRIMARY_MISSING');
   return files?this.fromPrimary(files[2]):this.current();
  }
  async write(name,text){try{await this.io.writeAtomic(name,text);const readback=this.io.verifyWrittenFile?await this.io.verifyWrittenFile(name):await this.raw(name);if(readback!==text)throw Error('LINK_READBACK_MISMATCH');}catch(e){try{if(await this.raw(name)===text){this.log('COMMIT_RECONCILED');return;}}catch{}throw failure(e);} }
  async clearIntent(){await this.io.removeIntent();const readback=this.io.verifyWrittenFile?await this.io.verifyWrittenFile('intent-v1.json'):await this.io.read('intent-v1.json');if(readback!==null)throw failure(Error('LINK_INTENT_REMOVE_UNCERTAIN'));}
  async deletionState(s){
   if(typeof this.host.readDeletionState==='function')return this.host.readDeletionState(s);
   const pingExists=await this.host.readPing(s)!==null;
   return {pingExists,referencesReleased:!pingExists&&await this.host.referencesReleased(s)===true};
  }
  async transaction(kind,before,next,s,after,proof){const j={schemaVersion:1,operationID:this.io.id(),kind,before:before.raw,after:this.pack(state(next)),sourceBefore:clone(s),sourceAfter:clone(after)};this.journal(this.pack(j));this.permit(kind,s,null,proof);await this.fresh(s);const clock=()=>globalThis.performance?.now?.()??Date.now(),journalStarted=clock();try{await this.write('intent-v1.json',this.pack(j));await this.write('backup-v1.json',this.pack({present:before.raw!==null,text:before.raw}));const pingStarted=clock();const removed=kind==='DELETE'?await this.host.remove(s):null;if(kind!=='DELETE'&&!equal(s,after))await this.host.move(s,after);if(kind==='DELETE'){
    const deleted=removed?.outcome==='DELETED'&&removed.verified===true?{pingExists:false,referencesReleased:true}:await this.deletionState(s);
    if(deleted.pingExists)throw Error('LINK_HOST_COMMIT_UNCERTAIN');
    if(deleted.referencesReleased!==true)throw failure(Error('LINK_REFERENCE_RELEASE_PENDING'),'PARTIAL');
   }else if(!equal(s,after)&&!equal(await this.host.readPing(s),after))throw Error('LINK_HOST_COMMIT_UNCERTAIN');this.permit(kind,s,null,proof);if(await this.raw('links-v1.json')!==before.raw)throw Error('LINK_EXTERNAL_CHANGE');const targetLink=next.links.find(l=>key(l.source)===key(s));if(['LINK','MOVE'].includes(kind)&&(!targetLink||!equal(await this.host.readAnnotation(targetLink.target),targetLink.target)))throw Error('LINK_TARGET_CHANGED');const registryStarted=clock();await this.write('links-v1.json',j.after);
   const verifyStarted=clock();
   if(kind==='DELETE'){
    const deleted=await this.deletionState(s);
    if(deleted.pingExists||deleted.referencesReleased!==true)throw Error('LINK_DELETE_READBACK_UNCONFIRMED');
   }else{
    const live=await this.host.readPing(s);
    if(!equal(live,after))throw Error('LINK_POSTCOMMIT_SOURCE_CHANGED');
    if(['LINK','MOVE'].includes(kind)){
     const target=await this.host.readAnnotation(targetLink.target);
     if(!equal(target,targetLink.target)||G.project(targetLink,live,target).status!=='AVAILABLE')throw Error('LINK_POSTCOMMIT_TARGET_CHANGED');
    }
   }
   await this.clearIntent();
   this.log(kind+'_CONFIRMED');
   return {outcome:'CONFIRMED',state:clone(next),commitVerified:true,verifyMs:Math.round(clock()-verifyStarted),commitTimings:{journalMs:Math.round(pingStarted-journalStarted),pingMs:Math.round(registryStarted-pingStarted),registryMs:Math.round(verifyStarted-registryStarted)}};}catch(error){this.blocked=true;this.log(kind+'_UNCONFIRMED');throw failure(error);} }
  link(s,t,expectedVersion=0,proof){s=clone(s);t=clone(t);return this.run(async()=>{this.permit('LINK',s,t,proof);source(s);G.target(t);G.offset(s,t);if(!equal(await this.host.readAnnotation(t),t))throw Error('LINK_TARGET_CHANGED');const before=await this.ready(true),next=clone(before.value),old=next.links.find(l=>key(l.source)===key(s));if((old?.linkVersion||0)!==expectedVersion)throw Error('LINK_VERSION_CONFLICT');if(old&&equal(old.source,s)&&G.sameTarget(old.target,t)){await this.fresh(s);return {outcome:'IDEMPOTENT',link:clone(old)};}const time=this.clock(),l={linkID:old?.linkID||this.io.id(),linkVersion:(old?.linkVersion||0)+1,source:s,target:t,offset:G.offset(s,t),createdAt:old?.createdAt??time,updatedAt:time};next.links=next.links.filter(l=>key(l.source)!==key(s));next.links.push(l);next.revision++;if(!equal(await this.host.readAnnotation(t),t))throw Error('LINK_TARGET_CHANGED');const result=await this.transaction('LINK',before,next,s,s,proof);return {...result,link:clone(l)};},true);}
  mutate(kind,s,expectedVersion,point,proof,absoluteOnly=false){s=clone(s);return this.run(async()=>{this.permit(kind,s,null,proof);source(s);if(kind==='UNLINK')await this.fresh(s);const before=await this.ready(true),next=clone(before.value),l=next.links.find(l=>key(l.source)===key(s));if((l?.linkVersion||0)!==expectedVersion)throw Error('LINK_VERSION_CONFLICT');let after=clone(s),outcome='AVAILABLE';if(kind==='DELETE')after=null;else{if(!l||!equal(l.source,s))throw Error('LINK_SOURCE_OR_RELATION_CHANGED');const target=await this.host.readAnnotation(l.target),display=kind==='UNLINK'?G.unlinkProjection(l,s,target):G.project(l,s,target);if(kind==='UNLINK'&&absoluteOnly&&(display.status!=='AVAILABLE'||!equal(display.pointPDF,s.record.pointPDF)))throw Error('LINK_UNLINK_ABSOLUTE_POSITION_UNSUPPORTED');let desired;if(kind==='MOVE'){if(display.status!=='AVAILABLE')throw Error('LINK_POSITION_UNAVAILABLE');desired=clone(point);G.offset(s,target,desired);}else{desired=display.status==='AVAILABLE'?display.pointPDF:s.record.pointPDF;outcome=display.status;}if(!equal(desired,s.record.pointPDF)){after.record.pointPDF=desired;after.record.revision++;}if(kind==='MOVE'){l.source=clone(after);l.target=target;l.offset=G.offset(after,target,desired);l.linkVersion++;l.updatedAt=this.clock();}}
   if(kind!=='MOVE')next.links=next.links.filter(l=>key(l.source)!==key(s));next.revision++;const result=await this.transaction(kind,before,next,s,after,proof);return {...result,source:after,positionStatus:outcome};},true);}
  move(s,v,point,proof){return this.mutate('MOVE',s,v,point,proof);}
  unlink(s,v,proof,absoluteOnly=false){return this.mutate('UNLINK',s,v,null,proof,absoluteOnly);}
  removePing(s,v=0,proof){return this.mutate('DELETE',s,v,null,proof);}
  inspect(s){return this.inspectMany([s]).then(([result])=>result);}
  inspectKnownSource(s,live){return this.inspectMany([s],[live]).then(([result])=>result);}
  inspectMany(sources,known=null){
   if(!sources.length)return Promise.resolve([]);
   return this.run(async()=>{
    for(const s of sources)source(s);
    const files=this.io.readLockedFiles?await this.io.readLockedFiles(['intent-v1.json','links-v1.json']):null;
    const intent=files?files[0]:await this.raw('intent-v1.json');
    if(intent!==null)return sources.map(()=>({status:'PENDING_RECOVERY'}));
    const {value}=files?await this.fromPrimary(files[1]):await this.current(),byKey=new Map(value.links.map(link=>[key(link.source),link]));
    const matches=sources.map(s=>byKey.get(key(s)));
    const live=known??(matches.some(Boolean)&&this.host.readPings?await this.host.readPings(sources):null);
    const results=[];
    for(const [index,s] of sources.entries()){
     const link=matches[index];
     if(!link){results.push({status:'UNLINKED'});continue;}
     const row=live?live[index]:await this.host.readPing(s);
     results.push({...G.project(link,row,await this.host.readAnnotation(link.target)),link:clone(link)});
    }
    return results;
   });
  }
  recover(proof){return this.run(async()=>{this.permit('RECOVER',null,null,proof);const raw=await this.raw('intent-v1.json');if(raw===null){await this.ready();return {outcome:'NO_RECOVERY'};}const backup=await this.raw('backup-v1.json');if(backup!==null){const b=this.unpack(backup);if(!exact(b,'present,text')||typeof b.present!=='boolean'||b.present!==(b.text!==null))throw Error('LINK_BACKUP_INVALID');if(b.present)state(this.unpack(b.text));}const j=this.journal(raw),current=await this.current(true);if(current.raw!==j.before&&current.raw!==j.after)throw Error('LINK_RECOVERY_VERSION_CONFLICT');const ping=await this.host.readPing(j.sourceBefore);if(equal(ping,j.sourceBefore)&&current.raw===j.before){if(j.before===null&&await this.io.exists('backup-v1.json'))await this.write('links-v1.json',this.pack({schemaVersion:1,revision:0,links:[]}));await this.clearIntent();this.blocked=false;return {outcome:'ABORTED_BEFORE_HOST_COMMIT'};}if(!equal(ping,j.sourceAfter))throw Error('LINK_RECOVERY_SOURCE_CONFLICT');if(j.kind==='DELETE'&&await this.host.referencesReleased(j.sourceBefore)!==true)throw failure(Error('LINK_REFERENCE_RELEASE_PENDING'),'PARTIAL');if(current.raw===j.before){await this.write('backup-v1.json',this.pack({present:j.before!==null,text:j.before}));await this.write('links-v1.json',j.after);}await this.clearIntent();this.blocked=false;this.log('RECOVERED');return {outcome:'RECOVERED'};},true,true);}
  diagnostics(){return {pending:this.pending,blocked:this.blocked,closed:this.closed,history:this.history.slice()};}
  async close(){this.closed=true;await this.tail;}
 }
 const api={Store,source,state,key};if(typeof module!=='undefined')module.exports=api;else scope.SMPingLinkStore=api;
})(this);
