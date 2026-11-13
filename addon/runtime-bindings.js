/* Admission decorators around public mutation entry points; Store implementations unchanged. */
(function(scope){'use strict';
function install(s,runtime){
 const wrap=(instance,names,kind)=>{for(const name of names){const original=instance[name];if(typeof original!=='function')continue;instance[name]=async function(...args){await runtime.preflight(kind);return runtime.guardTask(kind,async()=>{try{return await original.apply(instance,args);}catch(e){if(instance.blocked||instance.audioBlocked)runtime.markBlocked(e.message,'store:'+kind);throw e;}});};}return instance;};
 const Custom=s.SMCustomMarkers.Store;s.SMCustomMarkers.Store=class extends Custom{constructor(...args){super(...args);wrap(this,['create','rename','remove','assign','unassign'],'MATERIAL');}};
 const Retained=s.SMRetainedStore.Store;s.SMRetainedStore.Store=class extends Retained{constructor(...args){super(...args);wrap(this,['create'],'PING_CREATE');}};
 const Media=s.SMPingMedia.Store;s.SMPingMedia.Store=class extends Media{constructor(...args){super(...args);wrap(this,['bind','createGIF'],'MEDIA');}};
 const create=s.SMPingCardCommands.create;s.SMPingCardCommands.create=function(...args){const commands=create(...args),submit=commands.submit;commands.submit=async spec=>{await runtime.preflight(spec.kind||'LINK');return runtime.guardTask(spec.kind||'LINK',()=>submit.call(commands,spec));};return commands;};
}
const api={install};if(typeof module!=='undefined')module.exports=api;else scope.SMRuntimeBindings=api;
})(this);
