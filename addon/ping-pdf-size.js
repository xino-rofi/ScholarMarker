/* Bounded display preferences only. No Link/catalog/Retained transaction authority. */
(function(scope){'use strict';
 const DEFAULT=32,MIN=16,MAX=96,STEP=4;
 function size(value){if(!Number.isInteger(value)||value<MIN||value>MAX||value%STEP!==0)throw Error('PDF_SIZE_INVALID');return value;}
 function identity(m){const markerID=m?.markerID??m?.id,assetID=m?.assetID;if(!/^m-[a-f0-9]{32}$/.test(markerID)||!/^[a-f0-9]{64}$/.test(assetID))throw Error('PDF_SIZE_IDENTITY');return {markerID,assetID};}
 function key(m){const a=identity(m);return a.markerID+'/'+a.assetID;}
 const KEY='extensions.scholarmarker.ping.pdfDisplaySizes.v1',MAX_ENTRIES=128,MAX_LENGTH=32768;
 function decode(raw){if(raw===undefined||raw===null)return {schemaVersion:1,entries:{}};if(typeof raw!=='string'||raw.length>MAX_LENGTH)throw Error('PDF_SIZE_SETTINGS_INVALID');const doc=JSON.parse(raw);if(!doc||Object.keys(doc).sort().join(',')!=='entries,schemaVersion'||doc.schemaVersion!==1||!doc.entries||Array.isArray(doc.entries)||typeof doc.entries!=='object'||Object.keys(doc.entries).length>MAX_ENTRIES)throw Error('PDF_SIZE_SETTINGS_INVALID');for(const [k,v]of Object.entries(doc.entries)){if(!/^m-[a-f0-9]{32}\/[a-f0-9]{64}$/.test(k))throw Error('PDF_SIZE_SETTINGS_IDENTITY');size(v);}return doc;}
 function createPreferences({read,write,clear,flush,allowed=()=>false}){let blocked=false;
  function snapshot(){try{return {valid:true,document:decode(read()),blocked};}catch{return {valid:false,document:{schemaVersion:1,entries:{}},blocked,reason:'PDF_SIZE_SETTINGS_INVALID'};}}
  function commit(m,value){if(blocked||!allowed())throw Error('PDF_SIZE_SETTINGS_NOT_WRITABLE');const k=key(m);if(value!==null)size(value);const before=read(),doc=decode(before);if(value===null||value===DEFAULT)delete doc.entries[k];else doc.entries[k]=value;if(Object.keys(doc.entries).length>MAX_ENTRIES)throw Error('PDF_SIZE_SETTINGS_LIMIT');const text=JSON.stringify(doc);if(text.length>MAX_LENGTH)throw Error('PDF_SIZE_SETTINGS_LIMIT');if(!allowed()||read()!==before)throw Error('PDF_SIZE_SETTINGS_CHANGED');try{write(text);flush();if(read()!==text)throw Error('PDF_SIZE_SETTINGS_READBACK');return doc;}catch(error){let restored=false;try{const actual=read();if(actual===text){if(before===undefined||before===null)clear();else write(before);flush();restored=read()===before||before==null&&read()==null;}else restored=actual===before;}catch{}if(!restored)blocked=true;const failure=Error(restored?'PDF_SIZE_SAVE_FAILED':'PDF_SIZE_SAVE_UNCONFIRMED');failure.outcome=restored?'FAILED':'UNKNOWN';throw failure;}}
  return {snapshot,commit,writable:()=>!blocked&&allowed()&&snapshot().valid};
 }
 function create({lookup,changed=()=>{},preferences=null}){let values=new Map();const listeners=new Set();let closed=false,readValid=true;
  if(preferences){const s=preferences.snapshot();readValid=s.valid;values=new Map(Object.entries(s.document.entries));}
  function current(m){if(closed)throw Error('PDF_SIZE_CLOSED');const a=identity(m),d=lookup(a.markerID);if(!d||d.assetID!==a.assetID)throw Error('PDF_SIZE_MATERIAL_CHANGED');return a;}
  function read(m){current(m);return values.get(key(m))??DEFAULT;}
  function applySession(m,value){current(m);if(value!==null)size(value);const k=key(m),had=values.has(k),before=values.get(k);if(value===null)values.delete(k);else values.set(k,value);try{changed();}catch{if(had)values.set(k,before);else values.delete(k);try{changed();}catch{}throw Error('PDF_SIZE_SESSION_APPLY_FAILED');}for(const fn of listeners)try{fn();}catch{}return read(m);}
  return {read,resolve(record){try{return read(record);}catch{return DEFAULT;}},applySession,
   async persist(m,value){current(m);if(!preferences)throw Error('PDF_SIZE_PERSISTENCE_BLOCKED');const doc=preferences.commit(m,value);values=new Map(Object.entries(doc.entries));readValid=true;let viewUpdated=true;try{changed();}catch{viewUpdated=false;}for(const fn of listeners)try{fn();}catch{viewUpdated=false;}return {value:read(m),viewUpdated};},
   subscribe(fn){if(closed)throw Error('PDF_SIZE_CLOSED');listeners.add(fn);return()=>listeners.delete(fn);},
   close(){closed=true;values.clear();listeners.clear();},diagnostics:()=>({mode:preferences?'PREFERENCES':'SESSION_ONLY',persistentAuthorized:!!preferences&&preferences.writable(),readValid,entries:values.size,listeners:listeners.size,closed})};
 }
 const api={DEFAULT,MIN,MAX,STEP,KEY,MAX_ENTRIES,MAX_LENGTH,size,identity,key,decode,createPreferences,create};if(typeof module!=='undefined')module.exports=api;else scope.SMPingPDFSize=api;
})(this);
