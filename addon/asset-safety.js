/* Compatibility-only reference guard. No Ping payload writes or native APIs. */
(function(scope){
 'use strict';
 const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,MID=/^m-[a-f0-9]{32}$/,ASSET=/^[a-f0-9]{64}$/,KEY='extensions.scholarmarker.retainedCompat.v1';
 const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===keys.split(',').sort().join(',');
 function registry(text,epoch){
  if(typeof text!=='string'||text.length>100000)throw Error('ASSET_SAFETY_REGISTRY_INVALID');let s;try{s=JSON.parse(text);}catch{throw Error('ASSET_SAFETY_REGISTRY_INVALID');}
  if(!exact(s,'schemaVersion,epoch,revision,refs')||s.schemaVersion!==1||s.epoch!==epoch||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.refs)||s.refs.length>100)throw Error('ASSET_SAFETY_REGISTRY_INVALID');
  const ids=new Set();for(const r of s.refs){if(!exact(r,'pingID,libraryID,attachmentKey,markerID,assetID')||!['pingID','attachmentKey','markerID','assetID'].every(k=>typeof r[k]==='string')||!UUID.test(r.pingID)||ids.has(r.pingID)||!Number.isSafeInteger(r.libraryID)||r.libraryID<1||!/^[A-Z0-9]{8}$/.test(r.attachmentKey)||!MID.test(r.markerID)||!ASSET.test(r.assetID))throw Error('ASSET_SAFETY_REGISTRY_INVALID');ids.add(r.pingID);}return s;
 }
 function create(io){
  let held=null,sequence=0;const tickets=new WeakMap(),stats={locks:0,releases:0,checks:0,refusals:0,lastState:'NOT_CHECKED'};
  const requireLock=()=>{if(!held)throw Error('ASSET_SAFETY_LOCK_REQUIRED');};
  const currentCatalog=async()=>{try{return await io.catalog();}catch{throw Error('ASSET_SAFETY_CATALOG_INVALID_OR_UNAVAILABLE');}};
  async function snapshot(){requireLock();stats.checks++;try{
   const witness=await io.witness(),flag=await io.read('activation.json'),text=await io.read('references-v1.json'),tmpA=await io.exists('activation.json.tmp'),tmpR=await io.exists('references-v1.json.tmp');
   if(tmpA||tmpR)throw Error('ASSET_SAFETY_INCOMPLETE_WRITE');
   if(witness===''&&flag===null&&text===null){stats.lastState='LEGACY_VERIFIED';return {state:'LEGACY_VERIFIED',refs:[]};}
   if(witness!=='required-v1'||flag===null||text===null)throw Error('ASSET_SAFETY_INCOMPLETE_PROTOCOL');
   let activation;try{activation=JSON.parse(flag);}catch{throw Error('ASSET_SAFETY_ACTIVATION_INVALID');}
   if(!exact(activation,'protocolVersion,state,epoch')||activation.protocolVersion!==1||activation.state!=='required'||typeof activation.epoch!=='string'||!UUID.test(activation.epoch))throw Error('ASSET_SAFETY_ACTIVATION_INVALID');
   const s=registry(text,activation.epoch);stats.lastState='RETAINED_V1_VERIFIED';return {state:stats.lastState,refs:s.refs,epoch:s.epoch,revision:s.revision};
  }catch(e){stats.refusals++;stats.lastState=String(e.message).startsWith('ASSET_SAFETY_')?String(e.message).slice(0,120):'ASSET_SAFETY_READ_FAILED';throw Error(stats.lastState);}}
  async function authorize(markerID,assetID,last){requireLock();if(!MID.test(markerID)||!ASSET.test(assetID))throw Error('ASSET_SAFETY_TARGET_INVALID');const catalog=await currentCatalog();if(catalog.definitions[markerID]?.assetID!==assetID||last!==!Object.entries(catalog.definitions).some(([id,d])=>id!==markerID&&d.assetID===assetID))throw Error('ASSET_SAFETY_CATALOG_TARGET_CHANGED');const annotations=Object.values(catalog.assignments).filter(a=>a.markerID===markerID).length;if(annotations)throw Error('Marker is used by '+annotations+' annotations');const s=await snapshot(),count=s.refs.filter(r=>r.markerID===markerID).length;
   if(count){stats.refusals++;throw Error('ASSET_SAFETY_REFERENCED:'+count);}
   if(last&&s.refs.some(r=>r.assetID===assetID)){stats.refusals++;throw Error('ASSET_SAFETY_ASSET_REFERENCED:'+s.refs.filter(r=>r.assetID===assetID).length);}
   const ticket=Object.freeze({});tickets.set(ticket,{markerID,assetID,last,owner:held});return ticket;
  }
  async function assertTicket(ticket,assetID){requireLock();const t=tickets.get(ticket);if(!t||t.owner!==held||t.assetID!==assetID||!t.last)throw Error('ASSET_SAFETY_DELETE_AUTH_REQUIRED');const catalog=await currentCatalog();if(catalog.assets[assetID]||Object.values(catalog.definitions).some(d=>d.assetID===assetID))throw Error('ASSET_SAFETY_CATALOG_STILL_REFERENCES');}
  async function verify(ticket,markerID,assetID,last){requireLock();const t=tickets.get(ticket);if(!t||t.owner!==held||t.markerID!==markerID||t.assetID!==assetID||t.last!==last)throw Error('ASSET_SAFETY_DELETE_AUTH_REQUIRED');const s=await snapshot();if(s.refs.some(r=>r.markerID===markerID||last&&r.assetID===assetID))throw Error('ASSET_SAFETY_REFERENCE_CHANGED');}
  async function run(fn){if(held)throw Error('ASSET_SAFETY_LOCK_BUSY');try{await io.lock();}catch(e){stats.refusals++;stats.lastState='ASSET_SAFETY_LOCK_BUSY_OR_IO';throw Error(stats.lastState);}held=++sequence;stats.locks++;try{return await fn();}finally{held=null;try{await io.unlock();stats.releases++;}catch{stats.lastState='ASSET_SAFETY_LOCK_RELEASE_FAILED';throw Error(stats.lastState);}}}
  return {run,snapshot,authorize,assertTicket,verify,assertHeld:requireLock,diagnostics:()=>({...stats,held:!!held})};
 }
 function createIO({IOUtils,Services,Components,guard}){
  const profile=()=>Services.dirsvc.get('ProfD',Components.interfaces.nsIFile).path;
  const root=()=>profile()+'\\scholarmarker\\retained-compat-v1';
  function checked(file){guard();const base=root();if(file!==base&&!file.startsWith(base+'\\'))throw Error('ASSET_SAFETY_PATH');let p=file;while(p.length>3){const f=Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsIFile);f.initWithPath(p);if(f.exists()&&f.isSymlink())throw Error('ASSET_SAFETY_REDIRECT');p=p.slice(0,p.lastIndexOf('\\'));}return file;}
  const file=name=>{if(!['activation.json','references-v1.json','activation.json.tmp','references-v1.json.tmp','mutation.lock'].includes(name))throw Error('ASSET_SAFETY_PATH');return checked(root()+'\\'+name);};
  return {async witness(){guard();if(typeof Services.prefs?.getStringPref!=='function'||typeof Services.prefs?.getPrefType!=='function')throw Error('ASSET_SAFETY_WITNESS_UNAVAILABLE');const type=Services.prefs.getPrefType(KEY);if(type===0)return '';if(type!==32)throw Error('ASSET_SAFETY_WITNESS_INVALID');return Services.prefs.getStringPref(KEY);},async read(name){const p=file(name);if(!await IOUtils.exists(p))return null;if((await IOUtils.stat(p)).size>100000)throw Error('ASSET_SAFETY_FILE_TOO_LARGE');return IOUtils.readUTF8(p);},exists:name=>IOUtils.exists(file(name)),
   async lock(){checked(root());await IOUtils.makeDirectory(root(),{ignoreExisting:true,createAncestors:true});try{await IOUtils.makeDirectory(file('mutation.lock'),{ignoreExisting:false,createAncestors:false});}catch{throw Error('ASSET_SAFETY_LOCK_BUSY_OR_IO');}},async unlock(){await IOUtils.remove(file('mutation.lock'),{recursive:false,ignoreAbsent:false});}};
 }
 const api={KEY,registry,create,createIO};if(typeof module!=='undefined')module.exports=api;else scope.SMAssetSafety=api;
})(this);
