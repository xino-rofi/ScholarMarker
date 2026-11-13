/* Static assets and local assignments. Native annotation writes are not available here. */
(function(scope){
 'use strict';
 const binary=typeof module!=='undefined'?require('./import-bytes.js'):scope.SMImportBytes;
 const MAX=2*1024*1024,clone=x=>JSON.parse(JSON.stringify(x));
 const key=id=>{if(!id||!Number.isInteger(id.libraryID)||id.libraryID<1||!['attachmentKey','annotationKey'].every(k=>/^[A-Z0-9]{8}$/.test(id[k])))throw Error('Invalid annotation identity');return id.libraryID+'/'+id.attachmentKey+'/'+id.annotationKey;};
 const ascii=binary.ascii;
 const u32=(b,n)=>b[n]*16777216+b[n+1]*65536+b[n+2]*256+b[n+3],le=(b,n)=>b[n]+b[n+1]*256+b[n+2]*65536+b[n+3]*16777216;
 function crc(b,start=0,end=b.length){let c=0xffffffff;for(let at=start;at<end;at++){c^=b[at];for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
 function inspect(b){b=binary.copy(b);
  if((!ArrayBuffer.isView(b)||b.BYTES_PER_ELEMENT!==1)||b.length<20||b.length>MAX)throw Error('Image must be 1 byte–2 MiB');
  let mime,ext,width,height;
  if(ascii(b,0,8)==='\x89PNG\r\n\x1a\n'){
   mime='image/png';ext='png';let at=8,seen=0,idat=false,end=false;
   while(at<b.length){if(at+12>b.length)throw Error('Truncated PNG');const n=u32(b,at),type=ascii(b,at+4,at+8);if(n>MAX||at+12+n>b.length||!/^\w{4}$/.test(type))throw Error('Invalid PNG chunk');
    if(crc(b,at+4,at+8+n)!==u32(b,at+8+n))throw Error('PNG checksum mismatch');
    if(['acTL','fcTL','fdAT'].includes(type))throw Error('Animated PNG is not supported');
    if(!seen&&type!=='IHDR'||type==='IHDR'&&(seen||n!==13))throw Error('Invalid PNG header');
    if(type==='IHDR'){width=u32(b,at+8);height=u32(b,at+12);}if(type==='IDAT')idat=true;
    if(type==='IEND'){if(n||at+12!==b.length)throw Error('Invalid PNG end');end=true;}seen++;at+=12+n;
   }if(!end||!idat)throw Error('Incomplete PNG');
  }else if(ascii(b,0,4)==='RIFF'&&ascii(b,8,12)==='WEBP'){
   mime='image/webp';ext='webp';if(le(b,4)!==b.length-8)throw Error('Invalid WebP length');let at=12,images=0;
   while(at<b.length){if(at+8>b.length)throw Error('Truncated WebP');const type=ascii(b,at,at+4),n=le(b,at+4),start=at+8;if(start+n+(n%2)>b.length)throw Error('Invalid WebP chunk');
    if(type==='ANIM'||type==='ANMF'||type==='VP8X'&&(n!==10||(b[start]&2)))throw Error('Animated or invalid WebP');
    if(type==='VP8X'){width=1+b[start+4]+b[start+5]*256+b[start+6]*65536;height=1+b[start+7]+b[start+8]*256+b[start+9]*65536;if(width>1024||height>1024)throw Error('WebP canvas too large');}
    if(type==='VP8L'){if(n<5||b[start]!==47)throw Error('Invalid WebP lossless');images++;width=1+b[start+1]+((b[start+2]&63)<<8);height=1+(b[start+2]>>6)+(b[start+3]<<2)+((b[start+4]&15)<<10);}
    if(type==='VP8 '){if(n<10||ascii(b,start+3,start+6)!=='\x9d\x01\x2a')throw Error('Invalid WebP frame');images++;width=(b[start+6]+b[start+7]*256)&16383;height=(b[start+8]+b[start+9]*256)&16383;}
    at=start+n+(n%2);
   }if(images!==1)throw Error('Exactly one static WebP frame required');
  }else throw Error('Only static PNG/WebP content is supported');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024)throw Error('Image dimensions must be 1–1024');
  return {mime,ext,width,height,bytes:b.length};
 }
 const initial=()=>({schemaVersion:1,definitions:{},assets:{},assignments:{}});
 function validate(s){
  if(!s||s.schemaVersion!==1||Object.keys(s).sort().join(',')!=='assets,assignments,definitions,schemaVersion'||!['assets','assignments','definitions'].every(k=>s[k]&&typeof s[k]==='object'&&!Array.isArray(s[k])))throw Error('Unsupported custom Marker schema');
  if(Object.keys(s.definitions).length>50||Object.keys(s.assets).length>50||Object.keys(s.assignments).length>10000)throw Error('Custom Marker limits exceeded');
  for(const [id,a] of Object.entries(s.assets))if(!/^[a-f0-9]{64}$/.test(id)||!a||!['png','webp'].includes(a.ext)||a.path!=='assets/'+id+'.'+a.ext||a.mime!=='image/'+a.ext||!Number.isInteger(a.bytes)||a.bytes<1||a.bytes>MAX||![a.width,a.height].every(n=>Number.isInteger(n)&&n>0&&n<=1024)||Object.keys(a).sort().join(',')!=='bytes,ext,height,mime,path,width')throw Error('Invalid asset metadata');
  for(const [id,d] of Object.entries(s.definitions))if(!/^m-[a-f0-9]{32}$/.test(id)||!d||d.kind!=='static'||typeof d.name!=='string'||!d.name.trim()||d.name.length>60||!Object.hasOwn(s.assets,d.assetID)||Object.keys(d).sort().join(',')!=='assetID,kind,name')throw Error('Invalid Marker definition');
  for(const [id,a] of Object.entries(s.assignments))if(!/^[1-9]\d*\/[A-Z0-9]{8}\/[A-Z0-9]{8}$/.test(id)||!a||Object.keys(a).join(',')!=='markerID'||!Object.hasOwn(s.definitions,a.markerID))throw Error('Invalid assignment');return s;
 }
 const deletionAuthorizations=new WeakMap();
 class Store{
  constructor(io){this.io=io;this.data=initial();this.tail=Promise.resolve();this.loadTail=Promise.resolve();this.blocked=false;this.closed=false;this.epoch=0;this.cache=new Map();this.pending=new Map();this.failures=new Set();this.stats={assetReads:0,cacheHits:0,assetFailures:0,writes:0};this.ready=this.load();}
  async load(){try{this.disk=await this.io.readState();if(this.disk!==null){if(typeof this.disk!=='string'||this.disk.length>3e6)throw Error('Custom state too large');this.data=validate(JSON.parse(this.disk));}}catch(e){this.blocked=true;this.error=e.message;}}
  ensure(){if(this.closed||this.blocked)throw Error('Custom Marker storage unavailable: '+(this.error||'closed'));}
  run(fn){const p=this.tail.then(async()=>{await this.ready;this.ensure();return this.io.safety?this.io.safety.run(fn):fn();});this.tail=p.catch(()=>{});return p;}
  async commit(next,guard=()=>{}){
   if(this.io.safety)this.io.safety.assertHeld();
   validate(next);const removedDefs=Object.keys(this.data.definitions).filter(id=>!next.definitions[id]||next.definitions[id].assetID!==this.data.definitions[id].assetID),removedAssets=Object.keys(this.data.assets).filter(id=>!next.assets[id]||['path','ext','mime','bytes','width','height'].some(k=>next.assets[id][k]!==this.data.assets[id][k]));
   if(removedDefs.length||removedAssets.length){const a=deletionAuthorizations.get(this);if(!a||removedDefs.length!==1||removedDefs[0]!==a.id||JSON.stringify(removedAssets)!==JSON.stringify(a.last?[a.assetID]:[]))throw Error('ASSET_SAFETY_DELETE_AUTH_REQUIRED');if(this.io.safety)await this.io.safety.verify(a.ticket,a.id,a.assetID,a.last);}
   guard();if(await this.io.readState()!==this.disk){this.blocked=true;throw Error('Custom state changed externally; preserved');}
   const before=this.disk,text=JSON.stringify(next);let written=false;
   try{await this.io.writeState(text);written=true;guard();this.data=next;this.disk=text;this.stats.writes++;}
   catch(e){if(written){try{if(before===null)throw Error('First commit invalidated; state preserved for inspection');await this.io.writeState(before);}catch(r){this.blocked=true;this.error=r.message;}}else{this.blocked=true;this.error=e.message;}throw e;}
  }
  list(){return Object.entries(this.data.definitions).map(([id,d])=>({id,...clone(d),references:Object.values(this.data.assignments).filter(a=>a.markerID===id).length}));}
  assignment(id){return this.data.assignments[key(id)]?.markerID||null;}
  create(name,bytes,decode,trace=()=>{}){return this.run(async()=>{
   const step=async(stage,fn)=>{trace(stage,'BEGIN');try{const result=await fn();trace(stage,'OK');return result;}catch(e){trace(stage,'ERROR',e);throw e;}};
   bytes=await step('BINARY_NORMALIZE',()=>binary.copy(bytes));
   if(this.list().length>=50)throw Error('Maximum 50 Markers');name=String(name).trim();if(!name||name.length>60)throw Error('Use a name of 1–60 characters');
   const meta=await step('CONTAINER_VALIDATE',()=>inspect(bytes)),decoded=await step('IMAGE_DECODE',async()=>{const value=await decode(bytes,meta.mime);if(value.width!==meta.width||value.height!==meta.height)throw Error('Image decode dimensions do not match content');return value;});
   this.ensure();const hash=await step('SHA256',()=>this.io.hash(bytes));if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid asset digest');const id=await step('MARKER_ID',()=>this.io.id());if(!/^m-[a-f0-9]{32}$/.test(id)||Object.hasOwn(this.data.definitions,id))throw Error('Invalid Marker ID');
   const next=clone(this.data),asset={...meta,path:'assets/'+hash+'.'+meta.ext};
   await step('ASSET_WRITE',()=>this.io.writeAsset(asset.path,bytes));next.assets[hash]=asset;next.definitions[id]={name,kind:'static',assetID:hash};await step('STATE_COMMIT',()=>this.commit(next));this.cache.set(hash,decoded.url);this.failures.delete(hash);return id;
  });}
  rename(id,name){return this.run(async()=>{name=String(name).trim();if(!Object.hasOwn(this.data.definitions,id)||!name||name.length>60)throw Error('Invalid Marker or name');const next=clone(this.data);next.definitions[id].name=name;await this.commit(next);});}
  remove(id){return this.run(async()=>{const d=this.data.definitions[id];if(!d)throw Error('Unknown Marker');const count=Object.values(this.data.assignments).filter(a=>a.markerID===id).length;if(count)throw Error('Marker is used by '+count+' annotations');
   const next=clone(this.data);delete next.definitions[id];const a=next.assets[d.assetID],last=!Object.values(next.definitions).some(x=>x.assetID===d.assetID);if(last)delete next.assets[d.assetID];
   const ticket=this.io.safety?await this.io.safety.authorize(id,d.assetID,last):null;deletionAuthorizations.set(this,{id,assetID:d.assetID,last,ticket});
   try{await this.commit(next);if(last){this.cache.delete(d.assetID);this.failures.delete(d.assetID);this.pending.delete(d.assetID);try{if(this.io.safety)await this.io.safety.verify(ticket,id,d.assetID,last);await this.io.removeAsset(a.path,ticket);}catch{throw Error('Marker deleted; unused asset retained because cleanup failed');}}}finally{deletionAuthorizations.delete(this);}
  });}
  assign(id,markerID,guard){return this.run(async()=>{guard();if(!Object.hasOwn(this.data.definitions,markerID))throw Error('Unknown Marker');const next=clone(this.data);next.assignments[key(id)]={markerID};await this.commit(next,guard);});}
  unassign(id,guard){return this.run(async()=>{guard();const next=clone(this.data);delete next.assignments[key(id)];await this.commit(next,guard);});}
  async prepare(markerID,decode){await this.ready;if(this.blocked||this.closed)return null;const d=this.data.definitions[markerID],a=d&&this.data.assets[d.assetID];if(!a)return null;if(this.cache.has(d.assetID)){this.stats.cacheHits++;return this.cache.get(d.assetID);}if(this.failures.has(d.assetID))return null;if(this.pending.has(d.assetID))return this.pending.get(d.assetID);
   const epoch=this.epoch;const p=this.loadTail.then(async()=>{if(this.closed||epoch!==this.epoch||!Object.hasOwn(this.data.assets,d.assetID))return null;try{this.stats.assetReads++;const bytes=await this.io.readAsset(a.path);if(await this.io.hash(bytes)!==d.assetID||JSON.stringify(inspect(bytes))!==JSON.stringify({mime:a.mime,ext:a.ext,width:a.width,height:a.height,bytes:a.bytes}))throw Error('Asset integrity mismatch');const result=await decode(bytes,a.mime);if(result.width!==a.width||result.height!==a.height)throw Error('Decode mismatch');if(!this.closed&&epoch===this.epoch&&Object.hasOwn(this.data.assets,d.assetID))this.cache.set(d.assetID,result.url);return result.url;}catch{this.stats.assetFailures++;if(epoch===this.epoch&&Object.hasOwn(this.data.assets,d.assetID))this.failures.add(d.assetID);return null;}finally{if(this.pending.get(d.assetID)===p)this.pending.delete(d.assetID);}});this.loadTail=p.then(()=>undefined,()=>undefined);this.pending.set(d.assetID,p);return p;
  }
  image(markerID){const d=this.data.definitions[markerID];return d?this.cache.get(d.assetID)||null:null;}
  release(){this.epoch++;this.cache.clear();this.failures.clear();this.pending.clear();}
  async close(){this.closed=true;await this.tail;await Promise.allSettled([...this.pending.values()]);this.release();}
 }
 const api={MAX,inspect,validate,initial,key,Store};if(typeof module!=='undefined')module.exports=api;else scope.SMCustomMarkers=api;
})(this);
