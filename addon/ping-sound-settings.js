/* Formal Ping settings. No writes on startup/read failure; legacy test mute is untouched. */
(function(scope){'use strict';
 const ENABLED='extensions.scholarmarker.ping.soundEnabled.v1',VOLUME='extensions.scholarmarker.ping.volumePercent';
 function create({read,write,clear,flush,allowed=()=>false}){const history=[];const note=(stage,key)=>{history.push({stage,key:key===ENABLED?'enabled':'volume'});if(history.length>32)history.shift();};
  function snapshot(){try{const enabled=read(ENABLED),volume=read(VOLUME);if(enabled!==undefined&&typeof enabled!=='boolean'||volume!==undefined&&(!Number.isInteger(volume)||volume<0||volume>100||volume%5))throw Error('INVALID_PREFERENCE');return {enabled:enabled===true,volume:volume===undefined?25:volume,valid:true};}catch{note('READ_FAILED',ENABLED);return {enabled:false,volume:25,valid:false};}}
  function commit(key,value){if(!allowed())throw Error('SOUND_SETTINGS_SCOPE');let before;try{before=read(key);}catch{note('READ_FAILED',key);throw Error('SOUND_SETTINGS_READ_FAILED');}try{write(key,value);flush();if(read(key)!==value)throw Error('READBACK');note('SAVED',key);}catch{try{if(before===undefined)clear(key);else write(key,before);}catch{}note('WRITE_UNCONFIRMED',key);throw Error('SOUND_SETTINGS_SAVE_UNCONFIRMED');}}
  return {enabled:()=>snapshot().enabled,volume:()=>snapshot().volume,snapshot,setEnabled(v){if(typeof v!=='boolean')throw Error('SOUND_SETTINGS_VALUE');commit(ENABLED,v);},setVolume(v){if(!Number.isInteger(v)||v<0||v>100||v%5)throw Error('INVALID_VOLUME');commit(VOLUME,v);},diagnostics:()=>({history:history.slice()})};
 }
 const api={create,ENABLED,VOLUME};if(typeof module!=='undefined')module.exports=api;else scope.SMPingSoundSettings=api;
})(this);
