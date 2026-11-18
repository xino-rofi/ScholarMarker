/* Native reader adapters are deliberately confined to this file. */
'use strict';
var createSMPlugin = function ({Zotero, Services, root, soundURL, positionIO,customIO=null,retainedIO=null,mediaIO=null,legacyIO=null,linkIO=null,userAuthorization=null,pingOnly=true,runtime=null,readerUI=null}) {
  const compatibleHost=()=>runtime?runtime.supportsHost():['10.0.7','10.0.8'].includes(Zotero.version);
  const ID = runtime ? runtime.identity.id : 'scholarmarker-v025@local.test';
  const core = SMCore;
  const interaction = SMInteraction;
  const visual = SMVisual;
  const badges = new Map();
  const fileReaders = new Map();
  let legacyActions=null;let customStore=null,markerTail=Promise.resolve();const customPanels=new Map(),developerPanels=new Map();
  const markerOperation=fn=>{const p=markerTail.then(fn);markerTail=p.catch(()=>{});return p;};
  const pingDefinitions=()=>customStore&&!customStore.closed&&!customStore.blocked?Object.entries(customStore.data.definitions).map(([id,d])=>({id,name:d.name,kind:d.kind,assetID:d.assetID})):[];
  const pingShortcuts=new SMPingShortcuts.Store(k=>Zotero.Prefs.get(k,true),(k,v)=>{if(k!==SMPingShortcuts.KEY||stopped||!isolated()||!compatibleHost())throw Error('SHORTCUT_ISOLATED_REQUIRED');Zotero.Prefs.set(k,v,true);});
  const pingMaterials=SMPingMaterials.create({store:()=>customStore,decodeWindow:()=>Zotero.getMainWindow?.()?.document?.defaultView,binary:SMImportBytes});
  const soundPrefs=SMPingSoundSettings.create({read:k=>Zotero.Prefs.get(k,true),write:(k,v)=>Zotero.Prefs.set(k,v,true),clear:k=>Zotero.Prefs.clear(k,true),flush:()=>Services.prefs.savePrefFile(null),allowed:()=>!stopped&&isolated()});
  function pingVolume(){return soundPrefs.volume();}
  function pingSoundEnabled(){const state=soundPrefs.snapshot();if(!state.valid){mediaPlayer?.stopAll();transientPlayer?.stopAll('INVALID_SOUND_SETTINGS');}return state.enabled;}
  let linkedLists=null;let cardThumbnails=null;let retainedStore=null,mediaStore=null,linkStore=null,linkHost=null,linkCommand=null,cardCommands=null,cardMode=null,retainedFacade=null;const linkRestores=[];let linkRestorePending=null;const mediaMessages=[];const mediaTrace=(stage,reason='')=>{mediaMessages.push({stage,reason:String(reason).slice(0,240)});if(mediaMessages.length>64)mediaMessages.shift();};const mediaPlayer=mediaIO?SMPingPlayer.create({media:()=>mediaStore,volume:()=>pingVolume()/100,muted:()=>!pingSoundEnabled(),trace:mediaTrace}):null;
  const retainedMode=retainedIO?new SMRetainedStore.Mode(k=>Zotero.Prefs.get(k,true),(k,v)=>{if(stopped||!isolated()||!compatibleHost()||k!==SMRetainedStore.MODE)throw Error('RETAINED_PREF_SCOPE');Zotero.Prefs.set(k,v,true);}):null;
  const pdfSizePreferences=SMPingPDFSize.createPreferences({read:()=>Zotero.Prefs.get(SMPingPDFSize.KEY,true),write:value=>Zotero.Prefs.set(SMPingPDFSize.KEY,value,true),clear:()=>Zotero.Prefs.clear(SMPingPDFSize.KEY,true),flush:()=>Services.prefs.savePrefFile(null),allowed:()=>!stopped});
  const animationPreferences=SMPingAnimationPreferences.create({lookup:id=>customStore&&!customStore.closed&&!customStore.blocked?customStore.data.definitions[id]:null,preferences:SMPingAnimationPreferences.createPreferences({read:()=>Zotero.Prefs.get(SMPingAnimationPreferences.KEY,true),write:value=>Zotero.Prefs.set(SMPingAnimationPreferences.KEY,value,true),clear:()=>Zotero.Prefs.clear(SMPingAnimationPreferences.KEY,true),flush:()=>Services.prefs.savePrefFile(null),allowed:()=>!stopped}),changed:()=>retainedView?.cancelAnimations()});
  const pdfSizes=SMPingPDFSize.create({preferences:pdfSizePreferences,lookup:id=>customStore&&!customStore.closed&&!customStore.blocked?customStore.data.definitions[id]:null,changed:()=>retainedView?.changed()});
  const retainedView=retainedMode?SMRetainedView.create({animationPreset:record=>animationPreferences.resolve(record),pdfDisplaySize:r=>pdfSizes.resolve(r),pingOnly,linkForDocument:doc=>({start(record){const reader=readerDocuments.get(doc),state=documents.get(doc);if(!reader||!state||!linkMode)return;if(pingOnly&&cardMode){startCardAssociation(doc,reader,state,record);return;}const parent=Zotero.Items.get(reader.itemID),parentID=parent?.id,libraryID=parent?.libraryID,attachmentKey=parent?.key,tabID=reader.tabID,host=reader._window;linkMode.start({doc,owner:state.ownerDoc||doc,reader,expectedItemID:parentID,expectedTabID:tabID,accept:SMPingLinkGate.runtime().writeEnabled?(hit,receipt,verify)=>{if(!linkCommand||!linkStore)throw Error('LINK_RUNTIME_UNAVAILABLE');return linkCommand.commit(linkStore,{doc,reader,record,validate:()=>{guard(Zotero.Items.get(parentID));if(stopped||documents.get(doc)!==state||readerDocuments.get(doc)!==reader||reader.itemID!==parentID||reader.tabID!==tabID||reader._window!==host||host.closed||host.Zotero_Tabs?.selectedID!==tabID||!host.document?.hasFocus?.())throw Error('LINK_SCOPE_INVALID');}},hit,receipt,verify);}:undefined,readAttachment:()=>{const p=Zotero.Items.get(reader.itemID);return p?{itemID:p.id,libraryID:p.libraryID,attachmentKey:p.key}:null;},record,validate:()=>{guard(Zotero.Items.get(parentID));if(stopped||documents.get(doc)!==state||readerDocuments.get(doc)!==reader||reader.itemID!==parentID||reader.tabID!==tabID||reader._window!==host||!host||host.closed||host.Zotero_Tabs?.selectedID!==tabID||!host.document?.hasFocus?.()||record.libraryID!==libraryID||record.attachmentKey!==attachmentKey)throw Error('LINK_SCOPE_INVALID');},readSource:r=>retainedStore?.get(r.pingID,r),readAnnotation:key=>{const a=Zotero.Items.getByLibraryAndKey(libraryID,key);return a?{annotationKey:a.key,positionJSON:a.annotationPosition,itemID:a.id,saved:Number.isSafeInteger(a.id)&&a.id>0,deleted:a.deleted===true,editable:a.isEditable?.()===true,unsaved:a.hasChanged?.()===true,type:a.isAnnotation?.()?a.annotationType:null,parentMatches:a.parentID===parentID&&a.libraryID===libraryID&&a.key===key}:null;}});}}),mode:retainedMode,store:()=>pagePingStore(),page:SMPingPage,geometry:SMPageGeometry,version:Zotero.version,replay:(node,r,guard)=>mediaPlayer?.play(node,r.markerID,guard),stopMedia:node=>mediaPlayer?.stop(node),loadMaterial:choice=>preparePingMaterial(choice,true),validMaterial:d=>pingMaterials.valid(d),options:(doc,spec)=>SMReaderOptions.observerOptions(doc.defaultView,spec),feedback:(message,doc)=>{if(doc&&documents.has(doc))status(doc,message);}}):null;
  function deletePagePing(target,pingID,id,revision,check,batch=false){
    check();
    if(!cardCommands||stopped)throw Error('PING_DELETE_COORDINATOR_UNAVAILABLE');
    if(!cardWriteScope('DELETE'))throw Error('PING_DELETE_AUTHORIZATION_REQUIRED');
    if(linkStore?.blocked||target.blocked||customStore?.blocked)throw Error('PING_DELETE_STORE_BLOCKED');
    if(batch){
      // The selected record is checked against a fresh disk read by the coordinator.
      const source={epoch:target.data.epoch,record:id};
      return cardCommands.submit({kind:'DELETE',source,batchGuard:check});
    }
    const record=target.get(pingID,id);
    if(!record||record.revision!==revision)throw Error('RETAINED_TARGET_CHANGED');
    const source={epoch:target.data.epoch,record};
    return cardCommands.submit({kind:'DELETE',source}).finally(()=>{cardThumbnails?.refresh();linkedLists?.refresh();});
  }
  let pageDeleteFacade=null;
  function pagePingStore(){
    if(!retainedStore)return null;
    if(!pageDeleteFacade)pageDeleteFacade=new Proxy(retainedStore,{get(target,name){
      if(name==='remove')return async(pingID,id,revision,check)=>deletePagePing(target,pingID,id,revision,check);
      if(runtime&&name==='move'&&!retainedFacade)return async()=>{throw Error('R2_MOVE_ADMISSION_UNAVAILABLE');};
      const active=retainedFacade||target,value=Reflect.get(active,name,active);
      return typeof value==='function'?value.bind(active):value;
    }});
    return pageDeleteFacade;
  }
  function preparePingMaterial(choice,defer){const d=pingMaterials.describe(choice.markerID);if(!d||d.assetID!==choice.assetID)return Promise.resolve(null);if(defer&&pingMaterials.diagnostics().loads>=2&&!customStore.image(choice.markerID))return Promise.resolve({deferred:true});return pingMaterials.prepare(d).then(async material=>{if(!material||!mediaStore||choice.pingID)return material;const playback=await mediaStore.prepare(choice.markerID);return {...material,playDuration:Math.max(playback?.gif?.duration||0,playback?.audio?Math.min(15000,(playback.audioDuration||3)*1000):0)};}).finally(()=>retainedView?.changed());}
  function resolvePDFShortcut(e,doc){
    try{
      if(stopped||!doc||doc.documentURI!=='resource://zotero/reader/pdf/web/viewer.html'||e?.target?.ownerDocument?.isSameNode?.(doc)!==true)return null;
      const state=documents.get(doc),reader=readerDocuments.get(doc),owner=state?.ownerDoc,host=reader?._window;
      if(!state||!reader||!owner||!documents.has(owner)||readerDocuments.get(owner)!==reader||owner.documentURI!=='resource://zotero/reader/reader.html'||!host||host.closed||!host.document||!reader.tabID||host.Zotero_Tabs?.selectedID!==reader.tabID||reader._iframeWindow?.document?.isSameNode?.(owner)!==true)return null;
      if(pingShortcuts.capture||!SMPingShortcuts.candidate(e)||SMPingShortcuts.nativeConflict(SMPingShortcuts.fromEvent(e),host.document,Services.appinfo.OS))return null;
      return pingShortcuts.resolve(e,pingDefinitions());
    }catch{return null;}
  }
  const transientPlayer=mediaIO?SMTransientPlayback.create({Player:SMPingPlayer,Audio:SMPingAudio,media:()=>mediaStore,volume:()=>pingVolume()/100,muted:()=>!pingSoundEnabled(),trace:mediaTrace}):null;
  const transientPing=SMTransientPing.create({animationPreset:material=>animationPreferences.resolve(material),animationOptions:(doc,spec)=>SMReaderOptions.observerOptions(doc.defaultView,spec),pdfDisplaySize:material=>pdfSizes.resolve(material),stopTemporary:()=>transientPlayer?.stopAll('SUPERSEDED'),page:SMPingPage,geometry:SMPageGeometry,version:Zotero.version,route:data=>retainedView?.accept(data)===true,playMaterial:(node,m,guard,audioWindow)=>transientPlayer?.play(node,m.markerID,()=>{if(runtime&&!userAuthorization?.allowed('READ'))throw Error('TRANSIENT_CONSENT_REQUIRED');guard();},audioWindow),stopMaterial:node=>transientPlayer?.stop(node),resolveShortcut:resolvePDFShortcut,loadMaterial:async choice=>{if(runtime)await runtime.assert('READ');return preparePingMaterial(choice,false);},validateMaterial:d=>(!runtime||userAuthorization?.allowed('READ')===true)&&pingMaterials.valid(d),feedback:(message,doc)=>{if(doc&&documents.has(doc))status(doc,message);}});
  const modeStatus=typeof SMPingModeStatus==='undefined'?null:SMPingModeStatus.create({getState:()=>cardMode?.getState?.().active?cardMode.getState():linkMode?.getState?.()||{active:false},cancel:reason=>{cardMode?.cancel(reason);linkMode?.cancel(reason);}});
  const nativeOrder=linkIO&&typeof SMPingLinkNativeOrder!=='undefined'?SMPingLinkNativeOrder.create({digest:text=>linkIO.digest(text)}):null;
  const linkMode=typeof SMPingLinkDryRun==='undefined'?null:SMPingLinkDryRun.create({nativeOrder,onState:(state,reason)=>!pingOnly||!!modeStatus?.sync(state,reason),page:SMPingPage,geometry:SMPageGeometry,feedback:(message,pdfDoc)=>{const owner=documents.get(pdfDoc)?.ownerDoc||pdfDoc;if(owner&&documents.has(owner))status(owner,message);}});
  if(pingOnly&&typeof SMPingCardMode!=='undefined')cardMode=SMPingCardMode.create({readSource:r=>{const record=retainedStore?.get(r.pingID,r);return record?{epoch:retainedStore.data.epoch,record}:null;},readTarget:targetForCard,readCurrent:source=>cardCommands.inspectRelation(source),submit:spec=>{const task=cardCommands.submit(spec);cardThumbnails?.refresh();return task.finally(()=>{cardThumbnails?.refresh();linkedLists?.refresh();});},writeEnabled:()=>cardWriteScope(),onState:(state,reason)=>!!modeStatus?.sync(state,reason),feedback:(message,doc)=>status(doc,message)});
  const sidebarProbe=SMSidebarQuickProbe.create();
  let quickEpoch=0;
  const quickPins=new SMQuickMarkers.Pins(k=>Zotero.Prefs.get(k,true),(k,v)=>{if(stopped||!isolated()||!compatibleHost())throw Error('Isolated Zotero 10.0.7 required');Zotero.Prefs.set(k,v,true);});
  const quickActions=new SMQuickMarkers.Actions(markerOperation);
  function customIdentity(parentID,item){const p=Zotero.Items.get(parentID);return {libraryID:p.libraryID,attachmentKey:p.key,annotationKey:item.key};}
  function hasSM(tags){return tags.some(t=>String(t.tag??t.name).startsWith('scholarmarker:'));}
  function customAssignment(parentID,item){return customStore?.assignment(customIdentity(parentID,item));}
  function hasAssociation(parentID,item){return !!core.association(item.getTags(),item.key)||!!customAssignment(parentID,item);}
  function projected(tags,key,id){
    const names=tags.map(t=>t.tag??t.name),custom=id&&customStore&&!customStore.blocked?customStore.assignment(id):null;
    if(custom){if(hasSM(tags))return null;const image=customStore.image(custom);return image?{reactionID:custom,image}:null;}
    if(names.filter(n=>n.startsWith(core.PREFIX+'reaction:')).length!==1||names.filter(n=>n.startsWith(core.PREFIX+'id:')).length!==1)return null;
    return core.association(tags,key);
  }
  function warmCustom(doc,reader){
    if(!customStore||customStore.blocked)return;const parent=Zotero.Items.get(reader.itemID);if(!parent)return;
    const ids=new Set(parent.getAnnotations().filter(a=>!a.deleted&&a.annotationType==='highlight').map(a=>customAssignment(parent.id,a)).filter(Boolean));
    for(const id of ids)customStore.prepare(id,(bytes,mime)=>SMCustomIO.decode(doc,bytes,mime)).then(()=>{if(!stopped&&documents.has(doc))pageLayers.get(doc)?.schedule('CUSTOM_ASSET_READY');});
  }
  function customChanged(){linkedLists?.refresh();cardThumbnails?.refresh();mediaPlayer?.stopAll();transientPlayer?.stopAll();retainedView?.changed();for(const panel of customPanels.values())panel.refreshCounts?.();refreshPages();for(const [doc,reader] of readerDocuments)if(pageLayers.has(doc))warmCustom(doc,reader);}
  function openCustom(doc,reader,target=null){
    if(!customStore)throw Error('Custom storage unavailable');customStore.ensure();cancelEdits('Custom Marker panel');
    doc=documents.get(doc)?.ownerDoc||doc;customPanels.get(doc)?.dispose();
    const legacyReader={itemID:reader.itemID,tabID:reader.tabID};
    const panel=SMCustomUI.open({doc,pingOnly,store:customStore,confirmMaterialDelete:material=>Services.prompt.confirm(doc.defaultView,'删除素材定义','删除素材定义“'+material.name+'”？已有引用仍会拒绝；不会批量删除页面Ping或原生高亮。'),pdfSizes,animationPreferences,animationOptions:spec=>SMReaderOptions.observerOptions(doc.defaultView,spec),batchManager:{confirm:count=>Services.prompt.confirmEx(doc.defaultView,'删除选中 Ping','确认删除选中的 '+count+' 个 Ping？将同时解除相关关联，不影响原生批注。',Services.prompt.BUTTON_POS_0*Services.prompt.BUTTON_TITLE_IS_STRING+Services.prompt.BUTTON_POS_1*Services.prompt.BUTTON_TITLE_IS_STRING,'删除','取消',null,null,{value:false})===0,create:({valid})=>{const parent=Zotero.Items.get(reader.itemID),identity={libraryID:parent.libraryID,attachmentKey:parent.key},itemID=reader.itemID,tabID=reader.tabID,epoch=retainedStore?.data?.epoch;const validate=()=>{if(!valid()||stopped||!documents.has(doc)||readerDocuments.get(doc)!==reader||reader.itemID!==itemID||reader.tabID!==tabID||reader._window?.closed||reader._window?.Zotero_Tabs?.selectedID!==tabID)throw Error('BATCH_READER_CHANGED');if(retainedStore?.data?.epoch!==epoch)throw Error('BATCH_EPOCH_CHANGED');if(!cardCommands||!retainedStore||retainedStore.closed||retainedStore.blocked||linkStore?.blocked||customStore?.blocked)throw Error('BATCH_STORE_BLOCKED');if(!cardWriteScope('DELETE'))throw Error('BATCH_DELETE_AUTHORIZATION_REQUIRED');};return SMPingBatchDelete.create({validate,reload:()=>retainedStore.reload(),list:()=>retainedStore.list(identity),inspectMany:records=>cardCommands.inspectMany(records.map(record=>({epoch:retainedStore.data.epoch,record}))),remove:(record,check)=>deletePagePing(retainedStore,record.pingID,record,record.revision,check,true),describe:record=>({label:customStore.data.definitions[record.markerID]?.name||record.markerID,image:customStore.image(record.markerID)||null}),changed:()=>{retainedView?.changed();cardThumbnails?.refresh();linkedLists?.refresh();}});}},linkedList:linkedLists?{open:({publish})=>linkedLists.open({confirm:()=>Services.prompt.confirm(doc.defaultView,'\u89e3\u9664\u5173\u8054','\u4ec5\u89e3\u9664\u8fd9\u4e00\u6761\u5173\u8054\uff0c\u4fdd\u7559 Ping \u548c\u539f\u751f\u9ad8\u4eae\u3002\u786e\u8ba4\uff1f'),identity:{libraryID:Zotero.Items.get(reader.itemID).libraryID,attachmentKey:Zotero.Items.get(reader.itemID).key},validate:()=>{if(stopped||!documents.has(doc)||readerDocuments.get(doc)!==reader||reader._window?.closed||reader._window?.Zotero_Tabs?.selectedID!==reader.tabID)throw Error('LIST_READER_CHANGED');},publish}),confirm:()=>Services.prompt.confirm(doc.defaultView,'\u89e3\u9664\u5173\u8054','\u4ec5\u89e3\u9664\u8fd9\u4e00\u6761\u5173\u8054\uff0c\u4fdd\u7559 Ping \u548c\u539f\u751f\u9ad8\u4eae\u3002\u786e\u8ba4\uff1f')}:null,legacyUnassign:legacyActions?{inspect:id=>legacyActions.inspect(id),execute:(token,event,guard)=>legacyActions.execute(token,{trusted:event?.isTrusted===true&&event.type==='click'&&event.target?.ownerDocument?.isSameNode(doc)===true,guard:()=>{if(stopped||!isolated()||reader.itemID!==legacyReader.itemID||reader.tabID!==legacyReader.tabID||!documents.has(doc)||readerDocuments.get(doc)!==reader||reader._window?.closed||reader._window?.Zotero_Tabs?.selectedID!==legacyReader.tabID)throw Error('LEGACY_READER_CHANGED');guard();},confirm:summary=>Services.prompt.confirm(doc.defaultView,'解除旧 Marker 关联','历史关联 '+summary.ordinal+'/'+summary.total+'：原生目标已核验有效，第'+summary.page+'页。仅解除这一条旧映射，保留原生高亮、Ping、全部媒体、Retained/A2 和 PingLink。其他引用仍会阻止素材删除。确认解除？')})}:null,media:mediaStore,soundSettings:mediaIO?{snapshot:()=>soundPrefs.snapshot(),volume:pingVolume,setVolume:value=>{if(stopped||!isolated())throw Error('MEDIA_SCOPE');if(!Number.isInteger(value)||value<0||value>100||value%5!==0)throw Error('INVALID_VOLUME');soundPrefs.setVolume(value);mediaPlayer?.setVolume(value/100);},enabled:()=>pingSoundEnabled(),set:enabled=>{if(stopped||!isolated())throw Error('MEDIA_SCOPE');soundPrefs.setEnabled(enabled);if(!enabled)mediaPlayer?.stopAll();transientPlayer?.stopAll();}}:null,quickPins:pingOnly?null:quickPins,pingShortcuts,retainedMode,shortcutConflict:value=>SMPingShortcuts.nativeConflict(value,reader._window?.document,Services.appinfo.OS),developer:pingOnly?null:target?null:developerPanels.get(doc),log:event=>{let session=diagnostic.importSessions.find(s=>s.importID===event.importID);if(!session){session={importID:event.importID,events:[]};diagnostic.importSessions.push(session);if(diagnostic.importSessions.length>4)diagnostic.importSessions.shift();}session.events.push(event);if(session.events.length>64)session.events.splice(16,1);},decode:(b,m)=>SMCustomIO.decode(doc,b,m),changed:customChanged,closed:()=>{cardMode?.cancel('PANEL_CLOSED');retainedView?.cancelAnimations();customPanels.delete(doc);},choose:target?markerID=>markerOperation(async()=>{
      const current=resolveHighlight(target.parentID,target.key),id=customIdentity(target.parentID,current);
      if(JSON.stringify(id)!==JSON.stringify(target.identity))throw Error('Annotation identity changed');
      const guard=()=>{if(reader.itemID!==target.parentID)throw Error('Reader identity changed');const a=resolveHighlight(target.parentID,target.key);if(JSON.stringify(customIdentity(target.parentID,a))!==JSON.stringify(target.identity)||hasSM(a.getTags()))throw Error('Remove the current Smile/Wow or unsupported SM metadata first');};
      guard();if(customStore.assignment(id)&&customStore.assignment(id)!==markerID)throw Error('Remove current custom Marker first');
      await customStore.assign(id,markerID,guard);customChanged();status(doc,'表情已关联，原生高亮保持不变');
    }):null});customPanels.set(doc,panel);
  }
  const config = new SMConfig.Store(k=>Zotero.Prefs.get(k,true),(k,v)=>{if(!isolated())throw Error('Isolated profile required');Zotero.Prefs.set(k,v,true);});
  const marker = id => config.resolve(id,visual.markers);
  function entries(selection=false){
    const ids=[...Object.keys(visual.markers),...config.load().markers.filter(m=>m.id.startsWith('custom-')).map(m=>m.id)];
    return ids.filter(id=>(!selection||core.REACTIONS[id])&&marker(id).enabled!==false).map(id=>[id,marker(id)]);
  }
  const motion = () => Zotero.Prefs.get('extensions.scholarmarker.motion', true) !== false;
  const wheels = new Map();
  const sessions = new Map();
  let generation=0;
  const readerDocuments = new Map();
  const pageLayers = new Map();
  let documentSequence=0;const readerIDs=new WeakMap();let readerSequence=0;function readerID(reader){if(!readerIDs.has(reader))readerIDs.set(reader,++readerSequence);return readerIDs.get(reader);}
  const pageMounting = new Set(),pageFailures=new Set();
  const perf={wireCalls:0,wireMounted:0,wireReused:0,documentObserverCallbacks:0,documentObservers:0,listenersAdded:0,listenersRemoved:0,pageMountAttempts:0,pageMountFailures:0,tagMounts:0,statusRequested:0,statusCreated:0,adjustCommands:0};
  const closedAudits=[];
  const tagDisplays = new Map();
  function tagLog(code,detail={}){
    const message=JSON.stringify({code,...detail});
    if(diagnostic.tagMessages.at(-1)===message)return;
    diagnostic.tagMessages.push(message);
    if(diagnostic.tagMessages.length>80)diagnostic.tagMessages.splice(16,1);
  }
  function mountTags(doc,reader){
    if(stopped||!isolated())return;
    if(Zotero.Prefs.get('extensions.scholarmarker.tagDisplay.enabled',true)===false){tagDisplays.get(doc)?.dispose();tagDisplays.delete(doc);return;}
    if(!compatibleHost()||doc.documentURI!=='resource://zotero/reader/reader.html'){
      if(doc.documentURI!=='resource://zotero/reader/pdf/web/viewer.html')tagLog('TAG_MOUNT_SKIPPED',{reason:'VERSION_OR_URI',version:String(Zotero.version),uri:String(doc.documentURI)});return;
    }
    const sidebar=doc.getElementById('sidebarContainer'),previous=tagDisplays.get(doc);
    if(previous?.root===sidebar)return;
    previous?.dispose();tagDisplays.delete(doc);
    if(!sidebar||!doc.head||typeof SMTagDisplay==='undefined'){tagLog('TAG_MOUNT_SKIPPED',{reason:'SIDEBAR_HEAD_OR_MODULE_MISSING',sidebar:!!sidebar,head:!!doc.head,module:typeof SMTagDisplay!=='undefined'});return;}
    const itemID=reader.itemID;
    const valid=()=>!stopped&&isolated()&&reader.itemID===itemID;
    tagLog('TAG_MOUNT_ATTEMPT',{itemID});
    try{
    tagDisplays.set(doc,SMTagDisplay.create({doc,root:sidebar,core,valid,read:()=>{
      if(!valid())throw Error('Reader changed');
      const parent=Zotero.Items.get(itemID);
      if(!parent||parent.deleted||!parent.isPDFAttachment()||parent.libraryID!==Zotero.Libraries.userLibraryID)throw Error('PDF unavailable');
      return parent.getAnnotations().filter(a=>!a.deleted).map(a=>({key:a.key,type:a.annotationType,tags:a.getTags().map(t=>({...t}))}));
    },options:spec=>SMReaderOptions.observerOptions(doc.defaultView,spec),log:(code,detail)=>tagLog(code,{itemID,...detail})}));
    tagLog('TAG_MOUNTED',{itemID});
    perf.tagMounts++;
    }catch(e){tagLog('TAG_MOUNT_FAILED',{itemID,reason:String(e.message)});}
  }
  const nodes = new Set(), documents = new Map(), effects = new Map();
  let controller, associationController, notifierID, positions=null, stopped = false;
  const legacy = () => !pingOnly&&Zotero.Prefs.get('extensions.scholarmarker.legacyCreateHighlight',true) === true;
  const diagnostic = {toolbarEvents: 0, popupEvents: 0, sidebarEvents:0,menuEvents:0,pageMessages:[],importSessions:[],tagMessages:[], errors: [], mediaErrors: [],dragSessions:[], audioPlayed:0,keyEvents:[]};
  const error = e => Zotero.logError(e);
  function cardWriteScope(kind='LINK'){if(runtime){try{runtime.assertIdentity();return userAuthorization?.allowed(kind)===true;}catch{return false;}}if(typeof SMPingSyntheticScope!=='undefined'&&SMPingSyntheticScope.rc2?.({Services,Zotero,Components})===true)return userAuthorization?.allowed(kind)===true;if(userAuthorization?.allowed(kind)===true)return true;return typeof SMPingSyntheticScope!=='undefined'&&SMPingSyntheticScope.allowed({Services,Zotero,Components})===true;}
  function isolated() {
    if(runtime){try{runtime.assertIdentity();return userAuthorization?.allowed('READ')===true;}catch{return false;}}
    if(typeof SMPingSyntheticScope!=='undefined'&&SMPingSyntheticScope.rc2?.({Services,Zotero,Components})===true)return true;
    if(cardWriteScope())return true;
    return false;
  }
  function guard(parent) {
    if (!isolated()) throw new Error('POC is locked: use the supplied isolated profile and data directory');
    if (!parent || !parent.isPDFAttachment() || parent.deleted || !parent.isEditable() ||
        parent.libraryID !== Zotero.Libraries.userLibraryID) throw new Error('Only editable local test PDF attachments are supported');
    if (typeof Zotero.Annotations?.saveFromJSON !== 'function') throw new Error('Native annotation API is unavailable');
  }
  const api = {
    guard,
    list: async parent => parent.getAnnotations().filter(a => !a.deleted).map(a => ({
      key: a.key, type: a.annotationType, text: a.annotationText, position: JSON.parse(a.annotationPosition),
      pageLabel: a.annotationPageLabel, sortIndex: a.annotationSortIndex, tags: a.getTags()})),
    key: () => Zotero.DataObjectUtilities.generateKey(),
    keyExists: (parent, key) => !!Zotero.Items.getByLibraryAndKey(parent.libraryID, key),
    create: (parent, json) => {if(runtime)throw Error('R2_NATIVE_WRITES_DISABLED');return Zotero.Annotations.saveFromJSON(parent, json);}
  };
  function resolveHighlight(parentID,key){
    if(!isolated())throw Error('Use the isolated V0.2.5 profile');
    if(!/^[A-Z0-9]{8}$/.test(key))throw Error('Invalid annotation key');
    const parent=Zotero.Items.get(parentID);guard(parent);
    const item=Zotero.Items.getByLibraryAndKey(parent.libraryID,key);
    if(!item||!item.isAnnotation?.()||item.deleted||item.annotationType!=='highlight'||item.parentID!==parent.id||item.libraryID!==parent.libraryID||!item.isEditable())throw Error('Select one editable highlight belonging to this PDF');
    if(item.hasChanged())throw Error('Native annotation has unsaved changes; finish editing and retry');
    return item;
  }
  function refreshBadges(){
    for(const [node,badge] of [...badges]){
      try{const reader=readerDocuments.get(node.ownerDocument),parent=Zotero.Items.get(reader.itemID);
        const item=parent.getAnnotations().find(a=>!a.deleted&&a.key===node.dataset.smAnnotation);
        const link=item&&core.association(item.getTags(),item.key);
        if(!link||link.reactionID!==node.dataset.smReaction){badge.dispose();badges.delete(node);}
      }catch{badge.dispose();badges.delete(node);}
    }
  }
  function positionIdentity(parentID,item){const parent=Zotero.Items.get(parentID);return {libraryID:parent.libraryID,attachmentKey:parent.key,annotationKey:item.key};}
  function statusDocuments(reader){return [...new Set([...readerDocuments].filter(([,r])=>r===reader).map(([doc])=>documents.get(doc)?.ownerDoc||doc))];}
  // Bind the exact menu target plus the currently mounted Reader generation.
  function quickTarget(reader,parentID,key){
    if(!compatibleHost())throw Error('Zotero 10.0.7/10.0.8 required');
    const item=resolveHighlight(parentID,key),doc=statusDocuments(reader)[0],state=documents.get(doc);
    const tabID=reader.tabID,host=reader._window;
    if(!doc||!state||!tabID||!host||host.closed||host.Zotero_Tabs?.selectedID!==tabID)throw Error('Reader identity unavailable');
    if(!Number.isSafeInteger(item.id)||item.id<=0)throw Error('Annotation identity unavailable');
    return {parentID,key,itemID:item.id,identity:customIdentity(parentID,item),doc,state,tabID,host,epoch:quickEpoch};
  }
  function quickGuard(reader,target,markerID){
    if(stopped||target.epoch!==quickEpoch||!isolated()||!compatibleHost()||reader.itemID!==target.parentID||reader.tabID!==target.tabID||reader._window!==target.host||target.host.closed||target.host.Zotero_Tabs?.selectedID!==target.tabID||documents.get(target.doc)!==target.state||readerDocuments.get(target.doc)!==reader)throw Error('Reader identity changed or closed');
    customStore.ensure();const current=resolveHighlight(target.parentID,target.key),id=customIdentity(target.parentID,current);
    if(current.id!==target.itemID||JSON.stringify(id)!==JSON.stringify(target.identity))throw Error('Annotation identity changed');
    if(!customStore.list().some(m=>m.id===markerID))throw Error('Unknown Marker');
    if(hasSM(current.getTags()))throw Error('Remove the current Smile/Wow or unsupported SM metadata first');
    const assigned=customStore.assignment(id);if(assigned&&assigned!==markerID)throw Error('Remove current custom Marker first');
    return id;
  }
  function quickCommand(reader,target,markerID){return ()=>quickActions.run(reader,async()=>{
    try{if(!target)throw Error('Reader identity unavailable');const id=quickGuard(reader,target,markerID);
      if(customStore.assignment(id)===markerID){status(target.doc,'这条高亮已关联此表情');return;}
      cancelEdits('Marker command');await customStore.assign(id,markerID,()=>quickGuard(reader,target,markerID));
      customChanged();if(!stopped&&documents.get(target.doc)===target.state)status(target.doc,'表情已关联，原生高亮保持不变');
    }catch(e){error(e);diagnostic.errors.push(String(e));if(diagnostic.errors.length>64)diagnostic.errors.shift();if(target&&documents.get(target.doc)===target.state)status(target.doc,SMCustomUI.humanize(e.message));}
  }).catch(e=>{error(e);});}
  function annotationMenu({reader,params,append}){
    if(stopped||!isolated())return;
    const parentID=reader.itemID,ids=Array.isArray(params?.ids)?params.ids.slice():[];
    let disabled=false;
    try{if(ids.length!==1)throw Error('Select exactly one existing highlight');resolveHighlight(parentID,ids[0]);}
    catch{disabled=true;}
    const command=markerID=>()=>markerOperation(async()=>{
      cancelEdits('Marker command');
      const docs=statusDocuments(reader);
      try{
        if(customStore){customStore.ensure();if(ids.length!==1)throw Error('Select exactly one existing highlight');const item=resolveHighlight(parentID,ids[0]),custom=customAssignment(parentID,item);
          if(custom){if(markerID!==null)throw Error('Remove current custom Marker before choosing Smile/Wow');if(hasSM(item.getTags()))throw Error('Conflicting associations; preserved for inspection');if(!positions)throw Error('Position cleanup unavailable');await positions.remove(positionIdentity(parentID,item));await customStore.unassign(customIdentity(parentID,item),()=>{const current=resolveHighlight(parentID,ids[0]);if(hasSM(current.getTags()))throw Error('Association changed; preserved');});customChanged();for(const doc of docs)status(doc,'Removed custom Marker');return;}
        }
        if(markerID===null&&positions){if(ids.length!==1)throw Error('Select exactly one existing highlight');const item=resolveHighlight(parentID,ids[0]);SMAssociation.plan(item.getTags(),item.key,null);await positions.remove(positionIdentity(parentID,item));}
        const result=await associationController.update(parentID,ids,markerID);refreshBadges();refreshPages();
        for(const doc of docs)status(doc,result.status+' / '+result.key);
      }catch(e){error(e);diagnostic.errors.push(String(e));for(const doc of docs)status(doc,'Failed: '+e.message);}
    });
    // Zotero 10.0.7 internal Reader menus invoke flat item.onCommand; groups are not submenus here.
    for(const [label,markerID] of [['Smile','smile'],['Wow','wow'],['Remove Marker',null]]){
      append({label:'ScholarMarker: '+label,disabled,persistent:true,onCommand:command(markerID)});
    }
    let adjustmentDisabled=disabled||!positions||positions.blocked;
    try{if(!disabled){const item=resolveHighlight(parentID,ids[0]);if(!hasAssociation(parentID,item))adjustmentDisabled=true;}}catch{adjustmentDisabled=true;}
    const positionCommand=reset=>async()=>{
      const docs=statusDocuments(reader);if(!reset)perf.adjustCommands++;
      try{if(ids.length!==1||!positions)throw Error('Position feature unavailable');const item=resolveHighlight(parentID,ids[0]);if(!hasAssociation(parentID,item))throw Error('Associate a Marker first');
        const id=positionIdentity(parentID,item);cancelEdits('Another position command');
        if(reset){const result=await positions.remove(id,()=>{const current=resolveHighlight(parentID,ids[0]);if(!hasAssociation(parentID,current))throw Error('Association expired');});refreshPages();for(const doc of docs)status(doc,result);}
        else{if(positions.blocked)throw Error('Position storage unavailable');let opened=false;for(const [doc,layer] of pageLayers){if(readerDocuments.get(doc)===reader&&layer.adjust?.(ids[0])){closedAudits.push({phase:'adjust',itemID:parentID,page:layer.diagnostics()});if(closedAudits.length>16)closedAudits.shift();opened=true;break;}}if(!opened)throw Error('Emoji is not safely displayed; cannot adjust');for(const doc of docs)status(doc,'Drag the selected emoji; Esc cancels');}
      }catch(e){error(e);for(const doc of docs)status(doc,'Failed: '+e.message);}
    };
    append({label:'ScholarMarker: Adjust Position',disabled:adjustmentDisabled,persistent:true,onCommand:positionCommand(false)});
    append({label:'ScholarMarker: Reset Position',disabled:adjustmentDisabled,persistent:true,onCommand:positionCommand(true)});
    if(customStore){let target=null;try{if(!disabled)target=quickTarget(reader,parentID,ids[0]);}catch{}
      for(const item of SMQuickMarkers.items(quickPins.list(customStore.list()),id=>quickCommand(reader,target,id),disabled||!target||customStore.blocked))append(item);
    }
    if(customStore)append({label:'ScholarMarker: Choose Custom Marker（选择其他表情…）',disabled:disabled||customStore.blocked,persistent:true,onCommand:()=>{try{if(ids.length!==1)throw Error('Select one highlight');const item=resolveHighlight(parentID,ids[0]);const doc=statusDocuments(reader)[0];if(!doc)throw Error('Reader unavailable');openCustom(doc,reader,{parentID,key:ids[0],identity:customIdentity(parentID,item)});}catch(e){for(const doc of statusDocuments(reader))status(doc,e.message);}}});
  }
  function pageLog(message){
    if(message.startsWith('DRAG_EVENT ')){try{const event=JSON.parse(message.slice(11));let group=diagnostic.dragSessions.find(s=>s.session===event.session);if(!group){group={session:event.session,key:event.key,events:[]};diagnostic.dragSessions.push(group);if(diagnostic.dragSessions.length>4)diagnostic.dragSessions.shift();}group.events.push(event);if(group.events.length>96)group.events.splice(16,1);}catch{}return;}
    if((message.startsWith('anchor ')||message.startsWith('anchor-decision '))&&Zotero.Prefs.get('extensions.scholarmarker.pageEmoji.debug',true)!==true)return;if(diagnostic.pageMessages.at(-1)!==message)diagnostic.pageMessages.push(message);if(diagnostic.pageMessages.length>256)diagnostic.pageMessages.shift();}
  function cancelEdits(reason){for(const layer of pageLayers.values())layer.cancelEdit?.(reason);}
  function refreshPages(){for(const layer of pageLayers.values())layer.schedule();}
  function mountPage(doc,reader){
    if(pingOnly)return;
    if(stopped||!isolated()||pageLayers.has(doc)||pageMounting.has(doc)||pageFailures.has(doc)||!compatibleHost()||Zotero.Prefs.get('extensions.scholarmarker.pageEmoji.enabled',true)===false||!doc.getElementById('viewer')||doc.documentURI!=='resource://zotero/reader/pdf/web/viewer.html')return;
    pageMounting.add(doc);perf.pageMountAttempts++;
    const itemID=reader.itemID;
    try{const layer=SMPageLayer.create({doc,itemID,controllerID:readerID(reader)+"/"+documents.get(doc)?.id,version:Zotero.version,geometry:SMPageGeometry,adapter:SMPageAdapter,drag:SMPageDrag,positions,feedback:message=>status(doc,message),log:pageLog,options:spec=>SMReaderOptions.observerOptions(doc.defaultView,spec),
      association:projected,
      records:()=>{
        if(!isolated()||reader.itemID!==itemID||Zotero.Prefs.get('extensions.scholarmarker.pageEmoji.enabled',true)===false)throw Error('Reader identity or experimental feature unavailable');
        const parent=Zotero.Items.get(itemID);guard(parent);const result=[];
        for(const item of parent.getAnnotations()){
          if(item.deleted||item.annotationType!=='highlight'||item.parentID!==itemID||item.libraryID!==parent.libraryID){pageLog('DIAGNOSTIC '+JSON.stringify({code:'RECORD_SKIPPED',itemID,key:item.key,reason:'Deleted, non-highlight or wrong PDF/library'}));continue;}
          try{const position=JSON.parse(item.annotationPosition);pageLog('DIAGNOSTIC '+JSON.stringify({code:'NATIVE_RECORD_ACCEPTED',itemID,key:item.key,pageIndex:position.pageIndex}));result.push({identity:{libraryID:parent.libraryID,attachmentKey:parent.key,annotationKey:item.key},key:item.key,type:'highlight',position,tags:item.getTags()});}catch{pageLog('DIAGNOSTIC '+JSON.stringify({code:'INVALID_GEOMETRY',phase:'NATIVE_RECORD_PROJECTION',itemID,key:item.key}));}
        }return result;
      }});pageLayers.set(doc,layer);warmCustom(doc,reader);pageLog('PRIVATE READ-ONLY viewport experiment: Zotero 10.0.7');
    }catch(e){perf.pageMountFailures++;pageFailures.add(doc);pageLog('page overlay unavailable (retry requires Reader reopen): '+e.message);}finally{pageMounting.delete(doc);}
  }
  function owned(node) { nodes.add(node); return node; }
  function button(doc, label, action) {
    const b = doc.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = '-moz-window-dragging:no-drag;font:11px sans-serif;line-height:18px;padding:1px 4px;border:1px solid #aaa;border-radius:3px;background:#fff;color:#222;white-space:nowrap;';
    b.addEventListener('mousedown', e => {e.preventDefault(); b.focus();});
    b.addEventListener('keydown', e => {
      if (['Enter',' '].includes(e.key) && interaction.accepts(e)) {e.preventDefault(); e.stopPropagation(); b.click();}
    });
    b.addEventListener('click', () => { if (!stopped) action(); });
    return b;
  }
  function status(doc, message) {
    if(customStore&&typeof SMCustomUI.humanize==='function'&&String(message).startsWith('Failed: '))message=SMCustomUI.humanize(String(message).slice(8));
    perf.statusRequested++;
    doc=documents.get(doc)?.ownerDoc||doc;
    if (stopped || !documents.has(doc)) return;
    let node = doc.getElementById('sm-poc-status');
    if (!node) {perf.statusCreated++; node = owned(doc.createElement('div')); node.id = 'sm-poc-status'; node.setAttribute('role', 'status');
      node.style.cssText = 'position:fixed;right:16px;bottom:16px;max-width:340px;padding:12px;background:#fff4cd;color:#222;border:1px solid #777;z-index:2147483647;pointer-events:none';
      doc.body.append(node); }
    node.textContent = message;
    const win = doc.defaultView;
    const state = documents.get(doc); if (state) { win.clearTimeout(state.statusTimer); state.statusTimer = win.setTimeout(() => {node.remove(); nodes.delete(node);}, 4500); }
  }
  function cancelEffect(doc) {
    const state = effects.get(doc); if (!state) return;
    doc.defaultView.clearTimeout(state.timer);
    state.visual.dispose();
    if (state.audio) { state.audio.pause(); state.audio.removeAttribute('src'); state.audio.load(); }
    effects.delete(doc);
  }
  function play(doc, reactionID) {
    if (stopped || !isolated()) return;
    cancelEffect(doc);
    const component = visual.create(doc, marker(reactionID), {root,motion});
    const node = component.node;
    node.dataset.smPocEffect = 'true'; node.setAttribute('role', 'status'); node.setAttribute('aria-label', marker(reactionID).name);
    node.style.cssText = 'position:fixed;right:28px;top:85px;font-size:64px;z-index:2147483647;pointer-events:none';
    doc.body.append(node);
    if (motion() && !doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const style = doc.createElement('style');
      style.textContent = '@keyframes sm-poc-pop {0%{opacity:0;transform:scale(.7)}20%,70%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.15)}}';
      node.append(style); node.style.animation = 'sm-poc-pop 950ms ease-out both';
    }
    let audio;
    if (!Zotero.Prefs.get('extensions.scholarmarker.poc.muted', true) && marker(reactionID).audio) {
      const resource=marker(reactionID).audio;
      audio = new doc.defaultView.Audio(resource.startsWith('data:')?resource:(soundURL || root + resource)); audio.volume = .25;
      audio.play().then(() => diagnostic.audioPlayed++).catch(e => { diagnostic.mediaErrors.push(String(e));error(e); status(doc, 'Reaction displayed; audio unavailable'); });
    }
    const timer = doc.defaultView.setTimeout(() => cancelEffect(doc), 1000);
    effects.set(doc, {node, visual:component, audio, timer});
    component.show();
  }
  function closeWheel(doc) {
    const wheel = wheels.get(doc); if (!wheel) return;
    wheel.cleanup(); wheel.node.remove(); nodes.delete(wheel.node); wheels.delete(doc);
  }
  function invalidate(doc) {
    const session=sessions.get(doc);
    if(session){session.valid=false;session.observer?.disconnect();sessions.delete(doc);}
    closeWheel(doc);
    for(const [node,badge] of badges) if(node.ownerDocument===doc) badge.close();
  }
  function validSession(doc,context) {
    return context.valid && sessions.get(doc)===context && context.row.isConnected &&
      !doc.hidden && (!doc.hasFocus || doc.hasFocus());
  }
  function keys() {
    const mapping=interaction.bindings(Zotero.Prefs.get('extensions.scholarmarker.v02a.keys', true));
    const raw=config.load().markers;
    for(const m of raw){if(m.enabled&&m.key)mapping[m.id]=m.key;else delete mapping[m.id];}
    const values=Object.values(mapping);if(new Set(values).size!==values.length)throw Error('Marker key conflicts with wheel or another Marker');
    return mapping;
  }
  async function trigger(doc, reader, id, context = null) {
    if (stopped || !isolated()) return;
    // A selection can only be saved from its still-connected native popup.
    if (context && !validSession(doc,context)) { status(doc, 'NOT SAVED: selection session expired; select text again'); return; }
    if(marker(id).enabled===false){status(doc,'NOT SAVED: Marker disabled or missing');return;}
    play(doc, id);
    if (context && !core.REACTIONS[id]) {status(doc,'NOT SAVED: custom Markers support temporary Ping only');return;}
    if (!context) {status(doc, 'NOT SAVED — temporary Reaction. Associate an existing highlight from its native annotation menu.'); return;}
    try {
      const result = await controller.save(Zotero.Items.get(context.itemID), context.snapshot, id);
      status(doc, result.status === 'conflict' ? 'NOT SAVED: existing native highlight kept unchanged' :
        (result.status === 'created' ? 'Saved ' : 'Already saved ') + result.key + ' / ' + result.association.reactionID);
    } catch(e) { error(e); diagnostic.errors.push(String(e)); status(doc, 'NOT SAVED: ' + e.message); }
  }
  function openWheel(doc, reader, context = null, host = null) {
    if (stopped || !isolated()) return;
    if(context && !validSession(doc,context)){status(doc,'NOT SAVED: selection session expired');return;}
    closeWheel(doc);
    const node = owned(doc.createElement('div'));
    node.dataset.smPoc = 'wheel'; node.setAttribute('role','group');
    node.setAttribute('aria-label',context ? 'SM selection reaction wheel' : 'SM temporary reaction wheel');
    const viewport=doc.defaultView;
    const options = entries(!!context), choices = [];
    const place=interaction.placement(viewport.innerWidth||1000,viewport.innerHeight||600,host?.getBoundingClientRect?.());
    if(options.length>2)place.compact=true;
    node.style.cssText = '-moz-window-dragging:no-drag;position:fixed;box-sizing:border-box;background:#fffaf0;border:1px solid #b9ab91;box-shadow:0 5px 20px #0003;z-index:2147483646;'+
      'left:'+place.left+'px;top:'+place.top+'px;width:'+place.width+'px;height:'+place.height+'px;'+
      (place.compact?'display:flex;flex-wrap:wrap;align-content:start;gap:6px;padding:6px;overflow:auto;':'border-radius:50%;');
    const cancel = button(doc, context ? 'Cancel save' : 'Cancel · temporary', () => closeWheel(doc));
    cancel.style.cssText += place.compact?'':'position:absolute;left:40px;top:92px;width:140px;min-height:32px;white-space:normal;';
    if(place.compact){const text=doc.createElement('span');text.textContent='Compact reactions';text.style.cssText='width:100%;font:12px sans-serif;';node.append(text);}
    node.append(cancel);
    options.forEach(([id,reaction], index) => {
      const angle = index * 2*Math.PI/options.length - Math.PI/2;
      const choice = button(doc, reaction.icon + ' ' + reaction.name, () => {
        closeWheel(doc); void trigger(doc, reader, id, context);
      });
      choice.setAttribute('aria-label','SM wheel ' + reaction.name);
      choice.style.cssText += 'font-size:17px;'+(place.compact?'min-height:36px;':'position:absolute;left:' + (70+Math.cos(angle)*75) + 'px;top:' + (90+Math.sin(angle)*65) + 'px;width:80px;height:40px;');
      choices.push(choice);node.append(choice);
    });
    const move = e => {
      const bounds = node.getBoundingClientRect();
      const selected = interaction.direction(e.clientX-bounds.left-110,e.clientY-bounds.top-110,options.length);
      choices.forEach((choice,i)=>choice.setAttribute('aria-pressed',String(i===selected)));
    };
    node.addEventListener('mousemove',move);
    const focusable=[...choices,cancel];
    const keyboard=e=>{
      diagnostic.keyEvents.push({key:['Enter',' ','Escape','Tab','ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key)?e.key:'other',phase:context?'selection-wheel-control':'temporary-wheel-control',defaultPrevented:e.defaultPrevented});
      if(diagnostic.keyEvents.length>80)diagnostic.keyEvents.shift();
      if(e.repeat||e.isComposing||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||e.defaultPrevented)return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();invalidate(doc);return;}
      const current=focusable.indexOf(doc.activeElement);
      if(['Tab','ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key)){
        e.preventDefault();e.stopPropagation();const delta=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;
        focusable[(current+delta+focusable.length)%focusable.length].focus();
      }else if(['Enter',' '].includes(e.key)&&current>=0){
        e.preventDefault();e.stopPropagation();focusable[current].click();
      }
    };
    node.addEventListener('keydown',keyboard,true);
    const cleanup = () => {node.removeEventListener('mousemove',move);node.removeEventListener('keydown',keyboard,true);};
    wheels.set(doc,{node,cleanup,context});
    doc.body.append(node);
    (choices[0]||cancel).focus?.();
  }
  async function restoreLinks(identity){if(!linkStore||!linkIO||stopped)return;if(linkRestorePending)return linkRestorePending;linkRestorePending=(async()=>{try{await linkIO.validateNamespace();if(!await linkIO.exists('links-v1.json')&&!await linkIO.exists('intent-v1.json')&&!await linkIO.exists('backup-v1.json'))return;await retainedStore.reload();for(const record of retainedStore.data.records.filter(r=>!identity||r.libraryID===identity.libraryID&&r.attachmentKey===identity.attachmentKey)){if(stopped)return;const s={epoch:retainedStore.data.epoch,record},r=await linkStore.inspect(s);linkRestores.push({status:r.status});if(linkRestores.length>32)linkRestores.shift();}}catch(e){linkRestores.push({status:'UNVERIFIABLE',reason:String(e.message).slice(0,160)});if(linkRestores.length>32)linkRestores.shift();}finally{linkRestorePending=null;cardThumbnails?.refresh();}})();return linkRestorePending;}
  function mountTransient(doc,reader,ownerDoc){
    if(stopped||!isolated()||!compatibleHost()||doc.documentURI!=='resource://zotero/reader/pdf/web/viewer.html')return;
    const state=documents.get(doc),parentID=reader.itemID,parent=Zotero.Items.get(parentID);guard(parent);
    const identity={libraryID:parent.libraryID,attachmentKey:parent.key,parentID},tabID=reader.tabID,host=reader._window;
    const validate=(active=true)=>{if(stopped||!isolated()||!state||documents.get(doc)!==state||readerDocuments.get(doc)!==reader||reader.itemID!==parentID||!tabID||reader.tabID!==tabID||!host||host.closed||(active&&(host.Zotero_Tabs?.selectedID!==tabID||!host.document?.hasFocus?.())))throw Error('PING_READER_IDENTITY');const current=Zotero.Items.get(parentID);guard(current);if(current.libraryID!==identity.libraryID||current.key!==identity.attachmentKey)throw Error('PING_ATTACHMENT_IDENTITY');};
    const conflict=(value='Ctrl+Shift+KeyM')=>{try{return !!SMPingShortcuts.nativeConflict(value,host?.document,Services.appinfo.OS);}catch{return true;}};
    transientPing.mount({doc,owner:ownerDoc,identity,generation:state?.id,validate,conflict});retainedView?.mount({doc,owner:ownerDoc,identity,validate});void restoreLinks(identity);
  }
  function wire(doc, reader, ownerDoc = doc) {
    perf.wireCalls++;
    if (documents.has(doc)){perf.wireReused++;return;}
    const cleanups = [];
    const listen = (target, type, fn, capture = false) => {target.addEventListener(type, fn, capture);perf.listenersAdded++; cleanups.push(() => {target.removeEventListener(type, fn, capture);perf.listenersRemoved++;});};
    const down = e => {
      if(pingOnly)return;
      if (e.key === 'Escape') { invalidate(ownerDoc); return; }
      if (stopped || !isolated() || doc.hidden || (doc.hasFocus && !doc.hasFocus()) || !interaction.accepts(e)) return;
      let mapping; try { mapping = keys(); } catch(error) {status(ownerDoc,error.message);return;}
      const action = Object.keys(mapping).find(a=>mapping[a]===e.key?.toLowerCase());
      if (!action) return;
      e.preventDefault(); e.stopPropagation();
      if (action === 'wheel') {
        if (wheels.has(ownerDoc)) closeWheel(ownerDoc); else openWheel(ownerDoc,reader);
      } else {
        closeWheel(ownerDoc); void trigger(ownerDoc,reader,action);
      }
    };
    const isPDF=String(doc.documentURI||doc.URL||'').startsWith('resource://zotero/reader/pdf/web/viewer.html');
    const trace=(e,phase)=>{
      if(!['q','r','j','k','Enter',' '].includes(e.key))return;
      diagnostic.keyEvents.push({key:e.key,phase,defaultPrevented:e.defaultPrevented,cancelBubble:e.cancelBubble,input:!!e.target?.closest?.('input,textarea,[contenteditable]:not([contenteditable="false"])')});
      if(diagnostic.keyEvents.length>80)diagnostic.keyEvents.shift();
    };
    // Only the identified PDF iframe window, registered after native Reader handlers.
    // Native stopPropagation doesn't exclude later listeners on this same target.
    // Never stopImmediatePropagation or bypass defaultPrevented.
    if(isPDF){listen(doc.defaultView,'keydown',e=>{trace(e,'pdf-window-capture');down(e);},true);
      listen(doc,'keydown',e=>trace(e,'pdf-document-bubble'));
    }else listen(doc,'keydown',e=>{trace(e,'reader-document-bubble');down(e);});
    listen(doc.defaultView, 'pagehide', () => disposeDocument(doc));
    const cancel = event => {mediaTrace('TRANSIENT_READER_EVENT',typeof event==='string'?event:event?.type||'UNKNOWN');const panelEvent=!!event?.target?.closest?.('[data-sm-user-panel]');mediaPlayer?.stopAll({preserveValidations:panelEvent});transientPlayer?.stopAll();retainedView?.changed();transientPing.invalidateAll(event==='PDF_BLUR'?'PDF_BLUR':'SCROLL_RESIZE_OR_FOCUS');sidebarProbe.closeReader(reader);invalidate(ownerDoc);cancelEffect(ownerDoc);};
    listen(doc.defaultView, 'blur', () => {
      // Moving focus from the PDF iframe into our portal is not app focus loss.
      Promise.resolve().then(()=>{
        const wheel=wheels.get(ownerDoc);
        if(wheel?.node.contains?.(ownerDoc.activeElement) && ownerDoc.hasFocus?.())return;
        cancel('PDF_BLUR');
      });
    });
    listen(doc.defaultView, 'resize', cancel);
    listen(doc, 'scroll', cancel, true);
    listen(doc, 'wheel', cancel, true);
    listen(doc, 'compositionstart', cancel, true);
    listen(doc, 'pointerdown', e => {if(!e.target?.closest?.('[data-sm-drag-target]'))cancelEdits('Clicked outside');if (!e.target?.closest?.('[data-sm-poc]')) invalidate(ownerDoc);});
    listen(doc, 'focusin', e => {if (e.target?.closest?.('input,textarea,[contenteditable]:not([contenteditable="false"])')) cancel(e);});
    listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
    // Standard DOM frame traversal, without reader._iframeWindow or private selection state.
    const scan = () => { for (const frame of doc.querySelectorAll('iframe')) {
      if (!frame.dataset.smPocWired) { frame.dataset.smPocWired = 'true';
        listen(frame, 'load', () => { try { if (frame.contentDocument) wire(frame.contentDocument,reader,ownerDoc); } catch {} });
        cleanups.push(() => delete frame.dataset.smPocWired); }
      try { if (frame.contentDocument) wire(frame.contentDocument,reader,ownerDoc); } catch {}
    }};
    // Capture iframe loads using DOM events, avoiding cross-compartment option dictionaries.
    listen(doc, 'load', e => {try { if (e.target?.localName === 'iframe' && e.target.contentDocument) wire(e.target.contentDocument,reader,ownerDoc); } catch {}}, true);
    if(doc.defaultView.MutationObserver){
      const observer=new doc.defaultView.MutationObserver(records=>{
        perf.documentObserverCallbacks++;
        if(records?.some(r=>r.removedNodes?.length)){sidebarProbe.sweep(doc);cardMode?.sweep(doc);cardThumbnails?.sweep(doc);transientPing.sweep(doc);modeStatus?.sweep(doc);}
        mountPage(doc,reader);
        mountTags(doc,reader);
        for(const [node,badge] of [...badges])if(node.ownerDocument===doc&&!node.isConnected){badge.dispose();badges.delete(node);}
      });
      // Reader callbacks cross compartments: don't pass a caller-realm dictionary.
      try{
        observer.observe(doc.body,SMReaderOptions.observerOptions(doc.defaultView,{childList:true,subtree:true}));
        perf.documentObservers++;cleanups.push(()=>{observer.disconnect();perf.documentObservers--;});
        if(doc.documentURI==='resource://zotero/reader/reader.html')tagLog('TAG_WIRE_OBSERVER_READY');
      }catch(e){observer.disconnect();cleanups.forEach(fn=>fn());tagLog('TAG_WIRE_OBSERVER_FAILED',{reason:String(e.message)});throw e;}
    }
    documents.set(doc, {cleanups, statusTimer: null,ownerDoc,id:++documentSequence});perf.wireMounted++; readerDocuments.set(doc,reader); mountTransient(doc,reader,ownerDoc); mountPage(doc,reader); mountTags(doc,reader); scan();
  }
  function disposeDocument(doc) {
    const state = documents.get(doc); if (!state) return;
    cardThumbnails?.disposeDocument(doc);cardMode?.disposeDocument(doc);linkMode?.disposeDocument(doc);modeStatus?.disposeDocument(doc);mediaPlayer?.stopDocument(doc);transientPlayer?.stopDocument(doc);transientPing.disposeDocument(doc);retainedView?.disposeDocument(doc);sidebarProbe.disposeDocument(doc);
    customPanels.get(doc)?.dispose();customPanels.delete(doc);
    developerPanels.delete(doc);
    const layer=pageLayers.get(doc),tags=tagDisplays.get(doc);
    const audit={phase:'close',readerID:readerID(readerDocuments.get(doc)),documentID:state.id,pageBefore:layer?.diagnostics(),tagsBefore:tags?.diagnostics()};
    layer?.dispose();pageLayers.delete(doc);pageFailures.delete(doc);
    tags?.dispose();tagDisplays.delete(doc);audit.pageAfter=layer?.diagnostics();audit.tagsAfter=tags?.diagnostics();closedAudits.push(audit);if(closedAudits.length>16)closedAudits.shift();
    invalidate(state.ownerDoc); cancelEffect(state.ownerDoc);
    for(const [loader,owner] of [...fileReaders])if(owner===doc){loader.abort();fileReaders.delete(loader);}
    for (const [child, childState] of [...documents]) if(child !== doc && childState.ownerDoc === doc) disposeDocument(child);
    closeWheel(doc); state.cleanups.forEach(fn => fn());
    doc.defaultView.clearTimeout(state.statusTimer); cancelEffect(doc);
    for (const [node,badge] of [...badges]) if(node.ownerDocument===doc){badge.dispose();badges.delete(node);}
    for (const n of nodes) if (n.ownerDocument === doc) {n.remove(); nodes.delete(n);}
    documents.delete(doc);readerDocuments.delete(doc);
    if(!pageLayers.size)customStore?.release();
  }
  function toolbar({doc, reader, append}) {
    if (stopped) return;
    if (!isolated()) return;
    wire(doc,reader);
    invalidate(doc);
    if(pingOnly){for(const n of [...nodes])if(n.ownerDocument===doc&&n.dataset.smPoc==='toolbar'){n.remove();nodes.delete(n);}const row=owned(doc.createElement('span'));row.dataset.smPoc='toolbar';row.style.cssText='display:inline-flex;align-items:center;gap:4px;max-width:100%;min-width:0;flex-wrap:wrap;';row.append(button(doc,'Ping',()=>{if(customStore)openCustom(doc,reader);else status(doc,'Ping 素材暂不可用。');}));append(row);modeStatus?.mount({doc,reader,row,focusTarget:row.children[0]});return;}
    for (const n of [...nodes]) if(n.ownerDocument===doc && n.dataset.smPoc==='toolbar') {n.remove();nodes.delete(n);}
    const row = owned(doc.createElement('span')); row.dataset.smPoc = 'toolbar';
    row.style.cssText = '-moz-window-dragging:no-drag;display:inline-flex;align-items:center;gap:3px;white-space:nowrap;';
    const panel = doc.createElement('div');
    panel.style.cssText='-moz-window-dragging:no-drag;position:fixed;right:20px;top:120px;gap:6px;padding:10px;background:white;border:1px solid #aaa;z-index:2147483646;';
    panel.style.display = 'none';
    // Reader prevents pointer defaults; use an explicit handler rather than summary's default toggle.
    const controls = button(doc, '⋯', () => {
      if(customStore){try{openCustom(doc,reader);}catch(e){status(doc,SMCustomUI.humanize(e.message));}return;}
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? 'grid' : 'none';
      controls.setAttribute('aria-expanded', String(opening));
    });
    controls.title = customStore?'打开 ScholarMarker':'SM test controls';if(customStore)controls.setAttribute('aria-haspopup','dialog');else controls.setAttribute('aria-expanded','false');
    row.append(button(doc, 'SM ◉', () => {if(customStore){try{openCustom(doc,reader);}catch(e){status(doc,SMCustomUI.humanize(e.message));}}else if(wheels.has(doc))closeWheel(doc);else openWheel(doc,reader);}),controls,panel);
    row.append(button(doc,'Ping 帮助',()=>status(doc,'在“我的 Ping”设置自定义快捷键；仅在当前 PDF 聚焦时触发，是否保存由“保留 Ping”开关决定。')));
    panel.append(
      button(doc, 'SM mute', () => {if (!isolated()) return; const key = 'extensions.scholarmarker.poc.muted';
        const next = !Zotero.Prefs.get(key, true); Zotero.Prefs.set(key, next, true);
        for (const d of effects.keys()) cancelEffect(d); status(doc, next ? 'Sound muted' : 'Sound enabled');}),
      button(doc, 'SM saved?', async () => {try {
        const parent = Zotero.Items.get(reader.itemID); guard(parent);
        const items = await api.list(parent), linked = items.map(a => core.association(a.tags, a.key)).filter(Boolean);
        status(doc, 'Saved Reactions: ' + linked.length + ' ' + linked.map(x => x.recordID + ':' + x.reactionID).join(', '));
      } catch(e) {error(e); status(doc, e.message);} }));
    panel.append(button(doc,'SM motion',()=>{
      if(!isolated())return;
      const next=!motion();Zotero.Prefs.set('extensions.scholarmarker.motion',next,true);
      for(const d of effects.keys())cancelEffect(d);for(const b of badges.values())b.close();
      status(doc,next?'Motion enabled':'Motion disabled');
    }));
    if(customStore)panel.append(button(doc,'ScholarMarker: Manage Markers',()=>{try{openCustom(doc,reader);}catch(e){status(doc,e.message);}}));
    const editor=doc.createElement('textarea');editor.rows=8;editor.cols=42;
    editor.setAttribute('aria-label','SM Marker configuration JSON');editor.value=JSON.stringify(config.load().markers,null,2);
    panel.style.cssText+='max-height:70vh;overflow:auto;max-width:90vw;';
    panel.append(editor,button(doc,'SM save Markers',()=>{
      try{const c=config.load();c.markers=JSON.parse(editor.value);
        const mapping=interaction.bindings(Zotero.Prefs.get('extensions.scholarmarker.v02a.keys',true));
        for(const m of c.markers){if(m.enabled&&m.key)mapping[m.id]=m.key;else delete mapping[m.id];}
        if(new Set(Object.values(mapping)).size!==Object.values(mapping).length)throw Error('Shortcut conflict');
        config.save(c);for(const d of effects.keys())cancelEffect(d);for(const d of documents.keys())invalidate(d);status(doc,'Markers saved. Custom Markers support temporary Ping only.');
      }catch(e){status(doc,'NOT SAVED: '+e.message);}
    }));
    const picker=doc.createElement('input');picker.type='file';picker.accept='.gif,.png,.wav';picker.setAttribute('aria-label','SM import test asset');
    picker.addEventListener('change',()=>{
      const file=picker.files?.[0];if(!file)return;
      if(file.size>128*1024){status(doc,'Asset too large (128 KiB maximum)');return;}
      const loader=new doc.defaultView.FileReader();fileReaders.set(loader,doc);
      loader.onloadend=()=>fileReaders.delete(loader);
      loader.onload=()=>{if(stopped||!documents.has(doc))return;try{const id=config.import(loader.result);status(doc,'Imported '+id+'; reference it in Marker JSON');}catch(e){status(doc,e.message);}};
      loader.onerror=()=>{if(!stopped)status(doc,'Asset import failed');};loader.readAsDataURL(file);
    });panel.append(picker);
    const heading = doc.createElement('span');heading.textContent=customStore?'临时反馈按键（测试，不保存选区）':'Reader keys (Q / R / J / K)';panel.append(heading);
    for (const action of ['wheel','smile','wow']) {
      const label = doc.createElement('label');label.textContent=action+' ';
      const input = doc.createElement('input');input.type='text';input.maxLength=1;
      input.style.cssText='width:30px;';input.setAttribute('aria-label','SM key '+action);
      try {input.value=keys()[action];}catch {input.value='';}
      input.addEventListener('change',()=>{
        try {const next={...interaction.bindings(Zotero.Prefs.get('extensions.scholarmarker.v02a.keys',true)),[action]:input.value.toLowerCase()};interaction.bindings(JSON.stringify(next));
          Zotero.Prefs.set('extensions.scholarmarker.v02a.keys',JSON.stringify(next),true);status(doc,'Reader keys saved');}
        catch(e){status(doc,e.message);try{input.value=keys()[action];}catch{}}
      });label.append(input);panel.append(label);
    }
    if(customStore){
      const labels={'SM mute':'临时反馈静音（测试）','SM saved?':'统计旧版关联（只读）','SM motion':'旧版临时/悬停动效（测试）','SM save Markers':'保存旧版测试配置（JSON）'};
      for(const node of panel.children)if(labels[node.textContent])node.textContent=labels[node.textContent];
      editor.setAttribute('aria-label','旧版 Marker 测试配置 JSON');picker.setAttribute('aria-label','旧版测试素材导入（非自定义表情库）');
      panel.append(button(doc,'临时反馈轮盘（测试）',()=>openWheel(doc,reader)));developerPanels.set(doc,panel);
    }
    append(row);
  }
  function popup({doc, reader, params, append}) {
    if (stopped) return;
    if (!isolated()) return;
    wire(doc,reader);
    invalidate(doc);
    for (const n of [...nodes]) if(n.ownerDocument===doc && n.dataset.smPoc==='selection' && !n.isConnected) nodes.delete(n);
    let snapshot;
    try { snapshot = core.selection(JSON.parse(JSON.stringify(params.annotation))); }
    catch(e) { status(doc, e.message); return; }
    const row = owned(doc.createElement('div')); row.dataset.smPoc = 'selection';
    const context={row,snapshot,itemID:reader.itemID,valid:true,generation:++generation};sessions.set(doc,context);
    if(doc.defaultView.MutationObserver){context.observer=new doc.defaultView.MutationObserver(()=>{if(sessions.get(doc)===context&&!row.isConnected)invalidate(doc);});
      // Observe removal, never alter native popup DOM; the callback only disposes our UI.
      context.observer.observe(doc.body,{childList:true,subtree:true});}
    const opener=button(doc, 'SM ◉ + highlight', () => openWheel(doc,reader,context,row));
    row.append(opener);
    for (const [id, reaction] of entries(true)) {
      row.append(button(doc, 'SM ' + reaction.icon + ' + highlight', async () => {
        if (!row.isConnected) return;
        await trigger(doc,reader,id,context);
      }));
    }
    append(row);
  }
  async function readCardSnapshot({emptyAllowed=false}={}){if(stopped||!linkStore||linkStore.blocked||cardCommands?.diagnostics().pending||retainedStore?.blocked||customStore?.blocked)throw Error('CARD_DISPLAY_UNAVAILABLE');await linkIO.validateDisplayNamespace();const before=await linkStore.ready(),listBackup=emptyAllowed?await linkStore.raw('backup-v1.json'):null;if(emptyAllowed){const b=listBackup===null?null:linkStore.unpack(listBackup),backup=b&&{present:b.present,value:b.present?linkStore.unpack(b.text):null};if(!SMPingLinkedList.backupCoherent(before.value,backup))throw Error('LIST_BACKUP_VERSION');}return customStore.run(async()=>{const state=await retainedStore.state();if(state.legacy||!state.payload){if(!emptyAllowed||before.value.links.length)throw Error('CARD_DISPLAY_SOURCE_UNAVAILABLE');state.payload={epoch:null,records:[]};}const after=await linkStore.ready();if(before.raw!==after.raw||await customStore.io.readState()!==customStore.disk||emptyAllowed&&await linkStore.raw('backup-v1.json')!==listBackup)throw Error('CARD_DISPLAY_CHANGED');if(stopped||linkStore.blocked||cardCommands?.diagnostics().pending||retainedStore?.blocked||customStore?.blocked)throw Error('CARD_DISPLAY_UNAVAILABLE');await linkIO.validateDisplayNamespace();const mediaUnavailable=!!mediaStore?.blocked||await mediaIO.intent()||await mediaIO.tmp()||await mediaIO.audioIntent()||await mediaIO.audioTmp()||await mediaIO.read()!==(mediaStore?.base?.raw??mediaStore?.raw??null)||await mediaIO.readAudio()!==(mediaStore?.audioRaw??null);return {status:'CONFIRMED',links:before.value.links,payload:state.payload,mediaUnavailable,version:{revision:before.value.revision,backup:emptyAllowed?linkIO.digest(listBackup||'ABSENT'):null,digest:linkIO.digest(before.raw===null?'ABSENT':before.raw),payload:linkIO.digest(JSON.stringify(state.payload)),catalog:linkIO.digest(customStore.disk||'ABSENT'),media:linkIO.digest(JSON.stringify({base:mediaStore?.base?.raw??mediaStore?.raw??null,audio:mediaStore?.audioRaw??null,unavailable:mediaUnavailable}))}};});}
  function validateCardReader(doc,reader,parentID,tabID,host,state){guard(Zotero.Items.get(parentID));if(stopped||reader.itemID!==parentID||reader.tabID!==tabID||reader._window!==host||!host||host.closed||host.Zotero_Tabs?.selectedID!==tabID||documents.get(doc)!==state||readerDocuments.get(doc)!==reader||!SMPingPage.same(reader._iframeWindow?.document,doc)||reader._iframe?.isConnected!==true)throw Error('CARD_READER_CHANGED');}
  function targetForCard(reader,key){try{const parent=Zotero.Items.get(reader.itemID),item=resolveHighlight(reader.itemID,key);if(!Number.isSafeInteger(item.id)||item.id<=0||item.key!==key)throw Error('CARD_ITEM_UNSAVED');const position=item.annotationPosition;if(typeof position!=='string'||position.length>100000)throw Error('CARD_POSITION_LIMIT');const raw=JSON.parse(position);const target={libraryID:parent.libraryID,attachmentKey:parent.key,annotationKey:item.key,itemID:item.id,position:raw,type:item.annotationType,saved:true,editable:item.isEditable()===true,deleted:false};SMPingLinkGeometry.target(target);return target;}catch{return null;}}
  function startCardAssociation(doc,reader,state,record){const owner=state.ownerDoc||doc,ownerState=documents.get(owner),parentID=reader.itemID,tabID=reader.tabID,host=reader._window;readerUI?.refreshHeaders();cardMode.start({doc,owner,reader,record,validate:()=>{validateCardReader(owner,reader,parentID,tabID,host,ownerState);const p=Zotero.Items.get(parentID);if(record.libraryID!==p.libraryID||record.attachmentKey!==p.key)throw Error('CARD_SOURCE_ATTACHMENT');if(documents.get(doc)!==state||readerDocuments.get(doc)!==reader)throw Error('CARD_SOURCE_DOCUMENT_CHANGED');}});}
  function cardHeader({doc,reader,params,append}){if(stopped||!isolated()||!cardMode)return;wire(doc,reader);const key=params?.annotation?.id,parentID=reader.itemID,tabID=reader.tabID,host=reader._window,state=documents.get(doc);const validate=()=>validateCardReader(doc,reader,parentID,tabID,host,state);if(!targetForCard(reader,key)){const notice=doc.createElement('span');notice.setAttribute('data-sm-card-unavailable',String(key||''));let reason='高亮尚未保存，或其位置/编辑权限暂无法可靠核验。';try{const parent=Zotero.Items.get(reader.itemID),native=Zotero.Items.getByLibraryAndKey(parent.libraryID,key);if(native&&native.annotationType!=='highlight'){const labels={note:'便笺',image:'区域/图像',underline:'下划线',ink:'手绘',text:'文本'};reason=(labels[native.annotationType]||'该批注类型')+'暂不支持关联；目前仅支持文字高亮。';}}catch{}notice.textContent='关联暂不可用：'+reason;notice.style.cssText='font:inherit;font-size:11px;white-space:normal';append(notice);return;}cardThumbnails?.mount({doc,reader,key,append,validate});cardMode.mount({doc,reader,key,append,validate:()=>validateCardReader(doc,reader,parentID,tabID,host,state)});}
  function sidebarProbeHeader(doc,reader,annotation,append){
    if(!compatibleHost())return;
    try{const target=quickTarget(reader,reader.itemID,annotation.id);
      const validate=()=>{
        if(stopped||!isolated()||!compatibleHost()||reader.itemID!==target.parentID||reader.tabID!==target.tabID||reader._window!==target.host||target.host.closed||target.host.Zotero_Tabs?.selectedID!==target.tabID||documents.get(target.doc)!==target.state||readerDocuments.get(target.doc)!==reader)throw Error('Reader identity changed or closed');
        const item=resolveHighlight(target.parentID,target.key);
        if(item.id!==target.itemID||JSON.stringify(customIdentity(target.parentID,item))!==JSON.stringify(target.identity))throw Error('Annotation identity changed');
      };
      sidebarProbe.mount({doc,reader,identity:{...target.identity,itemID:target.itemID,parentID:target.parentID,tabID:target.tabID},validate,append});
    }catch(e){sidebarProbe.record('HEADER_REJECTED',{parentID:reader.itemID},e.message);}
  }
  function sidebar({doc,reader,params,append}) {
    if(stopped||!isolated())return;
    wire(doc,reader);
    const annotation=params?.annotation;
    if(!annotation||typeof annotation.id!=='string')return;
    sidebarProbeHeader(doc,reader,annotation,append);
    for(const [node,badge] of [...badges])if(node.ownerDocument===doc&&node.dataset.smAnnotation===annotation.id){badge.dispose();badges.delete(node);}
    const parent=Zotero.Items.get(reader.itemID);guard(parent);
    // Resolve by native key within this PDF, not text or DOM position.
    const item=parent.getAnnotations().find(a=>!a.deleted&&a.key===annotation.id);
    if(!item)return;
    const linked=core.association(item.getTags(),item.key);if(!linked)return;
    for(const [node,badge] of [...badges])if(node.ownerDocument===doc&&node.dataset.smAnnotation===item.key){badge.dispose();badges.delete(node);}
    const badge=visual.create(doc,marker(linked.reactionID),{root,motion});
    badge.node.dataset.smPoc='reaction';badge.node.dataset.smAnnotation=item.key;badge.node.dataset.smReaction=linked.reactionID;badge.node.tabIndex=0;
    badges.set(badge.node,badge);append(badge.node);
  }
  function safe(handler, name) { return event => {diagnostic[name]++; try {handler(event);} catch(e) {diagnostic.errors.push(String(e) + '\n' + String(e.stack || '')); error(e);}}; }
  const onMenu=safe(annotationMenu,'menuEvents');
  const onToolbar = safe(toolbar, 'toolbarEvents'), onPopup = safe(popup, 'popupEvents'), onSidebar = safe(sidebar, 'sidebarEvents'),onCardHeader=safe(cardHeader,'sidebarEvents');
  return {
    async settleCardCommands(){await cardCommands?.drain();await linkRestorePending;await cardThumbnails?.settle();},async settleCardSelection(){await cardMode?.settleSelection();},
    diagnostics() { return JSON.parse(JSON.stringify({...diagnostic,pingOnly,pingLink:typeof SMPingLinkGate==='undefined'?{writeEnabled:false,reason:'GATE_UNAVAILABLE'}:{...SMPingLinkGate.runtime(),storeInstantiated:!!linkStore,productionAdapter:!!linkIO,command:linkCommand?.diagnostics()||null,minimalLinkPath:!!linkCommand,writeEnabled:cardMode?cardWriteScope():SMPingLinkGate.runtime().writeEnabled===true,restores:linkRestores.slice(),writePolicy:cardMode?'SYNTHETIC_OR_EXPLICIT_USER_ISOLATED':'GLOBAL_DENY_UNTIL_ASYNC_NATIVE_SCOPE_VERIFIED',io:linkIO?.diagnostics?.()||null,store:linkStore?.diagnostics()||null,nativeOrder:nativeOrder?.diagnostics()||null},cardAssociation:{mode:cardMode?.diagnostics()||null,commands:cardCommands?.diagnostics()||null,writeEnabled:cardWriteScope()},linkDryRun:linkMode?.diagnostics()||null,linkModeStatus:modeStatus?.diagnostics()||null,linkedList:linkedLists?.diagnostics()||null,cardThumbnails:cardThumbnails?.diagnostics()||null,legacyUnassign:legacyActions?.diagnostics()||null,media:{settings:soundPrefs.diagnostics(),store:mediaStore?.diagnostics()||null,player:mediaPlayer?.diagnostics()||null,temporary:transientPlayer?.diagnostics()||null,history:mediaMessages},retainedPing:{mode:retainedMode?.enabled()||false,store:retainedStore?.diagnostics()||null,view:retainedView?.diagnostics()||null},pingMaterials:pingMaterials.diagnostics(),pingShortcuts:{valid:pingShortcuts.load().valid,bindings:pingShortcuts.list(pingDefinitions()).length,capturing:!!pingShortcuts.capture,panels:[...customPanels.values()].map(p=>p.shortcutDiagnostics?.()||null)},transientPing:transientPing.diagnostics(),sidebarQuickProbe:sidebarProbe.diagnostics(),customMarkers:customStore?{assetSafety:customStore.io.safety?.diagnostics()||null,blocked:customStore.blocked,error:customStore.error,definitions:customStore.list().length,assignments:Object.keys(customStore.data.assignments).length,cache:customStore.cache.size,pending:customStore.pending.size,...customStore.stats}:null,performance:{...perf,listenersActive:perf.listenersAdded-perf.listenersRemoved},closedAudits,tagDiagnostics:[...tagDisplays.values()].map(display=>display.diagnostics()),pageDiagnostics:[...pageLayers.values()].map(layer=>layer.diagnostics()),positions:positions?{blocked:positions.blocked,error:positions.error}:null,resources:{userPanels:customPanels.size,developerPanels:developerPanels.size,documents:documents.size,nodes:nodes.size,effects:effects.size,wheels:wheels.size,sessions:sessions.size,badges:badges.size,fileReaders:fileReaders.size,tagDisplays:tagDisplays.size,pageLayers:pageLayers.size,pageIcons:[...pageLayers.values()].reduce((n,l)=>n+l.diagnostics().icons,0),stopped}})); },
    async start() {
      controller = new core.Controller(api);
      if(positionIO&&isolated()){positions=new SMPositions.Store(positionIO);await positions.ready;}
      if(customIO&&isolated()){customStore=new SMCustomMarkers.Store(customIO);await customStore.ready;if(mediaIO){mediaStore=new SMPingMedia.Store({io:mediaIO,catalog:customStore,document:()=>Zotero.getMainWindow()?.document,referenceState:async diagnostic=>{if(!retainedStore||retainedStore.closed)throw Error('AUDIO_V2_RETAINED_UNAVAILABLE');const state=await retainedStore.state();state.unavailable=retainedStore.blocked;if(diagnostic){try{if(linkStore){const before=await linkStore.ready(),after=await linkStore.current();if(before.raw!==after.raw)throw Error('LINK_CHANGED');state.linkRecords=before.value.links;state.linkStatus='STRUCTURE_VERIFIED_NOT_TARGET_REVALIDATED';}}catch(e){state.linkStatus=/RECOVERY|TEMP/.test(e.message)?'PENDING_RECOVERY':'UNVERIFIABLE';}}return state;},trace:mediaTrace});await mediaStore.ready;}if(retainedIO){retainedStore=new SMRetainedStore.Store({io:retainedIO,catalog:customStore});await retainedStore.ready;}}
      if(retainedStore&&linkIO&&typeof SMPingLinkStore!=='undefined'&&typeof SMPingLinkGeckoHost!=='undefined'){linkHost=SMPingLinkGeckoHost.create({retained:retainedStore,customStore,Zotero,guard:()=>{if(stopped||!isolated()||!compatibleHost())throw Error('LINK_HOST_SCOPE');}});linkCommand=SMPingLinkCommand.create({nativeOrder,host:linkHost});linkStore=new SMPingLinkStore.Store({io:linkIO,host:linkCommand.host,authorize:request=>SMPingLinkGate.authorize(request)&&linkCommand.authorize(request)});await restoreLinks();if(typeof SMPingCardCommands!=='undefined'){cardCommands=SMPingCardCommands.create({io:linkIO,host:linkHost,Store:SMPingLinkStore.Store,writeScope:cardWriteScope,requireExplicitUnlink:true});await linkStore.close();linkStore=cardCommands.store;if(runtime||cardWriteScope())retainedFacade=new Proxy(retainedStore,{get(target,name){if(name==='move'||name==='remove')return async(pingID,id,revision,positionOrGuard,moveGuard)=>{const moving=name==='move',check=moving?moveGuard:positionOrGuard;check();const record=target.get(pingID,id);if(!record||record.revision!==revision)throw Error('RETAINED_TARGET_CHANGED');const source={epoch:target.data.epoch,record};return cardCommands.submit({kind:moving?'MOVE':'DELETE',source,point:moving?positionOrGuard.pointPDF:null,fallback:moving?()=>target.move(pingID,id,revision,positionOrGuard,moveGuard):null}).finally(()=>{cardThumbnails?.refresh();linkedLists?.refresh();});};const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;}});}}
      if(cardCommands&&typeof SMPingLinkedList!=='undefined')linkedLists=SMPingLinkedList.create({read:()=>readCardSnapshot({emptyAllowed:true}),target:t=>linkHost.readAnnotation(t),name:id=>customStore.data.definitions[id]?.name,writeEnabled:()=>cardWriteScope(),ticket:async old=>{const s=await readCardSnapshot(),r=s.payload.records.find(r=>r.pingID===old.source.record.pingID&&r.libraryID===old.source.record.libraryID&&r.attachmentKey===old.source.record.attachmentKey);if(!r)throw Error('LIST_SOURCE_UNAVAILABLE');return cardCommands.inspectRelation({epoch:s.payload.epoch,record:r});},submit:spec=>cardCommands.submit(spec),changed:()=>{cardThumbnails?.refresh();linkedLists?.refresh();}});
      if(linkStore&&typeof SMPingCardThumbnails!=='undefined')cardThumbnails=SMPingCardThumbnails.create({readSnapshot:readCardSnapshot,readTarget:targetForCard,cover:(id,doc)=>customStore.prepare(id,(bytes,mime)=>SMCustomIO.decode(Zotero.getMainWindow().document,bytes,mime)),mediaReady:id=>!mediaStore?.blocked&&!!customStore.data.definitions[id],player:mediaPlayer,visible:(reader,doc)=>reader._internalReader?._state?.sidebarOpen===true&&reader._internalReader?._state?.sidebarView==='annotations'&&doc.body.classList.contains('sidebar-open'),observe:(doc,changed)=>{const observer=new doc.defaultView.MutationObserver(changed);observer.observe(doc.body,SMReaderOptions.observerOptions(doc.defaultView,{attributes:true,attributeFilter:['class']}));return ()=>observer.disconnect();}});
      associationController = new SMAssociation.Controller({resolve:resolveHighlight,
        transaction:fn=>{if(!isolated())throw Error('Use isolated profile');return Zotero.DB.executeTransaction(fn);},
        recover:item=>item.reload(['tags'],true)});
      if(!pingOnly)Zotero.Reader.registerEventListener('createAnnotationContextMenu',onMenu,ID);
      if(customStore&&legacyIO){legacyActions=SMLegacyMarkerUnassign.create({catalog:customStore,io:legacyIO,readTarget:SMLegacyMarkerNative.create(Zotero),authorize:async()=>{if(stopped||!isolated()||!userAuthorization)return false;await userAuthorization.refresh();return userAuthorization.allowed('LEGACY_UNASSIGN');}});await legacyActions.startup();}
      if(Zotero.Notifier?.registerObserver)notifierID=Zotero.Notifier.registerObserver({notify(event,type){if(!stopped){if(type==='item')readerUI?.refreshHeaders();cardThumbnails?.refresh();if(type==='tab'){linkedLists?.invalidate();cardMode?.cancel('TAB_CHANGED');linkMode?.cancel('TAB_CHANGED');mediaPlayer?.stopAll();transientPlayer?.stopAll();quickEpoch++;transientPing.invalidateAll('TAB_CHANGED');for(const [doc,reader] of readerDocuments){try{mountTransient(doc,reader,documents.get(doc)?.ownerDoc||doc);}catch{}}sidebarProbe.closeAll();}cancelEdits(type==='tab'?'PDF tab changed':'Annotation changed');refreshBadges();refreshPages();for(const display of tagDisplays.values())display.schedule();}}},['item','tab'],'scholarmarker-v025');
      Zotero.Reader.registerEventListener('renderToolbar', onToolbar, ID);
      if(!pingOnly||cardMode)Zotero.Reader.registerEventListener('renderSidebarAnnotationHeader', pingOnly&&cardMode?onCardHeader:onSidebar, ID);
      if(legacy())Zotero.Reader.registerEventListener('renderTextSelectionPopup', onPopup, ID);
      Zotero.debug('ScholarMarker POC loaded; isolated=' + isolated());
    },
    async stop() {
      linkedLists?.stop();await linkedLists?.settle();legacyActions?.stop();cardThumbnails?.stop();await cardThumbnails?.settle();cardMode?.stop();if(cardCommands)await cardCommands.close();stopped = true;linkMode?.stop();nativeOrder?.stop();modeStatus?.stop();mediaPlayer?.dispose();transientPlayer?.dispose();retainedView?.stop();pdfSizes.close();animationPreferences.close();pingShortcuts.stop();transientPing.stop();pingMaterials.stop();quickActions.close();sidebarProbe.dispose();
      Zotero.Reader.unregisterEventListener('createAnnotationContextMenu',onMenu);
      if(notifierID!==undefined)Zotero.Notifier.unregisterObserver(notifierID);
      Zotero.Reader.unregisterEventListener('renderToolbar', onToolbar);
      Zotero.Reader.unregisterEventListener('renderSidebarAnnotationHeader', onSidebar);Zotero.Reader.unregisterEventListener('renderSidebarAnnotationHeader', onCardHeader);
      Zotero.Reader.unregisterEventListener('renderTextSelectionPopup', onPopup);
      for (const doc of [...documents.keys()]) disposeDocument(doc);
      for (const node of nodes) node.remove(); nodes.clear();
      await markerTail;await retainedView?.drain();linkCommand?.close();if(linkRestorePending)await linkRestorePending;if(linkStore)await linkStore.close();linkHost?.close();linkIO?.close?.();if(retainedStore)await retainedStore.close();if(mediaStore)await mediaStore.close();if(customStore)await customStore.close();
      if(positions)await positions.close();
      await associationController.close();
      await controller.close();
    }
  };
};
