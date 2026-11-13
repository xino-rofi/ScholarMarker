/* Draft preview; explicit trusted Save commits only the display preference. */
(function(scope){'use strict';
 const S=typeof module!=='undefined'?require('./ping-pdf-size.js'):scope.SMPingPDFSize;
 function mount({doc,material,service,loadPreview,notify=()=>{},valid=()=>true}){
  const root=doc.createElement('fieldset'),legend=doc.createElement('legend'),slider=doc.createElement('input'),value=doc.createElement('output'),sample=doc.createElement('img'),preview=doc.createElement('div'),reset=doc.createElement('button'),save=doc.createElement('button'),note=doc.createElement('p');let stopped=false,draft=service.read(material),dirty=false,resetDraft=false,saving=false;const events=[];
  legend.textContent='PDF显示大小';root.setAttribute('data-sm-pdf-size-editor','true');slider.type='range';slider.min=String(S.MIN);slider.max=String(S.MAX);slider.step=String(S.STEP);slider.value=String(draft);slider.setAttribute('aria-label',material.name+' PDF显示大小');value.setAttribute('aria-live','polite');sample.alt=material.name+' PDF尺寸预览';sample.style.cssText='object-fit:contain;display:block;pointer-events:none;';preview.style.cssText='overflow:auto;max-width:100%;';preview.append(sample);reset.type=save.type='button';reset.textContent='恢复默认';save.textContent='保存显示大小';
  function draw(){slider.value=String(draft);value.textContent=draft+'px';slider.setAttribute('aria-valuetext',value.textContent);sample.style.width=sample.style.height=draft+'px';slider.disabled=reset.disabled=saving;save.disabled=saving||!service.diagnostics().persistentAuthorized;note.textContent=save.disabled&&!saving?'显示设置暂不可写或读取失败，现有尺寸保持不变。':'仅调整PDF页面图标；保存后同步到所有PDF，重启后保持。';}
  function on(node,type,fn){node.addEventListener(type,fn);events.push(()=>node.removeEventListener(type,fn));}
  on(slider,'input',()=>{if(saving)return;try{draft=S.size(Number(slider.value));dirty=true;resetDraft=false;draw();}catch{draw();notify('大小必须为16–96px，步进4px。');}});
  on(reset,'click',e=>{if(e.isTrusted!==true||stopped||saving||!valid())return;draft=S.DEFAULT;dirty=true;resetDraft=true;draw();});
  on(save,'click',async e=>{if(e.isTrusted!==true||stopped||saving||!valid()||save.disabled)return;saving=true;draw();try{const result=await service.persist(material,resetDraft?null:draft);if(stopped||!valid())return;draft=result.value;dirty=false;resetDraft=false;notify(result.viewUpdated?'显示大小已保存，所有PDF中的同款Ping已更新。':'显示大小已保存；页面暂未刷新，请重新打开Reader。');}catch(error){if(stopped||!valid())return;try{draft=service.read(material);}catch{draft=S.DEFAULT;}dirty=false;resetDraft=false;notify(error.outcome==='UNKNOWN'?'保存结果无法确认，继续显示上次确认尺寸；请勿重复提交。':'显示大小未保存，已恢复上次确认尺寸。');}finally{saving=false;if(!stopped&&valid())draw();}});
  const unsubscribe=service.subscribe(()=>{if(stopped||!valid())return;if(!dirty&&!saving)try{draft=service.read(material);draw();}catch{slider.disabled=save.disabled=reset.disabled=true;}});
  root.append(legend,slider,value,preview,reset,save,note);draw();Promise.resolve().then(loadPreview).then(url=>{if(!stopped&&valid()&&sample.isConnected&&url)sample.src=url;},()=>{if(!stopped)sample.alt='素材预览暂不可用';});
  return {node:root,dispose(){if(stopped)return;stopped=true;events.splice(0).forEach(fn=>fn());unsubscribe();sample.removeAttribute?.('src');root.remove();}};
 }
 const api={mount};if(typeof module!=='undefined')module.exports=api;else scope.SMPingPDFSizeUI=api;
})(this);
