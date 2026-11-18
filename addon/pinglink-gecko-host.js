/* Production bridge reuses original Retained/A2 APIs. No native annotation writer. */
(function(scope){'use strict';
 function create({retained,customStore,Zotero,guard}){let stopped=false;
  const check=()=>{if(stopped)throw Error('LINK_HOST_CLOSED');guard();};
  async function readPings(sources){
   check();
   await retained.reload();
   return sources.map(({record})=>{
    const ping=retained.get(record.pingID,record);
    return ping?{epoch:retained.data.epoch,record:ping}:null;
   });
  }
  const host={readPings,async readPing(s){return (await readPings([s]))[0];},async readAnnotation(t){check();const a=Zotero.Items.getByLibraryAndKey(t.libraryID,t.annotationKey);if(!a||a.id!==t.itemID||a.deleted||a.hasChanged?.()||!a.isAnnotation?.()||a.annotationType!=='highlight'||!a.isEditable?.())return null;const parent=Zotero.Items.get(a.parentID);if(!parent||parent.deleted||!parent.isPDFAttachment?.()||parent.libraryID!==t.libraryID||parent.key!==t.attachmentKey)return null;let position;try{const text=a.annotationPosition;if(typeof text!=='string'||text.length>100000)return null;const raw=JSON.parse(text);if(Object.keys(raw).some(k=>!['pageIndex','rects'].includes(k)))return null;position={pageIndex:raw.pageIndex,rects:raw.rects};}catch{return null;}return {libraryID:a.libraryID,attachmentKey:parent.key,annotationKey:a.key,itemID:a.id,position,type:a.annotationType,saved:Number.isSafeInteger(a.id)&&a.id>0,editable:true,deleted:false};},async move(before,after){check();if(before.epoch!==after.epoch)throw Error('LINK_HOST_EPOCH');await retained.move(before.record.pingID,before.record,before.record.revision,{pageIndex:after.record.pageIndex,pointPDF:after.record.pointPDF,viewBox:after.record.viewBox},check);},async remove(before){check();return retained.remove(before.record.pingID,before.record,before.record.revision,check);},async readDeletionState(before){
   check();
   return customStore.run(async()=>{
    const state=await retained.state();
    if(state.payload?.epoch!==before.epoch||state.refs?.epoch!==before.epoch)throw Error('LINK_HOST_EPOCH');
    const matches=r=>r.pingID===before.record.pingID&&r.libraryID===before.record.libraryID&&r.attachmentKey===before.record.attachmentKey;
    return {pingExists:state.payload.records.some(matches),referencesReleased:!state.refs.refs.some(matches)};
   });
  },
  async referencesReleased(before){return (await host.readDeletionState(before)).referencesReleased;},close(){stopped=true;}};
  return host;
 }
 const api={create};if(typeof module!=='undefined')module.exports=api;else scope.SMPingLinkGeckoHost=api;
})(this);
