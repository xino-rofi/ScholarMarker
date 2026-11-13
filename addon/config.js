/* Versioned, bounded plugin-private preference storage; no annotation writes. */
(function(scope){
 'use strict';
 const KEY='extensions.scholarmarker.config.v1',MAX_ASSET=128*1024,MAX_JSON=768*1024;
 function initial(){return {version:1,markers:[],assets:{}};}
 function asset(value){
  if(typeof value!=='string'||value.length>MAX_ASSET*1.4)throw Error('Asset too large (128 KiB maximum)');
  const m=/^data:(image\/gif|image\/png|audio\/wav);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!m||m[2].length%4)throw Error('Use a PNG, GIF or PCM WAV data URL');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',bytes=[];
  let bits=0,count=0;
  for(const c of m[2]){if(c==='=')break;bits=(bits<<6)|alphabet.indexOf(c);count+=6;if(count>=8){count-=8;bytes.push((bits>>>count)&255);}}
  const ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
  if(bytes.length>MAX_ASSET||bytes.length<32)throw Error('Empty, truncated or oversized asset');
  if(m[1]==='image/gif'&&bytes.at(-1)!==59||m[1]==='image/png'&&ascii(bytes.length-8,bytes.length-4)!=='IEND'||m[1]==='audio/wav'&&(ascii(8,12)!=='WAVE'||(bytes[4]+bytes[5]*256+bytes[6]*65536+bytes[7]*16777216)!==bytes.length-8))throw Error('Truncated or invalid asset container');
  const prefix=m[2].slice(0,12);
  if(m[1]==='image/gif'&&!/^R0lGOD[dl]/.test(prefix)||m[1]==='image/png'&&!prefix.startsWith('iVBORw0KGgo')||m[1]==='audio/wav'&&!prefix.startsWith('UklGR'))throw Error('Asset signature does not match type');
  return m[1];
 }
 function validate(raw){
  if(typeof raw!=='string'||raw.length>MAX_JSON)throw Error('Configuration exceeds storage limit');
  const c=JSON.parse(raw);
  if(c?.version!==1||!Array.isArray(c.markers)||c.markers.length>32||!c.assets||Array.isArray(c.assets)||typeof c.assets!=='object')throw Error('Unsupported configuration');
  const ids=new Set(),keys=new Set();
  for(const [id,value] of Object.entries(c.assets)){if(!/^asset-[1-9]\d*$/.test(id))throw Error('Invalid asset ID');asset(value);}
  for(const m of c.markers){
   if(!m||!/^(smile|wow|custom-[1-9]\d*)$/.test(m.id)||ids.has(m.id)||typeof m.name!=='string'||!m.name.trim()||m.name.length>60||typeof m.icon!=='string'||m.icon.length>12||typeof m.enabled!=='boolean')throw Error('Invalid Marker');
   ids.add(m.id);
   if(m.key!==''&&(!/^[qrjk]$/.test(m.key)||m.key===' '||keys.has(m.key)))throw Error('Use distinct Q/R/J/K keys');
   if(m.enabled&&m.key)keys.add(m.key);
   for(const field of ['static','gif','audio'])if(m[field]&&!Object.hasOwn(c.assets,m[field]))throw Error('Missing asset reference');
   if(m.static&&!asset(c.assets[m.static]).startsWith('image/'))throw Error('Image reference required');
   if(m.gif&&asset(c.assets[m.gif])!=='image/gif')throw Error('GIF reference required');
   if(m.audio&&asset(c.assets[m.audio])!=='audio/wav')throw Error('WAV reference required');
  }
  return c;
 }
 class Store {
  constructor(read,write){this.read=read;this.write=write;}
  load(){const raw=this.read(KEY);return raw?validate(raw):initial();}
  save(c){const raw=JSON.stringify(c);validate(raw);this.write(KEY,raw);return c;}
  update(marker){const c=this.load(),index=c.markers.findIndex(m=>m.id===marker.id);if(index<0)c.markers.push({...marker});else c.markers[index]={...marker};return this.save(c);}
  remove(id){if(!id.startsWith('custom-'))throw Error('Default Markers may be hidden, not deleted');const c=this.load();c.markers=c.markers.filter(m=>m.id!==id);return this.save(c);}
  import(value){asset(value);const c=this.load();const existing=Object.keys(c.assets).find(k=>c.assets[k]===value);if(existing)return existing;let n=1;while(Object.hasOwn(c.assets,'asset-'+n))n++;const id='asset-'+n;c.assets[id]=value;this.save(c);return id;}
  removeAsset(id){const c=this.load();if(c.markers.some(m=>m.gif===id||m.audio===id||m.static===id))throw Error('Asset is still referenced');delete c.assets[id];this.save(c);}
  resolve(id,builtins){const c=this.load(),m=c.markers.find(m=>m.id===id)||builtins[id];if(!m)return {id,name:'Missing Marker',icon:'◇',gif:'',audio:'',enabled:false,key:''};return {...m,static:c.assets[m.static]||'',gif:c.assets[m.gif]||builtins[id]?.gif||'',audio:c.assets[m.audio]||builtins[id]?.audio||''};}
 }
 const api={KEY,Store,validate,asset,initial};if(typeof module!=='undefined')module.exports=api;else scope.SMConfig=api;
})(this);
