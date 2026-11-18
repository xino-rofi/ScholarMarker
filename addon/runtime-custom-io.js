/* Fixed isolated storage. Assets use internal content-addressed paths only. */
(function(scope){
 'use strict';
 const binary=typeof module!=='undefined'?require('./import-bytes.js'):scope.SMImportBytes;
 const protection=typeof module!=='undefined'?require('./asset-safety.js'):scope.SMAssetSafety;
 const markers=typeof module!=='undefined'?require('./custom-markers.js'):scope.SMCustomMarkers;
 const root=null,state=null;
 function create({Services,Components,Zotero,runtime}){if(!runtime)throw Error('R2_RUNTIME_REQUIRED');const IOUtils=runtime.io,sep=runtime.paths?.separator||String.fromCharCode(92),root=runtime.root+sep+'custom-materials',state=root+sep+'state-v1.json';function guard(){runtime.assertIdentity();}
  function checked(file){guard();if(!file.startsWith(root+sep))throw Error('Outside asset directory');let p=file;while(p.length>(sep==='/'?1:3)){const f=Components.classes['@mozilla.org/file/local;1'].createInstance(Components.interfaces.nsIFile);f.initWithPath(p);if(f.exists()&&f.isSymlink())throw Error('Redirected storage path rejected');p=p.slice(0,p.lastIndexOf(sep));}return file;}
  const safety=protection.create({...protection.createIO({IOUtils,Services,Components,guard,paths:runtime.paths,readBoundedText:runtime.readBoundedText,readBoundedTexts:runtime.readBoundedTexts}),async unlock(){await runtime.releaseOwnLock(runtime.root+sep+'retained-compat-v1'+sep+'mutation.lock');},async catalog(){const p=checked(state);if(!await IOUtils.exists(p)||(await IOUtils.stat(p)).size>3e6)throw Error('ASSET_SAFETY_CATALOG_UNAVAILABLE');return markers.validate(JSON.parse(await IOUtils.readUTF8(p)));}});
  const asset=relative=>{if(!/^assets\/[a-f0-9]{64}\.(png|webp)$/.test(relative))throw Error('Invalid internal asset reference');return checked(root+sep+relative.split('/').join(sep));};
  async function dirs(){checked(state);await IOUtils.makeDirectory(root,{ignoreExisting:true});checked(state);await IOUtils.makeDirectory(root+sep+'assets',{ignoreExisting:true});}
  return {safety,readState(){return runtime.readBoundedText(checked(state),3e6,'Custom state too large');},async writeState(text){await dirs();const p=checked(state);checked(p+'.tmp');await IOUtils.writeUTF8(p,text,{tmpPath:p+'.tmp',flush:true});},
   async readAsset(relative){const p=asset(relative),info=await IOUtils.stat(p);if(info.size>2*1024*1024)throw Error('Oversized asset');return binary.copy(await IOUtils.read(p));},
   async writeAsset(relative,bytes){bytes=binary.copy(bytes);await dirs();const p=asset(relative);if(await IOUtils.exists(p)){if((await IOUtils.stat(p)).size>2*1024*1024)throw Error('Existing asset too large; preserved');const existing=binary.copy(await IOUtils.read(p));if(existing.length!==bytes.length||existing.some((n,i)=>n!==bytes[i]))throw Error('Existing asset differs; preserved');return;}checked(p+'.tmp');await IOUtils.write(p,bytes,{tmpPath:p+'.tmp',flush:true});},async removeAsset(relative,ticket){const p=asset(relative);await safety.assertTicket(ticket,relative.slice(7,71));await IOUtils.remove(p);},
   async hash(bytes){bytes=binary.copy(bytes);guard();const hash=Components.classes['@mozilla.org/security/hash;1'].createInstance(Components.interfaces.nsICryptoHash);hash.init(hash.SHA256);hash.update(bytes,bytes.length);return [...hash.finish(false)].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');},id(){guard();return 'm-'+Services.uuid.generateUUID().toString().replace(/[{}-]/g,'').toLowerCase();}};
 }
 function decode(doc,bytes,mime){
  return new Promise((resolve,reject)=>{const win=doc.defaultView,image=new win.Image();let text='';for(let i=0;i<bytes.length;i+=8192)text+=binary.ascii(bytes,i,Math.min(bytes.length,i+8192));const url='data:'+mime+';base64,'+win.btoa(text);
   const finish=(error)=>{win.clearTimeout(timer);const width=image.naturalWidth,height=image.naturalHeight;image.onload=image.onerror=null;image.removeAttribute('src');if(error)reject(error);else if(!width||!height)reject(Error('Image decoding failed'));else resolve({url,width,height});};
   const timer=win.setTimeout(()=>finish(Error('Image decode timeout')),10000);image.onload=()=>finish();image.onerror=()=>finish(Error('Image decoding failed'));image.src=url;
  });
 }
 const api={create,decode,root};if(typeof module!=='undefined')module.exports=api;else scope.SMCustomIO=api;
})(this);
