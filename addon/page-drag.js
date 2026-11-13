/* Pointer events only on the selected emoji; no native annotation mutations. */
(function(scope){
 'use strict';let generation=0;
 function begin({node,page,doc,meta,position,identity,geometry,adapter,version,save,valid,feedback=()=>{},log=()=>{},audit={}}){
  const win=doc.defaultView,events=[],oldStyle=node.style.cssText;
  const signature=m=>JSON.stringify([m.pageIndex,m.width,m.height,m.matrix,m.cropBox]);
  const initial=signature(meta),anchor=geometry.pdfAnchor(position),initialRect=page.getBoundingClientRect();
  let phase='ready',pointer=null,start=null,center=null,cancelled=false;const session=++generation,handled=new WeakSet(),counts={};
  function emit(code,e=null,detail={}){counts[code]=(counts[code]||0)+1;if(['DRAG_POINTER_MOVE','DRAG_PREVIEW_UPDATED'].includes(code)&&counts[code]>3&&counts[code]%10!==0)return;log('DRAG_EVENT '+JSON.stringify({session,code,key:identity.annotationKey,libraryID:identity.libraryID,attachmentKey:identity.attachmentKey,pageIndex:meta.pageIndex,pointerId:e?.pointerId??pointer,phase,eventPhase:e?.eventPhase??null,targetOwned:e?owns(e):null,...detail}));}
  function owns(e){return e.target===node||!!node.contains?.(e.target)||!!e.composedPath?.().includes(node);}
  function once(e,fn){if(handled.has(e))return;handled.add(e);return fn(e);}
  function computed(target){try{const style=win.getComputedStyle(target);return {pointerEvents:style.pointerEvents||null,cursor:style.cursor||null,left:style.left||null,top:style.top||null};}catch{return {};}}
  const on=(target,type,fn,capture=false)=>{target.addEventListener(type,fn,capture);events.push(()=>target.removeEventListener(type,fn,capture));};
  function check(){if(cancelled||!node.isConnected||!page.isConnected||doc.hidden||!valid())throw Error('Adjustment expired');const now=adapter.read(doc,page,meta.pageIndex,version),r=page.getBoundingClientRect();if(signature(now)!==initial||r.left!==initialRect.left||r.top!==initialRect.top)throw Error('Page zoom, rotation or layout changed');return now;}
  function release(){if(pointer!==null){try{if(node.hasPointerCapture?.(pointer))node.releasePointerCapture(pointer);}catch{}pointer=null;}}
  function cleanup(){events.splice(0).forEach(f=>f());release();delete node.dataset.smDragTarget;}
  function cancel(reason='Cancelled',event=null){if(cancelled||phase==='done')return;emit('DRAG_CANCELLED',event,{reason,from:phase,counts:{...counts}});cancelled=true;phase='cancelled';cleanup();node.style.cssText=oldStyle;feedback(reason);}
  const down=e=>{
   emit('DRAG_POINTER_DOWN',e,{connected:node.isConnected,computed:computed(node),defaultPrevented:e.defaultPrevented});
   if(phase!=='ready'||e.button!==0||e.isPrimary===false)return;
   try{check();if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))throw Error('Invalid pointer');
    e.preventDefault();e.stopPropagation();pointer=e.pointerId;node.setPointerCapture(pointer);if(!node.hasPointerCapture(pointer))throw Error('Pointer capture not acquired');emit('DRAG_CAPTURE_ACQUIRED',e);start=[e.clientX,e.clientY];center=[parseFloat(node.style.left)+9,parseFloat(node.style.top)+9];
    // CSS mocks and native CSSStyleDeclaration both expose the rendered coordinates.
    if(!center.every(Number.isFinite)){const match=/left:([\d.e+-]+)px;top:([\d.e+-]+)px/.exec(oldStyle);if(!match)throw Error('Icon position unavailable');center=[Number(match[1])+9,Number(match[2])+9];}
    phase='dragging';node.style.cursor='grabbing';
   }catch(error){cancel(error.message);}
  };
  on(node,'pointerdown',e=>once(e,down));
  let preview=null;
  const move=e=>{if(phase!=='dragging'||e.pointerId!==pointer)return;emit('DRAG_POINTER_MOVE',e,{captureOwned:node.hasPointerCapture(pointer)});try{check();if(!node.hasPointerCapture(pointer)){emit('DRAG_CAPTURE_LOST',e,{reason:'Capture no longer held'});throw Error('Pointer capture lost');}if(![e.clientX,e.clientY].every(Number.isFinite))throw Error('Invalid pointer');e.preventDefault();e.stopPropagation();preview=[Math.max(9,Math.min(meta.width-9,center[0]+e.clientX-start[0])),Math.max(9,Math.min(meta.height-9,center[1]+e.clientY-start[1]))];node.style.left=preview[0]-9+'px';node.style.top=preview[1]-9+'px';const css=computed(node);const update={left:preview[0]-9,top:preview[1]-9,inlineLeft:node.style.left,inlineTop:node.style.top,computed:css};if((Number.isFinite(parseFloat(css.left))&&Math.abs(parseFloat(css.left)-(preview[0]-9))>1)||(Number.isFinite(parseFloat(css.top))&&Math.abs(parseFloat(css.top)-(preview[1]-9))>1)){emit('DRAG_PREVIEW_BLOCKED',e,update);throw Error('CSS preview overridden');}emit('DRAG_PREVIEW_UPDATED',e,update);}catch(error){cancel(error.message);}};
  on(node,'pointermove',e=>once(e,move));
  const up=async e=>{
   emit('DRAG_POINTER_UP',e);
   if(phase!=='dragging'||e.pointerId!==pointer)return;
   try{check();if(![e.clientX,e.clientY].every(Number.isFinite))throw Error('Invalid release pointer');e.preventDefault();const finalCenter=[Math.max(9,Math.min(meta.width-9,center[0]+e.clientX-start[0])),Math.max(9,Math.min(meta.height-9,center[1]+e.clientY-start[1]))];const pdf=geometry.inverse(finalCenter,meta.matrix),offsetPDF=[pdf[0]-anchor[0],pdf[1]-anchor[1]];
    if(!offsetPDF.every(Number.isFinite))throw Error('Invalid inverse transform');phase='saving';emit('DRAG_COMMIT_STARTED',e,{pageIndex:meta.pageIndex,offsetPDF});release();
    await save(identity,{pageIndex:meta.pageIndex,offsetPDF},check);check();phase='done';emit('DRAG_POSITION_SAVED',e,{offsetPDF});cleanup();node.style.cssText=oldStyle;feedback('Position saved');
   }catch(error){emit('DRAG_SAVE_FAILED',e,{reason:error.message});cancel('Not saved: '+error.message);}
  };
  on(node,'pointerup',e=>once(e,up));
  const pointerCancel=e=>{if(phase==='dragging')cancel('pointercancel',e);};
  const captureLost=e=>{emit('DRAG_CAPTURE_LOST',e,{expected:phase!=='dragging'});if(phase==='dragging')cancel('lostpointercapture',e);};
  on(node,'gotpointercapture',e=>emit('DRAG_CAPTURE_CONFIRMED',e));
  on(node,'pointercancel',e=>once(e,pointerCancel));on(node,'lostpointercapture',e=>once(e,captureLost));
  on(win,'pointercancel',e=>{if(pointer!==null&&e.pointerId===pointer)once(e,pointerCancel);},true);
  on(win,'lostpointercapture',e=>{if(pointer!==null&&e.pointerId===pointer)once(e,captureLost);},true);
  // Active-session listeners in this PDF iframe only; never stopImmediatePropagation.
  on(win,'pointerdown',e=>{
   emit('DRAG_INPUT_OBSERVED',e,{computed:computed(node)});
   if(owns(e))once(e,down);
   else{const r=node.getBoundingClientRect();const inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;if(inside)emit('DRAG_HIT_MISS',e,{reason:'Pointer reached a different DOM target inside emoji bounds'});cancel(inside?'Selected emoji did not receive pointer hit':'Clicked outside');}
  },true);
  on(win,'pointermove',e=>{if(phase==='dragging'&&e.pointerId===pointer)once(e,move);},true);
  on(win,'pointerup',e=>{if(phase==='dragging'&&e.pointerId===pointer)once(e,up);},true);
  on(doc,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel('Cancelled');}},true);
  on(doc,'pointerdown',e=>{if(e.target!==node)cancel('Clicked outside');},true);
  on(doc,'scroll',()=>cancel('Scroll during adjustment'),true);on(win,'resize',()=>{try{check();emit('DRAG_LAYOUT_UNCHANGED',null,{source:'window-resize'});}catch(error){cancel('Resize during adjustment: '+error.message);}});on(win,'blur',()=>cancel('Window lost focus'));on(win,'pagehide',()=>cancel('Reader closed'));on(doc,'visibilitychange',()=>{if(doc.hidden)cancel('PDF hidden');});
  node.dataset.smDragTarget='true';node.style.pointerEvents='auto';node.style.cursor='grab';node.style.outline='1px dashed #777';node.style.touchAction='none';
  emit('DRAG_MODE_ENTERED',null,{audit,connected:node.isConnected,inlinePointerEvents:node.style.pointerEvents,computed:computed(node),parentComputed:node.parentElement?computed(node.parentElement):null});
  return {cancel,check,node,active:()=>!cancelled&&phase!=='done',phase:()=>phase};
 }
 const api={begin};if(typeof module!=='undefined')module.exports=api;else scope.SMPageDrag=api;
})(this);
