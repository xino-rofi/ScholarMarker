/* Stage A only: owned UI and structural diagnostics. No Store, asset or native write APIs. */
(function(scope){
 'use strict';
 function placement(anchor,viewport,card=null){
  const finite=r=>r&&['left','top','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>0&&r.height>0;
  if(!finite(anchor)||!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||viewport.width<80||viewport.height<80||anchor.left+anchor.width<=0||anchor.top+anchor.height<=0||anchor.left>=viewport.width||anchor.top>=viewport.height)throw Error('LAYOUT_INVALID_ANCHOR');
  const width=Math.min(320,viewport.width-16,Math.max(180,(finite(card)?card.width:280)-16));
  const left=Math.max(8,Math.min(finite(card)?card.left+8:anchor.left+anchor.width-width,viewport.width-width-8));
  return {left,width,maxHeight:viewport.height-16,anchorTop:anchor.top,below:anchor.top+anchor.height+6,viewportHeight:viewport.height};
 }
 function create(){
  const entries=new Set(),opened=new Map(),history=[],readerIDs=new WeakMap(),docIDs=new WeakMap();let generation=0,nextReader=0,nextDoc=0;
  const stats={mounts:0,replacements:0,disposed:0,listenersAdded:0,listenersRemoved:0,sweepCalls:0,nodesChecked:0,assetReads:0,cacheHits:0};let stopped=false;
  function record(code,identity={},reason=''){history.push({code,...identity,reason:String(reason).slice(0,300)});if(history.length>64)history.shift();}
  function event(code,e,extra={}){record(code,{...e.identity,readerID:e.readerID,docID:e.docID,generation:e.generation,connected:!!e.root.isConnected,contentExists:!!e.bar,expanded:!e.bar.hidden,nodes:entries.size,listeners:stats.listenersAdded-stats.listenersRemoved,openBars:opened.size,...extra});}
  function visibility(e){try{const rect=e.bar.getBoundingClientRect?.(),view=e.doc.defaultView,css=view?.getComputedStyle?.(e.bar);let parent=e.bar,ancestorHidden=false,overflowAncestor=false;for(let i=0;parent&&i<8;i++,parent=parent.parentElement){const s=view?.getComputedStyle?.(parent);if(s){ancestorHidden ||= s.display==='none'||s.visibility==='hidden';overflowAncestor ||= ['hidden','clip','auto','scroll'].includes(s.overflow)||['hidden','clip','auto','scroll'].includes(s.overflowY);}}return {measured:!!rect,width:rect?Math.round(rect.width):null,height:rect?Math.round(rect.height):null,cssHidden:!!css&&(css.display==='none'||css.visibility==='hidden'),ancestorHidden,overflowAncestor};}catch{return {measured:false,measurementFailed:true};}}
  function collapse(e,focus=false){event('COLLAPSE_REQUESTED',e);e.bar.hidden=true;if(e.bar.parentNode===e.doc.body||e.bar.parent===e.doc.body)e.bar.remove();e.button.setAttribute('aria-expanded','false');if(opened.get(e.reader)===e)opened.delete(e.reader);if(focus&&e.root.isConnected)e.button.focus?.();}
  function dispose(e,reason='CLEANUP'){if(!entries.has(e))return;collapse(e);for(const [type,fn] of e.listeners){e.root.removeEventListener(type,fn);stats.listenersRemoved++;}e.root.remove();entries.delete(e);stats.disposed++;event('DISPOSE',e,{cleanupReason:reason});}
  function mount({doc,reader,identity,validate,append}){
   if(stopped)return;validate();
   let restore=false,restoreFocus=false;
   for(const e of [...entries])if(e.doc===doc&&e.reader===reader&&e.identity.annotationKey===identity.annotationKey){event('RERENDER',e);restore=opened.get(reader)===e&&!e.root.isConnected&&JSON.stringify(e.identity)===JSON.stringify(identity);restoreFocus=restore&&!!e.root.contains?.(doc.activeElement);stats.replacements++;event('ROOT_REPLACED',e);dispose(e,'RENDER_REPLACEMENT');}
   if(entries.size>=128){record('CAPACITY_REJECTED',identity);return;}
   const root=doc.createElement('span');root.dataset.smSidebarProbe='true';root.dataset.smAnnotation=identity.annotationKey;
   const style=doc.createElement('style');style.textContent='[data-sm-sidebar-probe]{display:inline-flex;align-items:center;margin-inline:3px;font:inherit}[data-sm-sidebar-probe] button{font:inherit;font-size:11px;line-height:1.4;padding:1px 5px;border:1px solid #bdc9bf;border-radius:5px;background:#f7f6f1;color:#28543e;cursor:pointer}[data-sm-sidebar-probe] button:focus-visible{outline:2px solid #397552}[data-sm-sidebar-probe] [hidden],[data-sm-sidebar-layer][hidden]{display:none!important}[data-sm-sidebar-layer]{display:block;position:fixed;box-sizing:border-box;white-space:normal;word-break:normal;overflow-wrap:break-word;overflow:auto;line-height:1.5;padding:8px;border:1px solid #bdc9bf;border-radius:6px;background:#f7f6f1;color:#28543e;font:inherit;font-size:12px;pointer-events:none}';
   const button=doc.createElement('button');button.type='button';button.textContent='SM';button.title='侧栏快捷表情入口验证（只读）';button.setAttribute('aria-label','展开侧栏入口验证栏');button.setAttribute('aria-expanded','false');
   const bar=doc.createElement('span');bar.className='sm-probe-bar';bar.hidden=true;bar.setAttribute('role','status');bar.textContent='侧栏入口验证成功 · 此版本暂不添加表情（暂不关联）';root.append(style,button,bar);
   if(!readerIDs.has(reader))readerIDs.set(reader,++nextReader);if(!docIDs.has(doc))docIDs.set(doc,++nextDoc);
   const e={doc,reader,identity,validate,root,button,bar,listeners:[],generation:++generation,readerID:readerIDs.get(reader),docID:docIDs.get(doc)};
   bar.dataset.smSidebarLayer=String(e.generation);
   function expand(restored=false){event('EXPAND_REQUESTED',e,{restored});const old=opened.get(reader);if(old&&old!==e)collapse(old);
    try{validate();const view=doc.defaultView,viewport={width:doc.documentElement?.clientWidth||view?.innerWidth,height:doc.documentElement?.clientHeight||view?.innerHeight},anchor=button.getBoundingClientRect();let card=null;const nativeCard=button.closest?.('[data-sidebar-annotation-id]');if(typeof button.closest==='function'&&(!nativeCard||nativeCard.getAttribute('data-sidebar-annotation-id')!==identity.annotationKey||!nativeCard.contains(button)))throw Error('LAYOUT_CARD_IDENTITY');if(nativeCard)card=nativeCard.getBoundingClientRect();
      const p=placement(anchor,viewport,card);bar.style.left=p.left+'px';bar.style.width=p.width+'px';bar.style.maxHeight=p.maxHeight+'px';bar.style.top='8px';bar.style.zIndex='10';doc.body.append(bar);bar.hidden=false;
      const height=bar.getBoundingClientRect().height;if(!Number.isFinite(height)||height<0)throw Error('LAYOUT_INVALID_SIZE');const top=p.below+height<=viewport.height-8?p.below:Math.max(8,Math.min(p.anchorTop-height-6,viewport.height-height-8));bar.style.top=top+'px';button.setAttribute('aria-expanded','true');opened.set(reader,e);const visible=visibility(e);event('EXPAND_COMMITTED',e,{restored,...visible,portal:true,layoutWidth:p.width,layoutTop:top});if(visible.cssHidden||visible.ancestorHidden||(visible.measured&&(!visible.width||!visible.height)))event('CONTENT_HIDDEN',e,visible);
    }catch(error){event('LAYOUT_REJECTED',e,{failure:String(error.message).slice(0,100)});collapse(e);}
   }
   function toggle(){if(stopped||!entries.has(e)||!root.isConnected)return;try{validate();}catch(error){record('TARGET_INVALID',identity,error.message);event('ERROR',e,{failure:'TARGET_INVALID'});dispose(e,'INVALID_TARGET');return;}if(opened.get(reader)===e){collapse(e);return;}expand();}
   const click=received=>{let matches=false;try{matches=typeof button.isSameNode==='function'?button.isSameNode(received.target):received.target===button;}catch{}event('CLICK_RECEIVED',e,{phase:received.eventPhase||0,targetMatches:matches,wrapperEquality:received.target===button});if(matches){received.stopPropagation();toggle();}};
   const key=event=>{if(event.key==='Escape'&&opened.get(reader)===e){event.preventDefault();event.stopPropagation();collapse(e,true);}};
   // Keep native header drag initiation out of the button; no native state is rewritten.
   const drag=event=>{event.preventDefault();event.stopPropagation();};
   for(const [type,fn] of [['click',click],['keydown',key],['dragstart',drag]]){root.addEventListener(type,fn);e.listeners.push([type,fn]);stats.listenersAdded++;}
   entries.add(e);try{append(root);stats.mounts++;event('MOUNT',e);if(restore){validate();expand(true);if(restoreFocus)button.focus?.();}}catch(error){event('ERROR',e,{failure:'MOUNT_OR_RESTORE'});dispose(e,'APPEND_OR_VALIDATE_FAILURE');throw error;}
  }
  function sweep(doc){stats.sweepCalls++;for(const e of [...entries])if(e.doc===doc){stats.nodesChecked++;if(!e.root.isConnected){event('NODE_DISCONNECTED',e);dispose(e,'DISCONNECTED');}else if(!e.bar.hidden&&!e.bar.isConnected){event('LAYER_DISCONNECTED',e);collapse(e);}}}
  function closeReader(reader){const e=opened.get(reader);if(e)collapse(e);}
  function closeAll(){for(const e of [...opened.values()])collapse(e);}
  function disposeDocument(doc){for(const e of [...entries])if(e.doc===doc)dispose(e);}
  function diagnostics(){return {...stats,nodes:entries.size,layerNodes:[...entries].filter(e=>!e.bar.hidden&&e.bar.isConnected).length,listenersActive:stats.listenersAdded-stats.listenersRemoved,openBars:opened.size,history:history.slice(),stopped};}
  return {mount,sweep,closeReader,closeAll,disposeDocument,record,diagnostics,dispose(){stopped=true;for(const e of [...entries])dispose(e);}};
 }
 const api={create,placement};if(typeof module!=='undefined')module.exports=api;else scope.SMSidebarQuickProbe=api;
})(this);
