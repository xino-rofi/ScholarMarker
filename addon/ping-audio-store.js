/* Additive audio-v2 manifest. Never rewrites the legacy GIF/WAV media manifest. */
(function(scope){'use strict';
 const A=typeof module!=='undefined'?require('./ping-audio.js'):scope.SMPingAudio;
 const initial=()=>({schemaVersion:1,revision:0,assets:{},markers:{}}),HASH=/^[a-f0-9]{64}$/,MID=/^m-[a-f0-9]{32}$/;
 function validate(v){if(!v||Object.keys(v).sort().join(',')!=='assets,markers,revision,schemaVersion'||v.schemaVersion!==1||!Number.isSafeInteger(v.revision)||v.revision<0||!v.assets||!v.markers||Array.isArray(v.assets)||Array.isArray(v.markers)||Object.keys(v.assets).length>100||Object.keys(v.markers).length>100)throw Error('AUDIO_V2_SCHEMA');let total=0;for(const [id,a]of Object.entries(v.assets)){if(!HASH.test(id)||Object.keys(a).sort().join(',')!=='bytes,ext'||!['mp3','wav'].includes(a.ext)||!Number.isSafeInteger(a.bytes)||a.bytes<1||a.bytes>A.LIMIT.bytes)throw Error('AUDIO_V2_ASSET');total+=a.bytes;}if(total>67108864)throw Error('AUDIO_V2_CAPACITY');for(const [id,m]of Object.entries(v.markers))if(!MID.test(id)||Object.keys(m).sort().join(',')!=='audioID,coverAssetID'||!HASH.test(m.coverAssetID)||!(m.audioID===null||HASH.test(m.audioID)&&v.assets[m.audioID]))throw Error('AUDIO_V2_MARKER');return v;}
 function createClass(Base){return class Store{
  constructor(options){this.base=new Base(options);this.io=options.io;this.catalog=options.catalog;this.document=options.document;this.trace=options.trace||(()=>{});this.referenceState=options.referenceState||null;this.knownAudio=false;this.audio=initial();this.audioRaw=null;this.audioBlocked=false;this.closed=false;this.cache=new Map();this.pending=new Map();this.ready=Promise.all([this.base.ready,this.loadAudio()]);}
  async loadAudio(){if(!this.io.readAudio)return;try{const raw=await this.io.readAudio(),required=await this.io.audioWitness();if(await this.io.audioIntent()||await this.io.audioTmp()||raw===null&&required||raw!==null&&!required)throw Error('AUDIO_V2_INCOMPLETE');this.audioRaw=raw;if(raw!==null)this.audio=validate(JSON.parse(raw));this.knownAudio=true;}catch(e){this.audioBlocked=true;this.audioError=e.message;this.trace('AUDIO_V2_LOAD_FAILED',String(e.message).slice(0,120));}}
  get data(){return this.base.data;}get blocked(){return this.base.blocked||this.audioBlocked;}get error(){return this.audioError||this.base.error;}
  describe(id){const legacy=this.base.describe(id),d=this.catalog.data.definitions[id],audio=this.audio.markers[id];if(this.audioBlocked&&!this.knownAudio)return legacy?{...legacy,audioID:null,audioUnavailable:true}:null;if(!audio)return legacy;if(!d||d.assetID!==audio.coverAssetID)return null;return {coverAssetID:d.assetID,gifID:legacy?.gifID||null,audioID:audio.audioID,audioV2:true};}
  validateAudio(bytes,name=null){return A.validate(bytes,name,this.document()?.defaultView);}
  audioBytes(url){return A.fromDataURL(url);}
  previewGIF(...args){return this.base.previewGIF(...args);}createGIF(...args){return this.base.createGIF(...args);}
  async checkAudio(id,expected,diagnostic=false){
   this.base.ensure();if(this.closed)throw Error('AUDIO_V2_CLOSED');
   if(await this.catalog.io.readState()!==this.catalog.disk)throw Error('MEDIA_CATALOG_CHANGED');
   if(await this.io.read()!==this.base.raw||await this.io.tmp()||await this.io.intent())throw Error('MEDIA_CHANGED_OR_PENDING');
   const definition=this.catalog.data.definitions[id];if(!definition||JSON.stringify(definition)!==expected)throw Error('AUDIO_V2_DEFINITION_CHANGED');
   const snapshot=await this.catalog.io.safety.snapshot(),refs=snapshot.refs.filter(r=>r.markerID===id);
   if(refs.some(r=>r.assetID!==definition.assetID))throw Error('AUDIO_V2_REFERENCE_IDENTITY');
   let state=null;if(this.referenceState)state=await this.referenceState(diagnostic);
   else if(refs.length)throw Error('AUDIO_V2_REFERENCE_PROVIDER_REQUIRED');
   if(state?.unavailable&&!diagnostic)throw Error('AUDIO_V2_RETAINED_UNAVAILABLE');const records=state?.payload?.records||[];
   if(records.filter(r=>r.markerID===id).some(r=>r.assetID!==definition.assetID))throw Error('AUDIO_V2_SOURCE_IDENTITY');
   return {retainedReferences:refs.length,pageInstances:this.referenceState?records.filter(r=>r.markerID===id).length:null,orphanReservations:this.referenceState?refs.filter(r=>!records.some(p=>p.pingID===r.pingID)).length:null,legacyAssignments:Object.values(this.catalog.data.assignments).filter(r=>r.markerID===id).length,retainedBlocked:state?.unavailable===true,linkCount:state?.linkRecords?state.linkRecords.filter(l=>l.source.record.markerID===id).length:null,linkStatus:state?.linkStatus||'NOT_INSPECTED',mediaPending:await this.io.audioIntent()||await this.io.audioTmp()};
  }
  async referenceSummary(id){await this.ready;return this.catalog.run(()=>this.checkAudio(id,JSON.stringify(this.catalog.data.definitions[id]),true));}
  async bind(id,change,guard=()=>{}){
   if(change.audio===undefined)return this.base.bind(id,change,guard);
   await this.ready;if(this.closed||this.audioBlocked||!this.io.readAudio)throw Error('AUDIO_V2_UNAVAILABLE');
   if(change.gif)throw Error('AUDIO_V2_COMBINED_REPLACEMENT_UNSUPPORTED');
   const expected=JSON.stringify(this.catalog.data.definitions[id]),revision=this.audio.revision;
   const bytes=change.audio===null?null:A.copy(change.audio),info=bytes?await this.validateAudio(bytes,change.audioName||null):null;
   guard();return this.catalog.run(async()=>{
    await this.checkAudio(id,expected);if(this.audio.revision!==revision||await this.io.readAudio()!==this.audioRaw||await this.io.audioTmp()||await this.io.audioIntent())throw Error('AUDIO_V2_CHANGED');
    const d=this.catalog.data.definitions[id],next=JSON.parse(JSON.stringify(this.audio));let hash=null;
    if(bytes){hash=await this.io.audioHash(bytes);if(!HASH.test(hash))throw Error('AUDIO_V2_HASH');next.assets[hash]={ext:info.ext,bytes:bytes.length};}
    next.markers[id]={coverAssetID:d.assetID,audioID:hash};next.revision++;validate(next);guard();
    const token=JSON.stringify({schemaVersion:1,revision:next.revision,markerID:id});let submitted=false;
    try{
     await this.io.audioRequire();await this.io.audioBegin(token);if(bytes)await this.io.writeAudioAsset(hash,info.ext,bytes);
     guard();await this.checkAudio(id,expected);const raw=JSON.stringify(next);
     try{await this.io.audioWrite(raw);}catch(e){if(await this.io.readAudio()!==raw||await this.io.audioTmp())throw e;}
     submitted=true;if(await this.io.readAudio()!==raw||await this.io.audioTmp())throw Error('AUDIO_V2_READBACK');
     await this.io.audioEnd(token);if(await this.io.audioIntent()||await this.io.audioTmp()||await this.io.readAudio()!==raw)throw Error('AUDIO_V2_FINAL_READBACK');
     this.audio=next;this.audioRaw=raw;this.knownAudio=true;this.clearCache();this.trace('AUDIO_V2_COMMITTED');return id;
    }catch(e){this.audioBlocked=true;this.audioError=e.message;const reasonCode=(String(e.message||'').match(/\b(?:AUDIO_V2|MEDIA|MAC|R2|ASSET_SAFETY)_[A-Z0-9_]+\b/)||[])[0]||'UNCLASSIFIED_ERROR';this.trace('AUDIO_V2_COMMIT_UNCERTAIN',reasonCode);throw Object.assign(Error('AUDIO_V2_COMMIT_UNCERTAIN'),{outcome:'UNKNOWN',manifestSubmitted:submitted,cause:e,reasonCode});}
   });
  }
  async prepare(id){await this.ready;if(this.closed)return null;const m=this.describe(id);if(!m)return null;const key=id+JSON.stringify(m);if(this.cache.has(key))return this.cache.get(key);if(this.pending.has(key))return this.pending.get(key);if(this.pending.size>=2)return null;const task=this.prepareFresh(id);this.pending.set(key,task);try{const out=await task;if(this.closed||JSON.stringify(this.describe(id))!==JSON.stringify(m))return null;const bytes=(out?.audio?.length||0)*2;while(this.cache.size>=2||[...this.cache.values()].reduce((n,x)=>n+(x.audio?.length||0)*2,0)+bytes>25165824){const first=this.cache.keys().next().value;if(first===undefined)break;this.cache.delete(first);}if(out&&bytes<=25165824)this.cache.set(key,out);return out;}finally{this.pending.delete(key);}}
  async prepareFresh(id){await this.ready;if(this.closed)return null;const m=this.describe(id);if(!m)return null;const legacy=await this.base.prepare(id),out={...(legacy||{}),key:JSON.stringify(m),gif:legacy?.gif||null,audio:null,audioDuration:0};try{if(m.audioV2&&m.audioID){const meta=this.audio.assets[m.audioID],bytes=await this.io.readAudioAsset(m.audioID,meta.ext);if(bytes.length!==meta.bytes||await this.io.audioHash(bytes)!==m.audioID)throw Error('AUDIO_V2_INTEGRITY');const info=A.inspect(bytes);if(info.ext!==meta.ext)throw Error('AUDIO_V2_FORMAT');out.audio=this.url(bytes,info.mime);out.audioDuration=info.duration;}else if(!m.audioV2&&!m.audioUnavailable&&legacy?.audio){out.audio=legacy.audio;out.audioDuration=A.inspect(A.fromDataURL(legacy.audio)).duration;}}catch(e){this.trace('AUDIO_UNAVAILABLE',String(e.message).slice(0,120));out.audio=null;}return out;}
  url(bytes,mime){const win=this.document()?.defaultView;let str='';for(let i=0;i<bytes.length;i+=8192)for(let j=i;j<Math.min(bytes.length,i+8192);j++)str+=String.fromCharCode(bytes[j]);return 'data:'+mime+';base64,'+win.btoa(str);}
  clearCache(){this.cache.clear();this.base.clearCache();}async close(){this.closed=true;await Promise.allSettled([...this.pending.values()]);this.clearCache();await this.base.close();}diagnostics(){return {...this.base.diagnostics(),audioV2:{blocked:this.audioBlocked,error:this.audioError||null,assets:Object.keys(this.audio.assets).length}};}
 };}
 const api={createClass,validate,initial};if(typeof module!=='undefined')module.exports=api;else scope.SMPingAudioStore=api;
})(this);
