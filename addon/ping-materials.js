/* Read-only adapter over the existing shared Store.prepare/cache. */
(function(scope){
 'use strict';
 function create({store,decodeWindow,binary}){
  let stopped=false,next=0;const loads=new Map(),decodes=new Map();const stats={requests:0,cacheHits:0,merged:0,rejected:0,failed:0,decodeStarted:0,lastFailure:null};
  function describe(markerID){const s=store();if(stopped||!s||s.closed||s.blocked||!Object.hasOwn(s.data.definitions,markerID))return null;const d=s.data.definitions[markerID],a=Object.hasOwn(s.data.assets,d.assetID)&&s.data.assets[d.assetID];if(!d||d.kind!=='static'||!a||!['image/png','image/webp'].includes(a.mime))return null;return {markerID,assetID:d.assetID,name:d.name,mime:a.mime,width:a.width,height:a.height};}
  function valid(d){const current=describe(d.markerID);return !!current&&current.assetID===d.assetID;}
  function urlOK(url){return typeof url==='string'&&url.length<=3*1024*1024&&/^data:image\/(png|webp);base64,/.test(url);}
  function decode(bytes,mime){return new Promise((resolve,reject)=>{if(stopped){reject(Error('Ping decoder stopped'));return;}let w,image,timer=null,id=++next,finished=false;
   function finish(error){if(finished)return;finished=true;if(timer!==null)try{w.clearTimeout(timer);}catch{}if(image){try{image.onload=image.onerror=null;}catch{}try{image.removeAttribute('src');}catch{}}decodes.delete(id);if(error){stats.lastFailure=/timeout/.test(String(error.message))?'DECODE_TIMEOUT':/stopped/.test(String(error.message))?'DECODE_CANCELLED':'DECODE_FAILED';reject(error);}else resolve(result);}
   let result;try{w=decodeWindow();if(!w||typeof w.Image!=='function'||typeof w.btoa!=='function')throw Error('Ping decoder unavailable');image=new w.Image();let text='';for(let i=0;i<bytes.length;i+=8192)text+=binary.ascii(bytes,i,Math.min(bytes.length,i+8192));const url='data:'+mime+';base64,'+w.btoa(text);stats.decodeStarted++;decodes.set(id,()=>finish(Error('Ping decoder stopped')));timer=w.setTimeout(()=>finish(Error('Ping decode timeout')),4000);image.onload=()=>{const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height){finish(Error('Ping decode invalid'));return;}result={url,width,height};finish();};image.onerror=()=>finish(Error('Ping decode failed'));image.src=url;}catch(error){finish(error);}
  });}
  function prepare(d){stats.requests++;if(!valid(d))return Promise.resolve(null);const s=store(),cached=s.image(d.markerID);if(urlOK(cached)){stats.cacheHits++;stats.lastFailure=null;return Promise.resolve({...d,url:cached});}if(loads.has(d.assetID)){stats.merged++;return loads.get(d.assetID).then(value=>value&&valid(d)?{...d,url:value}:null);}if(loads.size>=2){stats.rejected++;return Promise.resolve(null);}
   // Preflight the long-lived decoder realm before entering shared cache failure handling.
   try{const w=decodeWindow();if(!w||typeof w.Image!=='function'||typeof w.btoa!=='function')throw Error();const image=new w.Image();image.removeAttribute('src');}catch{stats.failed++;stats.lastFailure='DECODER_CONTEXT_UNAVAILABLE';return Promise.resolve(null);}
   const p=s.prepare(d.markerID,decode).then(url=>{if(stopped||!valid(d)||!urlOK(url)){stats.failed++;if(stopped)stats.lastFailure='STOPPED';else if(!valid(d))stats.lastFailure='DEFINITION_CHANGED';else stats.lastFailure=stats.lastFailure||'ASSET_VALIDATION_OR_DECODE_FAILED';return null;}stats.lastFailure=null;return url;},()=>{stats.failed++;stats.lastFailure='ASSET_PREPARE_FAILED';return null;}).finally(()=>{if(loads.get(d.assetID)===p)loads.delete(d.assetID);});loads.set(d.assetID,p);return p.then(url=>url&&valid(d)?{...d,url}:null);
  }
  return {describe,valid,prepare,diagnostics(){return {...stats,loads:loads.size,decodes:decodes.size,decodeTimers:decodes.size,stopped};},stop(){stopped=true;for(const cancel of [...decodes.values()])cancel();loads.clear();}};
 }
 const api={create};if(typeof module!=='undefined')module.exports=api;else scope.SMPingMaterials=api;
})(this);
