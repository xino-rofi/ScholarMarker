/* Accepted commands use the original Link journal and Retained/A2 Host. */
(function(scope){'use strict';const U=typeof module!=='undefined'?require('./pinglink-explicit-unlink.js'):scope.SMPingExplicitUnlink;const G=typeof module!=='undefined'?require('./pinglink-geometry.js'):scope.SMPingLinkGeometry;const clone=x=>JSON.parse(JSON.stringify(x)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function validateBatchSource(selected,live){
  if(!live)throw Error('BATCH_SOURCE_MISSING');
  if(live.epoch!==selected.epoch)throw Error('BATCH_EPOCH_CHANGED');
  if(live.record.revision!==selected.record.revision)throw Error('BATCH_SOURCE_REVISION_CHANGED');
  const fields=Object.keys(selected.record);
  if(fields.length!==Object.keys(live.record).length||fields.some(key=>!Object.hasOwn(live.record,key)||!equal(selected.record[key],live.record[key])))throw Error('BATCH_SOURCE_RECORD_CHANGED');
 }
 function create({io,host,Store,writeScope,requireExplicitUnlink=false}){const tickets=new WeakMap(),pending=new Set(),history=[];let closing=false,closed=false,lastAuthorized=null,tail=Promise.resolve();
  const now=()=>globalThis.performance?.now?.()??Date.now();
  const note=(stage,detail={})=>{history.push({stage,atMs:Math.round(now()),...detail});if(history.length>48)history.shift();};
  const authorize=({kind,source,target,proof})=>{const t=proof&&tickets.get(proof),valid=!closed&&writeScope(kind)===true&&!!t&&kind===t.kind&&equal(source,t.source)&&(!target||equal(target,t.target));if(valid)lastAuthorized=t;return valid;};
  const storeIO={...io,async writeAtomic(name,text){if(name==='intent-v1.json'){const j=JSON.parse(text).value;if(!lastAuthorized||!equal(j.sourceBefore,lastAuthorized.source)||j.kind!==lastAuthorized.kind)throw Error('CARD_JOURNAL_SOURCE');lastAuthorized.journalOperationID=j.operationID;note('JOURNAL_INTENT_ATTEMPT',{operationID:lastAuthorized.operationID,journalOperationID:j.operationID,kind:j.kind});}return io.writeAtomic(name,text);}};const store=new Store({io:storeIO,host,authorize});
  async function execute(t){const timings={};let phaseStart=now();try{if(t.kind==='UNLINK'&&requireExplicitUnlink&&!t.relation)throw Error('UNLINK_EXPLICIT_IDENTITY_REQUIRED');if(writeScope(t.kind)!==true)throw Error('CARD_LINK_WRITING_DISABLED');const timedCommand=t.kind==='MOVE'||t.kind==='DELETE'||t.kind==='LINK';if(timedCommand&&io.prepare){const started=now();await io.prepare(t.kind);note('PREFLIGHT_COMPLETE',{operationID:t.operationID,kind:t.kind,durationMs:Math.round(now()-started)});}timings.preflightMs=Math.round(now()-phaseStart);phaseStart=now();const live=await host.readPing(t.source);
   if(t.batchGuard){
     validateBatchSource(t.source,live);
     t.source=live;
   }else if(!equal(live,t.source))throw Error('LINK_SOURCE_CHANGED');
   if(timedCommand)note('SOURCE_CHECKED',{operationID:t.operationID,kind:t.kind});
   if(t.kind==='LINK'&&!equal(await host.readAnnotation(t.target),t.target))throw Error('LINK_TARGET_CHANGED');if(t.kind==='LINK'&&(t.source.record.libraryID!==t.target.libraryID||t.source.record.attachmentKey!==t.target.attachmentKey))throw Error('LINK_ATTACHMENT_SCOPE');if(t.kind==='LINK'&&t.source.record.pageIndex!==t.target.position.pageIndex)throw Error('LINK_SAME_PAGE_REQUIRED');if(t.kind==='UNLINK'&&t.relation){if(!equal(t.target,t.relation.target))throw Error('UNLINK_SELECTED_TARGET_MISMATCH');if(t.expectedVersion!==t.relation.link.linkVersion)throw Error('LINK_VERSION_CONFLICT');if(io.prepare)await io.prepare(t.kind);const saved=await U.unlink(store,t.source,t.relation,t.proof);t.writeInvoked=true;if((await store.inspect(t.source)).status!=='UNLINKED'||!equal(await host.readPing(t.source),t.source))throw Object.assign(Error('LINK_UNLINK_READBACK_UNCONFIRMED'),{outcome:'UNKNOWN'});note('COMMIT_CONFIRMED',{operationID:t.operationID,journalOperationID:t.journalOperationID,kind:t.kind});return {...saved,operationID:t.operationID};}if(!timedCommand&&io.prepare)await io.prepare(t.kind);const current=timedCommand&&store.inspectKnownSource?await store.inspectKnownSource(t.source,live):await store.inspect(t.source);if(current.status==='PENDING_RECOVERY')throw Object.assign(Error('LINK_PENDING_RECOVERY'),{outcome:'UNKNOWN'});if(t.batchGuard){
     t.batchGuard();
     if(!['AVAILABLE','UNLINKED'].includes(current.status))throw Error('BATCH_STORE_UNVERIFIABLE');
   }
   timings.sourceMs=Math.round(now()-phaseStart);
   if(timedCommand)note('RELATION_CHECKED',{operationID:t.operationID,kind:t.kind});
   const old=current.link,version=old?.linkVersion||0;
   if(t.kind==='LINK'&&current.status==='AVAILABLE'&&equal(old.source,t.source)&&old.target.annotationKey===t.target.annotationKey&&old.target.itemID===t.target.itemID){
    const confirmed=await store.inspect(t.source);
    if(confirmed.status!=='AVAILABLE'||!equal(confirmed.link,old))throw Error('LINK_SOURCE_OR_RELATION_CHANGED');
    note('IDEMPOTENT_CONFIRMED',{operationID:t.operationID,kind:t.kind});
    return {outcome:'CONFIRMED',operationID:t.operationID,idempotent:true};
   }
   if(t.kind==='LINK'&&old&&t.expectedVersion===null)throw Error('LINK_REPLACEMENT_REQUIRES_EXPLICIT_CAS');if(t.expectedVersion!==null&&t.expectedVersion!==version)throw Error('LINK_VERSION_CONFLICT');if(t.kind==='LINK'&&old&&!equal(old.source,t.source))throw Error('LINK_SOURCE_OR_RELATION_CHANGED');
   if(t.kind==='UNLINK'&&!old)return {outcome:'CONFIRMED',idempotent:true,operationID:t.operationID};if(t.kind==='UNLINK'&&current.status==='AVAILABLE'){const planned=G.unlinkProjection(old,t.source,await host.readAnnotation(old.target));if(planned.status!=='AVAILABLE'||!equal(planned.pointPDF,t.source.record.pointPDF))throw Error('LINK_UNLINK_ABSOLUTE_POSITION_UNSUPPORTED');}
   if(t.kind==='MOVE'&&!old){if(!t.fallback)throw Error('LINK_RELATION_MISSING');const started=now();await t.fallback();timings.writeMs=Math.round(now()-started);note('ORDINARY_MOVE_CONFIRMED',{operationID:t.operationID,kind:t.kind,timings});return {outcome:'CONFIRMED',ordinary:true,operationID:t.operationID,timings};}if(!['LINK','UNLINK','MOVE','DELETE'].includes(t.kind))throw Error('CARD_OPERATION_DISABLED');
   const writeStarted=now();t.writeInvoked=true;let saved;if(t.kind==='LINK')saved=await store.link(t.source,t.target,version,t.proof);else if(t.kind==='UNLINK')saved=await store.unlink(t.source,version,t.proof,true);else if(t.kind==='MOVE')saved=await store.move(t.source,version,t.point,t.proof);else saved=await store.removePing(t.source,version,t.proof);
   timings.writeMs=Math.round(now()-writeStarted);phaseStart=now();
   if(timedCommand)note('STORE_COMPLETE',{operationID:t.operationID,kind:t.kind,durationMs:Math.round(now()-writeStarted)});
   if(!['CONFIRMED','IDEMPOTENT'].includes(saved.outcome))throw Object.assign(Error('LINK_UNCONFIRMED'),{outcome:'UNKNOWN'});const source=saved.source||t.source;
   if(timedCommand&&saved.commitVerified===true){
    Object.assign(timings,saved.commitTimings);
    timings.verifyMs=saved.verifyMs;
    timings.writeMs=Math.max(0,timings.writeMs-timings.verifyMs);
    if(saved.commitTimings)timings.transactionSetupMs=Math.max(0,timings.writeMs-timings.journalMs-timings.pingMs-timings.registryMs);
   }else{
   const found=await store.inspect(source);if(t.kind==='DELETE'){const deleted=typeof store.deletionState==='function'
     ?await store.deletionState(t.source)
     :{pingExists:await host.readPing(t.source)!==null,referencesReleased:await host.referencesReleased(t.source)};
    if(found.status!=='UNLINKED'||deleted.pingExists||deleted.referencesReleased!==true)throw Object.assign(Error('LINK_DELETE_READBACK_UNCONFIRMED'),{outcome:'UNKNOWN'});}else if(t.kind==='UNLINK'){if(found.status!=='UNLINKED'||!equal(await host.readPing(source),source))throw Object.assign(Error('LINK_UNLINK_READBACK_UNCONFIRMED'),{outcome:'UNKNOWN'});}else if(found.status!=='AVAILABLE'||!equal(found.link.source,source)||t.kind==='LINK'&&(found.link.target.annotationKey!==t.target.annotationKey||found.link.target.itemID!==t.target.itemID))throw Object.assign(Error('LINK_READBACK_UNCONFIRMED'),{outcome:'UNKNOWN'});
   timings.verifyMs=Math.round(now()-phaseStart);
   }
   note('COMMIT_CONFIRMED',{operationID:t.operationID,journalOperationID:t.journalOperationID,kind:t.kind,timings});return {outcome:'CONFIRMED',operationID:t.operationID,source,idempotent:false,timings};
  }catch(error){error.operationID=t.operationID;error.timings=timings;if(t.writeInvoked&&!error.outcome)error.outcome='UNKNOWN';note('COMMIT_UNCONFIRMED',{operationID:t.operationID,journalOperationID:t.journalOperationID||null,kind:t.kind,reason:String(error.message).slice(0,160),outcome:error.outcome||'REJECTED'});throw error;}finally{tickets.delete(t.proof);}}
  return {store,submit({source,target=null,kind='LINK',expectedVersion=null,point=null,fallback=null,relation=null,batchGuard=null}){if(closing||closed||pending.size>=16)return Promise.reject(Error('CARD_COMMAND_QUEUE_UNAVAILABLE'));const t={source:clone(source),target:target&&clone(target),kind,expectedVersion,relation:relation&&clone(relation),point:point&&clone(point),fallback,batchGuard,operationID:io.id(),proof:{}};tickets.set(t.proof,t);note('COMMAND_ACCEPTED',{operationID:t.operationID,kind});const task=tail.then(()=>execute(t));tail=task.catch(()=>{});pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;},inspectMany:sources=>store.inspectMany(sources),inspectRelation:source=>U.preview(store,source),async drain(){await Promise.allSettled([...pending]);},async close(){closing=true;await Promise.allSettled([...pending]);closed=true;await store.close();},diagnostics:()=>({closing,closed,pending:pending.size,writeEnabled:!closed&&writeScope()===true,history:history.slice(),store:store.diagnostics()})};
 }
 const api={create};if(typeof module!=='undefined')module.exports=api;else scope.SMPingCardCommands=api;
})(this);
