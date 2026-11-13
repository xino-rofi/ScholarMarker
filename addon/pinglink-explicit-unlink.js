/* Explicit relationship removal. Existing Link/journal v1; no Ping mutations. */
(function(scope){'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),G=typeof module!=='undefined'?require('./pinglink-geometry.js'):scope.SMPingLinkGeometry;
 const identity=(a,b)=>a&&b&&a.epoch===b.epoch&&['libraryID','attachmentKey','pingID','createdAt'].every(k=>a.record[k]===b.record[k]);
 function rejection(message){return Object.assign(Error(message),{outcome:'REJECTED'});}
 async function preview(store,s){return store.run(async()=>{await store.fresh(s);const state=await store.ready(),link=state.value.links.find(l=>l.source.record.libraryID===s.record.libraryID&&l.source.record.attachmentKey===s.record.attachmentKey&&l.source.record.pingID===s.record.pingID);if(!link)return {status:'UNLINKED'};const target=await store.host.readAnnotation(link.target),display=G.project(link,s,target);if(!identity(link.source,s)||!target||!G.sameTarget(link.target,target))return {...display,link:copy(link)};return {...display,link:copy(link),relation:{link:copy(link),source:copy(s),target:copy(target),storeRevision:state.value.revision,storeDigest:store.io.digest(state.raw),expiresAt:Date.now()+60000}};});}
 async function unlink(store,s,relation,proof){return store.run(async()=>{let before,next;try{
  store.permit('UNLINK',s,null,proof);await store.fresh(s);before=await store.ready();
  if(!relation||!Number.isSafeInteger(relation.expiresAt)||Date.now()>=relation.expiresAt||relation.expiresAt>Date.now()+60000)throw rejection('UNLINK_TICKET_EXPIRED');
  if(!same(relation.source,s)||!identity(relation.link?.source,s))throw rejection('UNLINK_SOURCE_IDENTITY');
  if(before.value.revision!==relation.storeRevision||store.io.digest(before.raw)!==relation.storeDigest)throw rejection('UNLINK_STORE_CAS');
  const found=before.value.links.find(l=>l.linkID===relation.link.linkID);
  if(!found||!same(found,relation.link))throw rejection('UNLINK_RELATION_CAS');
  const target=await store.host.readAnnotation(found.target);
  if(!target||!G.sameTarget(found.target,target)||!same(target,relation.target))throw rejection('UNLINK_TARGET_IDENTITY');
  next=copy(before.value);next.links=next.links.filter(l=>l.linkID!==found.linkID);if(next.links.length!==before.value.links.length-1)throw rejection('UNLINK_RELATION_AMBIGUOUS');next.revision++;
  await store.fresh(s);
 }catch(e){if(!e.outcome)e.outcome='REJECTED';throw e;}
 // sourceBefore == sourceAfter: transaction cannot call host.move or host.remove.
 const saved=await store.transaction('UNLINK',before,next,s,s,proof);
 return {...saved,source:copy(s)};
 },true);}
 const api={preview,unlink};if(typeof module!=='undefined')module.exports=api;else scope.SMPingExplicitUnlink=api;
})(this);
