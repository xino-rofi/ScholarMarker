/* Latest transient voice only. Never invokes shared player closeAll/closeWindow. */
(function(scope){'use strict';
function create({Player,Audio,media,muted,volume,trace}){let current=null,stopped=false;const totals={starts:0,stops:0,audioRejected:0,frames:0,audioStarted:0,gifCompleted:0};
function stopAll(reason='REPLACED'){if(!current)return;trace?.('TRANSIENT_STOP',reason);const old=current;current=null;old.backend.stop(old.node);const d=old.backend.diagnostics();for(const key of Object.keys(totals))totals[key]+=d[key]||0;}
function stop(node){if(current?.node===node)stopAll('NODE_RELEASED');}
return {play(node,id,guard,audioWindow){if(stopped)return Promise.resolve();if(!audioWindow)throw Error('TRANSIENT_INPUT_WINDOW_REQUIRED');stopAll();const backend=Player.create({media,muted,volume,trace,audioFactory:(_win,url)=>new Audio.Output(audioWindow,url)});current={node,audioWindow,backend};return backend.play(node,id,guard);},stop,stopAll,stopDocument(doc){if(current&&(current.node.ownerDocument===doc||current.audioWindow?.document===doc))stopAll('DOCUMENT_CLOSED');},setVolume:value=>current?.backend.setVolume(value),dispose(){stopAll('STOPPED');stopped=true;},diagnostics(){const d=current?.backend.diagnostics()||{players:0,audio:0,timers:0,pending:0},out={...d,stopped,latest:!!current};for(const key of Object.keys(totals))out[key]=totals[key]+(d[key]||0);return out;}};
}
const api={create};if(typeof module!=='undefined')module.exports=api;else scope.SMTransientPlayback=api;
})(this);
