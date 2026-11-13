/* Zotero 10.0.7 scoped display adapter. No native data write capability. */
(function(scope){
 'use strict';
 let sequence=0;
 const ATTR='data-sm-tech-hidden';
 function recognized(core,record){
  const tags=record.tags, key=record.key;
  if(record.type!=='highlight'||!/^[A-Z0-9]{8}$/.test(key)||!Array.isArray(tags))return new Set();
  const names=tags.map(t=>t.tag??t.name);
  if(names.some(n=>typeof n!=='string'))return new Set();
  const link=core.association(tags,key);
  if(!link||!['smile','wow'].includes(link.reactionID))return new Set();
  const expected=[core.PREFIX+'id:'+key,core.PREFIX+'reaction:'+link.reactionID];
  const technical=names.filter(n=>n.startsWith('scholarmarker:'));
  if(technical.length!==2||expected.some(n=>technical.filter(x=>x===n).length!==1))return new Set();
  return new Set(expected);
 }
 function project(core,records){
  const cards=new Map();
  for(const record of records){
   if(cards.has(record.key))throw Error('Duplicate annotation identity');
   const owned=recognized(core,record);cards.set(record.key,{record,owned});
  }
  return {cards};
 }
 function create({doc,root,core,read,valid=()=>true,options,log=()=>{}}){
  const win=doc.defaultView,token='sm-tags-'+(++sequence),marked=new Set();
  let stopped=false,raf=null,refreshes=0,hidden=0,full=true;const dirty=new Set();
  const counts={observerCallbackCount:0,tagRefreshRequested:0,tagRefreshExecuted:0,nodesScanned:0,nodesChanged:0,observerInstanceCount:1,totalMs:0,maxMs:0};
  const now=()=>win.performance?.now?.()??Date.now();
  const within=(node,ancestor)=>{for(let n=node;n;n=n.parentNode)if(n===ancestor)return true;return false;};
  const style=doc.createElement('style');
  style.textContent='#sidebarContainer #annotationsView ['+ATTR+'="'+token+'"]{display:none!important}';
  doc.head.append(style);
  function clear(){for(const n of marked)if(n.getAttribute(ATTR)===token)n.removeAttribute(ATTR);marked.clear();hidden=0;}
  function refresh(){
   raf=null;if(stopped)return;const start=now(),all=full,changed=[...dirty];full=false;dirty.clear();
   const desired=all?new Set():new Set([...marked].filter(n=>n.isConnected&&!changed.some(c=>within(n,c))));refreshes++;counts.tagRefreshExecuted++;
   try{
    if(!root.isConnected||doc.getElementById('sidebarContainer')!==root||!valid())throw Error('Reader identity unavailable');
    const view=root.querySelector('#annotationsView'),annotations=view?.querySelector('#annotations');
    if(!view||!annotations)throw Error('Annotations structure unavailable');
    const p=project(core,read());
    const cards=all?annotations.querySelectorAll('.annotation[data-sidebar-annotation-id]'):changed.filter(c=>c.isConnected&&within(c,annotations));
    log('TAG_REFRESH',{cards:cards.length,records:p.cards.size});
    for(const card of cards){
     counts.nodesScanned++;
     const key=card.getAttribute('data-sidebar-annotation-id'),entry=p.cards.get(key);
     if(!entry?.owned.size){log('TAG_CARD_SKIPPED',{key,reason:entry?'NO_CONFIRMED_V1_PAIR':'KEY_NOT_IN_PDF'});continue;}
     const previews=[...card.children].filter(n=>n.classList.contains('preview'));if(previews.length!==1){log('TAG_CARD_SKIPPED',{key,reason:'PREVIEW_STRUCTURE'});continue;}
     const buttons=[...previews[0].children].filter(n=>n.localName==='button'&&n.classList.contains('tags'));if(buttons.length!==1){log('TAG_CARD_SKIPPED',{key,reason:'TAGS_BUTTON_STRUCTURE'});continue;}
     const button=buttons[0],spans=[...button.children];
     const names=entry.record.tags.map(t=>t.tag??t.name).sort();
     if(spans.length!==names.length||spans.some(n=>n.localName!=='span'||!n.classList.contains('tag')||n.children.length)||
        JSON.stringify(spans.map(n=>n.textContent).sort())!==JSON.stringify(names)){log('TAG_CARD_SKIPPED',{key,reason:'DOM_TAGS_MISMATCH',domCount:spans.length,nativeCount:names.length});continue;}
     for(const span of spans)if(entry.owned.has(span.textContent))desired.add(span);
    }
    for(const node of [...marked])if(!desired.has(node)){if(node.getAttribute(ATTR)===token){node.removeAttribute(ATTR);counts.nodesChanged++;}marked.delete(node);}
    for(const node of desired)if(!node.hasAttribute(ATTR)||node.getAttribute(ATTR)===token){if(node.getAttribute(ATTR)!==token){node.setAttribute(ATTR,token);counts.nodesChanged++;}marked.add(node);}
    hidden=marked.size;
    let verified=0,failed=0;
    if(typeof win.getComputedStyle==='function')for(const node of marked){if(win.getComputedStyle(node).display==='none')verified++;else failed++;}
    log('TAG_STYLE_RESULT',{marked:hidden,verified,failed,styleConnected:style.isConnected,computedStyleAvailable:typeof win.getComputedStyle==='function'});
   }catch(e){clear();log('TAG_DISPLAY_SKIPPED',{reason:String(e.message)});}
   const elapsed=now()-start;counts.totalMs+=elapsed;counts.maxMs=Math.max(counts.maxMs,elapsed);
  }
  function request(){counts.tagRefreshRequested++;if(!stopped&&raf===null)raf=win.requestAnimationFrame(refresh);}
  function schedule(){full=true;request();}
  function mutation(changes){
   counts.observerCallbackCount++;if(stopped)return;if(!changes){schedule();return;}
   let relevant=false;
   const ancestor=(n,predicate)=>{for(;n&&n!==root;n=n.parentNode)if(predicate(n))return n;return null;};
   const isCard=n=>n.classList?.contains('annotation')&&n.hasAttribute('data-sidebar-annotation-id');
   const isTag=n=>n.localName==='button'&&n.classList?.contains('tags');
   for(const c of changes){
    const button=ancestor(c.target,isTag),card=ancestor(c.target,isCard);
    if(button||c.type==='attributes'&&card){if(card)dirty.add(card);relevant=true;continue;}
    if(c.type==='childList')for(const n of [...c.addedNodes,...c.removedNodes]){
     if(isCard(n)){dirty.add(n);relevant=true;}
     for(const child of n.querySelectorAll?.('.annotation[data-sidebar-annotation-id]')||[]){dirty.add(child);relevant=true;}
     if(isTag(n)&&card){dirty.add(card);relevant=true;}
     if(card&&n.querySelector?.('button.tags')){dirty.add(card);relevant=true;}
    }
   }
   if(relevant)request();
  }
  let observer;
  try{
    observer=new win.MutationObserver(mutation);
    observer.observe(root,options({subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-sidebar-annotation-id']}));
  }catch(e){observer?.disconnect();style.remove();throw e;}
  schedule();
  return {root,schedule,diagnostics:()=>({hidden,refreshes,...counts,pending:raf!==null,stopped}),dispose(){if(stopped)return;stopped=true;if(raf!==null)win.cancelAnimationFrame(raf);raf=null;observer.disconnect();counts.observerInstanceCount=0;dirty.clear();clear();style.remove();}};
 }
 const api={recognized,project,create};if(typeof module!=='undefined')module.exports=api;else scope.SMTagDisplay=api;
})(this);
