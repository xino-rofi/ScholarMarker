(function(scope){'use strict';function mount({doc,service,confirm,valid=()=>true}){const node=doc.createElement('section');node.dataset.smBatchManager='true';let closed=false,busy=false;const usable=()=>!closed&&valid();const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;},message=el('p','正在读取当前 PDF…'),rows=el('div'),count=el('p'),controls=[];const button=(text,fn)=>{const b=el('button',text);b.type='button';b.addEventListener('click',fn);controls.push(b);return b;};message.setAttribute('role','status');const rowNodes=new Map();function sync(){const s=service.snapshot();count.textContent='已选 '+s.selected.length+' / '+s.rows.length;for(const b of controls)b.disabled=busy||s.spent;for(const input of rows.querySelectorAll('input'))input.disabled=busy||s.spent;}
function render(){if(!usable())return;rows.replaceChildren();rowNodes.clear();const s=service.snapshot();for(const r of s.rows){const line=el('label'),input=el('input');input.type='checkbox';input.checked=s.selected.includes(r.record.pingID);input.dataset.smBatchPing=r.record.pingID;input.addEventListener('change',()=>{try{service.select(r.record.pingID,input.checked);sync();}catch(e){message.textContent=e.message;}});line.append(input);if(r.image){const image=el('img');image.src=r.image;image.style.cssText='width:32px;height:32px;object-fit:contain';line.append(image);}line.append(el('span',(r.label||r.record.markerID)+' · 第'+(r.record.pageIndex+1)+'页 · '+(r.linked?'已关联':'未关联')));rows.append(line);rowNodes.set(r.record.pingID,line);}sync();}
const failureLabels={
 BATCH_SOURCE_MISSING:'重新读取后没有找到这条 Ping。',
 BATCH_SOURCE_REVISION_CHANGED:'这条 Ping 在选中后有更新。',
 BATCH_SOURCE_RECORD_CHANGED:'这条 Ping 的位置或素材等记录在选中后有变化。',
 BATCH_EPOCH_CHANGED:'本机 Ping 库的状态已变化。',
 BATCH_STORE_UNVERIFIABLE:'当前关联状态无法确认。',
 RETAINED_TARGET_CHANGED:'无法确认这条 Ping 与选中时相同。'
};
const diagnostic=el('pre');diagnostic.hidden=true;diagnostic.style.cssText='white-space:pre-wrap;user-select:text';
const diagnosticToggle=el('button','查看删除诊断');diagnosticToggle.type='button';diagnosticToggle.hidden=true;
diagnosticToggle.setAttribute('aria-expanded','false');
diagnosticToggle.addEventListener('click',()=>{
 diagnostic.hidden=!diagnostic.hidden;
 diagnosticToggle.setAttribute('aria-expanded',String(!diagnostic.hidden));
 diagnosticToggle.textContent=diagnostic.hidden?'查看删除诊断':'收起删除诊断';
});
function showDiagnostic(result){
 if(!result.items?.length)return;
 diagnostic.textContent=result.items.map((item,i)=>
  (i+1)+'. '+item.outcome+' · '+item.durationMs+' ms'+(item.reason?' · '+item.reason:'')
  +(item.timings?' · '+[['预检','preflightMs'],['读取和关联核对','sourceMs'],['提交','writeMs'],['准备提交','transactionSetupMs'],['日志和备份','journalMs'],['更新 Ping 和核对','pingMs'],['写入关联文件','registryMs'],['回读','verifyMs']].filter(([,key])=>Number.isFinite(item.timings[key])).map(([label,key])=>label+' '+item.timings[key]+' ms').join(' / '):'')
  +(item.operationID?' · 操作 '+item.operationID:'')).join('\n');
 diagnosticToggle.hidden=false;
}
const all=button('全选',()=>{service.selectAll(true);render();}),none=button('取消选择',()=>{service.selectAll(false);render();}),remove=button('删除选中',async event=>{if(busy||!usable())return;busy=true;sync();try{const result=await service.execute({
 trusted:event.isTrusted===true&&remove.isConnected,
 confirm:async total=>{const accepted=await confirm(total);if(accepted&&usable())message.textContent='正在删除 0 / '+total+'…';return accepted;},
 progress:(deleted,total,id)=>{if(!usable())return;rowNodes.get(id)?.remove();rowNodes.delete(id);message.textContent='已删除 '+deleted+' / '+total+'…';sync();}
});if(usable()){const reason=result.items?.at(-1)?.reason;
message.textContent=result.cancelled?'已取消，未删除':'成功 '+result.success+'，失败 '+result.failed+'，未执行 '+result.unexecuted+'。'+(result.stopped?(failureLabels[reason]||'删除已停止：'+reason+'。'):'');
showDiagnostic(result);}}catch(e){if(usable())message.textContent='已停止：'+e.message;}finally{busy=false;if(usable())sync();}});node.append(el('h3','管理当前 PDF 的 Ping'),el('p','仅删除页面 Ping 及其关联；不删除素材、声音或原生高亮。'),all,none,count,rows,remove,message,diagnosticToggle,diagnostic);return {node,async refresh(){try{await service.refresh();if(usable()){message.textContent='选择要删除的页面 Ping。';render();}}catch(e){if(usable())message.textContent='无法读取，未作修改：'+e.message;}},dispose(){closed=true;service.close();node.remove();}};}
const api={mount};if(typeof module!=='undefined')module.exports=api;else scope.SMPingBatchDeleteUI=api;})(this);
