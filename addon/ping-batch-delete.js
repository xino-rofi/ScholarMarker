/* Sequential orchestration. Every deletion is confirmed by the command coordinator. */
(function(scope){
 'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 function create({validate,reload,list,inspectMany,remove,describe=()=>({}),changed=()=>{}}){
  let closed=false,busy=false,spent=false,rows=[],selected=new Set(),last=null;
  const check=()=>{if(closed)throw Error('BATCH_PANEL_CLOSED');validate();};
  const checkSelection=()=>{check();if(busy||spent)throw Error('BATCH_SELECTION_LOCKED');};
  const snapshot=()=>({rows:copy(rows),selected:[...selected],busy,spent,result:last&&copy(last)});
  return {
   async refresh(){
    if(busy||spent)throw Error('BATCH_REOPEN_REQUIRED');
    check();
    await reload();
    check();
    const records=list();
    if(!Array.isArray(records)||records.length>2000)throw Error('BATCH_LIST_LIMIT');
    const ids=new Set(),next=[];
    const states=await inspectMany(records);
    check();
    if(!Array.isArray(states)||states.length!==records.length)throw Error('BATCH_STORE_UNVERIFIABLE');
    for(const [i,record] of records.entries()){
     if(ids.has(record.pingID))throw Error('BATCH_DUPLICATE_ID');
     ids.add(record.pingID);
     const state=states[i];
     if(!['AVAILABLE','UNLINKED'].includes(state.status))throw Error('BATCH_STORE_UNVERIFIABLE');
     next.push({record:copy(record),linked:state.status==='AVAILABLE',...describe(record)});
    }
    rows=next;
    selected.clear();
    return snapshot();
   },
   snapshot,
   select(id,on){
    checkSelection();
    if(!rows.some(row=>row.record.pingID===id))throw Error('BATCH_UNKNOWN_ID');
    if(on)selected.add(id);else selected.delete(id);
   },
   selectAll(on){
    checkSelection();
    selected=new Set(on?rows.map(row=>row.record.pingID):[]);
   },
   close(){closed=true;},
   async execute({trusted=false,confirm,progress=()=>{}}){
    checkSelection();
    if(!trusted)throw Error('BATCH_TRUSTED_CLICK_REQUIRED');
    const plan=rows.filter(row=>selected.has(row.record.pingID)).map(row=>copy(row.record));
    const cancelled={success:0,failed:0,unexecuted:plan.length,cancelled:true};
    if(!plan.length)return cancelled;
    busy=true;
    try{
     if(await confirm(plan.length)!==true)return cancelled;
     check();
     spent=true;
     const result={success:0,failed:0,unexecuted:plan.length,items:[],stopped:false};
     last=result;
     const clock=()=>globalThis.performance?.now?.()??Date.now();
     let attempted=false;
     for(const record of plan){
      const started=clock();
      let submitted=false;
      try{
       check();
       submitted=true;
       attempted=true;
       const answer=await remove(record,check);
       if(answer?.outcome!=='CONFIRMED')throw Object.assign(Error('BATCH_DELETE_UNCONFIRMED'),{outcome:answer?.outcome||'UNKNOWN'});
       result.success++;
       result.unexecuted--;
       result.items.push({pingID:record.pingID,outcome:'CONFIRMED',operationID:answer.operationID||null,timings:answer.timings,durationMs:Math.round(clock()-started)});
       rows=rows.filter(row=>row.record.pingID!==record.pingID);
       selected.delete(record.pingID);
      }catch(error){
       result.failed++;
       result.unexecuted--;
       result.stopped=true;
       result.items.push({pingID:record.pingID,outcome:error.outcome||'REJECTED',reason:String(error.message),submitted,operationID:error.operationID||null,timings:error.timings,durationMs:Math.round(clock()-started)});
       break;
      }
      try{progress(result.success,plan.length,record.pingID);}catch(error){result.refreshWarning=String(error.message);}
     }
     if(attempted){
      try{changed();}catch(error){result.refreshWarning=String(error.message);}
     }
     return copy(result);
    }finally{busy=false;}
   }
  };
 }
 const api={create};
 if(typeof module!=='undefined')module.exports=api;else scope.SMPingBatchDelete=api;
})(this);
