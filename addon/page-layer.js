/* Own DOM only; annotation access is supplied as a read-only projection. */
(function(scope){
 'use strict';
 function create({doc,itemID,version,records,association,geometry,adapter,positions=null,drag=scope.SMPageDrag,feedback=()=>{},log=()=>{},options=spec=>spec,controllerID=null}){
  const win=doc.defaultView,viewer=doc.getElementById('viewer');
  if(!viewer||(version!=='10.0.7'&&version!=='10.0.8')||!win.MutationObserver||!win.ResizeObserver||!win.requestAnimationFrame)throw Error('Page overlay prerequisites unavailable');
  if(viewer.querySelectorAll('[data-sm-annotation]').length)throw Error('Unowned existing SM page nodes; close Reader or restart before mounting');
  let stopped=false,raf=null,editing=null,resize,observer;const pages=new Map(),listeners=[],observed=new Set(),counts={},preferred=new Map();let retryBudget=2,refreshes=0,lastTrigger='INITIAL',requested=0,observerCallbackCount=0,listenersAdded=0,listenersRemoved=0;
  const report=(code,detail={})=>{counts[code]=(counts[code]||0)+1;log('DIAGNOSTIC '+JSON.stringify({code,itemID,refresh:refreshes,trigger:lastTrigger,...detail}));};
  const listen=(target,event,fn,capture=false)=>{target.addEventListener(event,fn,capture);listenersAdded++;listeners.push(()=>{target.removeEventListener(event,fn,capture);listenersRemoved++;});};
  const own=node=>!!node?.closest?.('[data-sm-page-layer]');
  function cancelEdit(reason='Adjustment cancelled'){editing?.cancel(reason);editing=null;}
  function validateEdit(reason){if(!editing)return;try{editing.check();}catch(e){cancelEdit(reason+': '+e.message);}}
  function clear(page){const state=pages.get(page);if(state){state.layer.remove();pages.delete(page);}}
  function refresh(){
   if(stopped)return;refreshes++;let transientFailure=false;
   if(editing){validateEdit('Page refresh');if(editing){report('DRAG_REFRESH_DEFERRED',{reason:'Same node and verified geometry retained'});return;}}
   const current=new Set(viewer.querySelectorAll('.page[data-page-number]'));
   for(const page of pages.keys())if(!current.has(page)||!page.isConnected)clear(page);
   for(const page of [...observed])if(!current.has(page)||!page.isConnected){resize.unobserve(page);observed.delete(page);}
   for(const page of current)if(!observed.has(page)){resize.observe(page);observed.add(page);}
   let items;
   try{items=records();}catch(e){for(const p of [...pages.keys()])clear(p);report('RECORDS_UNAVAILABLE',{reason:e.message});return;}
   const dedup=new Map();for(const item of items)if(!item.deleted&&item.type==='highlight')dedup.set(item.key,item);
   const validPreferences=new Set([...dedup.values()].map(item=>item.position?.pageIndex+':'+item.key));for(const key of preferred.keys())if(!validPreferences.has(key))preferred.delete(key);
   report('PAGE_REFRESH',{pageCount:current.size,highlightCount:dedup.size});
   for(const page of current){
    try{
     const pageIndex=Number(page.getAttribute('data-page-number'))-1;if(!Number.isInteger(pageIndex)||pageIndex<0)throw Error('Invalid page number');
     const meta=adapter.read(doc,page,pageIndex,version),all=[...(meta.textRects||[])],candidates=[];
     for(const item of [...dedup.values()].sort((a,b)=>a.key.localeCompare(b.key))){
      if(item.position?.pageIndex!==pageIndex)continue;
      let boxes;try{boxes=geometry.rects(item.position,meta);if(!boxes.length)throw Error('No valid visible rects');}catch{report('INVALID_GEOMETRY',{key:item.key,pageIndex,reason:'Unsupported annotation rects'});continue;}all.push(...boxes);
      const link=association(item.tags||[],item.key,item.identity);if(link){report('CANDIDATE_GENERATED',{key:item.key,pageIndex,marker:link.reactionID});candidates.push({item,link,boxes});}else report('NO_SM_ASSOCIATION',{key:item.key,pageIndex});
     }
     const wanted=new Map(),occupied=all.slice((meta.textRects||[]).length);
     for(const {item,link,boxes} of candidates){try{let override=null;
      try{if(positions&&item.identity)override=positions.get(item.identity,pageIndex);}catch(e){report('POSITION_STORAGE_ERROR',{key:item.key,pageIndex,reason:e.message});continue;}
      const candidateKey=pageIndex+':'+item.key;
      const a=override?geometry.manual(item.position,meta,override.offsetPDF):geometry.automatic(item.position,meta,occupied,trace=>report('CANDIDATE_DECISION',{key:item.key,...trace}),{hard:occupied,soft:meta.textRects||[],preferred:preferred.get(candidateKey)});
      if(!override&&a)preferred.set(candidateKey,a.candidateId);
      if(a){wanted.set(item.key,{...a,marker:link.reactionID,image:link.image||null,item,meta});occupied.push([a.left,a.top,a.left+a.size,a.top+a.size]);}else report(override?'MANUAL_POSITION_OUT_OF_BOUNDS':'ALL_CANDIDATES_REJECTED',{key:item.key,pageIndex});
      }catch(e){report('INVALID_GEOMETRY',{key:item.key,pageIndex,reason:e.message});}
     }
     if(!wanted.size){clear(page);continue;}
     let state=pages.get(page);
     if(!state){const layer=doc.createElement('div');layer.dataset.smPageLayer='true';layer.dataset.smItem=String(itemID);layer.dataset.smPage=String(pageIndex);layer.setAttribute('aria-hidden','true');layer.style.cssText='position:absolute;inset:0;pointer-events:none;user-select:none;z-index:10;overflow:hidden;';page.append(layer);state={layer,nodes:new Map()};pages.set(page,state);}
     state.entries=wanted;
     for(const [key,node] of state.nodes)if(!wanted.has(key)){node.remove();state.nodes.delete(key);}
     for(const [key,a] of wanted){let node=state.nodes.get(key);if(!node){node=doc.createElement('span');node.dataset.smAnnotation=key;node.dataset.smController=String(controllerID);node.dataset.smLibrary=String(a.item.identity?.libraryID??'');node.dataset.smAttachment=String(a.item.identity?.attachmentKey??'');state.layer.append(node);state.nodes.set(key,node);}const text=a.marker==='smile'?'😄':a.marker==='wow'?'😮':'';if(a.image){let img=node.children[0];if(!img){node.textContent='';img=doc.createElement('img');img.width=18;img.height=18;img.draggable=false;img.alt='Custom Marker';img.style.cssText='width:18px;height:18px;object-fit:contain;pointer-events:none;user-select:none;';img.onerror=()=>{node.style.visibility='hidden';};node.append(img);}if(img.getAttribute('src')!==a.image)img.setAttribute('src',a.image);}else if(node.textContent!==text)node.textContent=text;node.style.cssText='position:absolute;pointer-events:none;user-select:none;line-height:1;width:18px;height:18px;font-size:18px;left:'+a.left+'px;top:'+a.top+'px;';log('anchor '+JSON.stringify({itemID,key,pageIndex,marker:a.marker,left:a.left,top:a.top,width:meta.width,height:meta.height,matrix:meta.matrix}));}
    }catch(e){clear(page);if(e.transient)transientFailure=true;report(e.code||'INVALID_GEOMETRY',{pageIndex:Number(page.getAttribute('data-page-number'))-1,reason:e.message});}
   }
   if(transientFailure){if(retryBudget>0){retryBudget--;schedule('RETRY');}else report('LIFECYCLE_NOT_REFRESHED',{reason:'Bounded retry exhausted; awaiting external lifecycle signal'});}
  }
  function adjust(key){
   if(stopped||!positions||!drag)return false;if(raf!==null){win.cancelAnimationFrame(raf);raf=null;}refresh();
   for(const [page,state] of pages){const entry=state.entries?.get(key),node=state.nodes.get(key);if(!entry||!node||!entry.item.identity)continue;
    const captured=JSON.stringify(entry.item.position),id=JSON.stringify(entry.item.identity);let session;
    const valid=()=>{if(stopped||!page.isConnected||!node.isConnected)return false;try{const item=records().find(a=>a.key===key&&JSON.stringify(a.identity)===id);return !!item&&JSON.stringify(item.position)===captured&&association(item.tags||[],key,item.identity)?.reactionID===entry.marker;}catch{return false;}};
    const mappedNodes=[...pages.values()].filter(s=>s.nodes.get(key)?.isConnected).length;
    const domNodes=[...viewer.querySelectorAll('[data-sm-annotation]')].filter(n=>n.dataset?.smAnnotation===key).length;
    session=drag.begin({node,page,doc,log,audit:{mappedNodes,domNodes,samePageKeys:[...state.nodes.keys()].slice(0,16)},meta:entry.meta,position:entry.item.position,identity:entry.item.identity,geometry,adapter,version,valid,
     save:(identity,value,guard)=>positions.update(identity,value,guard),feedback:message=>{if(editing===session)editing=null;feedback(message);schedule();}});
    editing=session;return true;
   }report('ADJUST_NOT_AVAILABLE',{key,reason:'No verified displayed target; no guessed temporary node'});return false;
  }
  function schedule(reason='EXTERNAL'){requested++;reason=typeof reason==='string'?reason:reason?.type||'EXTERNAL';if(reason!=='RETRY'){retryBudget=2;lastTrigger=reason;}if(!stopped&&raf===null)raf=win.requestAnimationFrame(()=>{raf=null;refresh();});}
  try{
   resize=new win.ResizeObserver(()=>{if(stopped)return;validateEdit('Page resized');schedule();});resize.observe(viewer);
   observer=new win.MutationObserver(changes=>{observerCallbackCount++;if(!stopped&&changes.some(c=>!own(c.target)&&(!(c.type==='childList')||[...c.addedNodes,...c.removedNodes].some(n=>!own(n))))){validateEdit('Page DOM changed');schedule();}});
   observer.observe(viewer,options({subtree:true,childList:true,attributes:true,attributeFilter:['style','class','data-loaded','data-page-number','data-main-rotation']}));
  }catch(e){dispose();throw e;}
  function dispose(){if(stopped)return;cancelEdit('Reader closed');report('LAYER_DISPOSED',{totals:{...counts}});stopped=true;if(raf!==null)win.cancelAnimationFrame(raf);raf=null;observer?.disconnect();resize?.disconnect();observed.clear();listeners.forEach(f=>f());for(const {layer} of pages.values())layer.remove();pages.clear();preferred.clear();}
  listen(doc,'wheel',e=>{if(e.ctrlKey)schedule('CTRL_WHEEL');},true);listen(doc,'scroll',schedule,true);listen(win,'resize',schedule);listen(win,'pagehide',dispose);listen(doc,'visibilitychange',schedule);
  schedule();return {schedule,dispose,adjust,cancelEdit,diagnostics:()=>({controllerID,itemID,refreshes,requested,observerCallbackCount,observerInstanceCount:stopped?0:2,listenersAdded,listenersRemoved,listenersActive:listenersAdded-listenersRemoved,lastTrigger,counts:{...counts},observed:observed.size,pages:pages.size,icons:[...pages.values()].reduce((n,s)=>n+s.nodes.size,0),identityNodes:[...pages.values()].flatMap(s=>[...s.entries||[]].map(([key,a])=>({...a.item.identity,key,count:[...viewer.querySelectorAll('[data-sm-annotation]')].filter(n=>n.dataset.smAnnotation===key).length,dragTarget:s.nodes.get(key)===editing?.node}))).slice(0,40),pending:raf!==null,editing:!!editing,stopped})};
 }
 const api={create};if(typeof module!=='undefined')module.exports=api;else scope.SMPageLayer=api;
})(this);
