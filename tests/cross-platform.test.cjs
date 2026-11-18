const {test}=require('node:test');
const assert=require('node:assert/strict');
const shortcuts=require('../addon/ping-shortcuts.js');
const platform=require('../addon/runtime-platform.js');
const bindings=require('../addon/runtime-bindings.js');
const cardCommands=require('../addon/ping-card-commands.js');
const identity=require('../identity.json');

test('new shortcuts and existing binding formats both work',()=>{
  let raw;
  const store=new shortcuts.Store(()=>raw,(_,value)=>{raw=value;});
  const definitions=['1','2'].map(n=>({id:'m-'+n.repeat(32)}));
  store.bind(definitions[0].id,'Ctrl+KeyJ',definitions);
  const combination=shortcuts.fromEvent({metaKey:true,altKey:true,code:'KeyS',key:'s'});
  assert.equal(combination,'Alt+Meta+KeyS');
  store.bind(definitions[1].id,combination,definitions);
  assert.deepEqual(store.list(definitions).map(b=>b.chord),['Ctrl+KeyJ','Alt+Meta+KeyS']);
  assert.equal(shortcuts.fromEvent({code:'KeyA',key:'a'}),'KeyA');
  assert.throws(()=>shortcuts.fromEvent({code:'KeyA',key:'a',isComposing:true}),/SHORTCUT_UNSUPPORTED/);
});

test('actual Zotero key bindings use the platform accelerator',()=>{
  const doc={querySelectorAll:()=>[{getAttribute:k=>({key:'A',modifiers:'accel shift'})[k]}]};
  assert.equal(shortcuts.nativeConflict('KeyA',doc,'WINNT'),null);
  assert.equal(shortcuts.nativeConflict('Ctrl+Shift+KeyA',doc,'WINNT'),'SHORTCUT_NATIVE_CONFLICT');
  assert.equal(shortcuts.nativeConflict('Ctrl+Shift+KeyA',doc,'Darwin'),null);
  assert.equal(shortcuts.nativeConflict('Shift+Meta+KeyA',doc,'Darwin'),'SHORTCUT_NATIVE_CONFLICT');
});

test('the supported host range follows Zotero 10.0 patch updates',()=>{
  const allows=(os,host)=>platform.allows(identity,{os,host});
  assert.equal(allows('WINNT','10.0.8'),true);
  assert.equal(allows('Darwin','10.0.9'),true);
  assert.equal(allows('Darwin','10.0.10'),true);
  assert.equal(allows('WINNT','10.0.12'),true);
  assert.equal(allows('WINNT','10.0.7'),false);
  assert.equal(allows('Darwin','10.0.8'),false);
  assert.equal(allows('Darwin','11.0.0'),false);
  assert.equal(allows('Linux','10.0.10'),false);
});

test('ordinary move runs one preflight before any store access and records timing',async()=>{
  const calls=[];
  class Store{
    async inspect(){calls.push('inspect');return {status:'UNLINKED'};}
    diagnostics(){return {};}
    async close(){}
  }
  const scope={
    SMCustomMarkers:{Store:class{}},
    SMRetainedStore:{Store:class{}},
    SMPingMedia:{Store:class{}},
    SMPingCardCommands:{create:cardCommands.create}
  };
  const runtime={
    async preflight(kind){calls.push('preflight:'+kind);},
    async guardTask(kind,task){calls.push('guard:'+kind);return task();}
  };
  bindings.install(scope,runtime);
  const source={record:{revision:1}};
  const commands=scope.SMPingCardCommands.create({
    io:{id:()=>1,prepare:kind=>runtime.preflight(kind)},
    host:{async readPing(){calls.push('read');return source;}},
    Store,
    writeScope:()=>true
  });
  const result=await commands.submit({kind:'MOVE',source,fallback:async()=>calls.push('move')});
  assert.equal(result.outcome,'CONFIRMED');
  assert.deepEqual(calls,['guard:MOVE','preflight:MOVE','read','inspect','move']);
  assert.ok(commands.diagnostics().history.some(x=>x.stage==='PREFLIGHT_COMPLETE'&&x.durationMs>=0));
  await commands.close();
});

test('namespace batches admission but probes all candidates and still requires consent',async()=>{
  const Admission=require('../addon/runtime-admission.js');
  const profile=String.raw`C:\Profile`;
  const data=String.raw`C:\Data`;
  const root=profile+'\\scholarmarker';
  const owner=root+'\\owner-v1.json';
  const phase=root+'\\initialization-v1.json';
  const directory=root+'\\pinglinks-v1';
  const instanceID='12345678-1234-1234-1234-123456789abc';
  const ownership={
    schemaVersion:1,policyVersion:1,id:identity.id,instanceID,
    profile,data,profileObject:profile,dataObject:data,rootObject:root,enabled:true,generation:1
  };
  const stored=new Map([
    [owner,JSON.stringify(ownership)],
    [phase,JSON.stringify({schemaVersion:1,state:'COMMITTED',instanceID})]
  ]);
  const candidates=['links-v1.json','interrupted.json.tmp'];
  let ownerReads=0,unsafe=null;
  const probes=[];
  const runtime=Admission.create({
    identity,
    host:()=>({id:identity.id,version:identity.version,host:'10.0.8',os:'WINNT',active:true,profile,data}),
    uuid:()=>instanceID,
    files:{
      async read(path){if(path===owner)ownerReads++;return stored.get(path)??null;},
      async exists(path){return stored.has(path);},
      io:{async exists(path){return stored.has(path);},async stat(path){return {type:'regular',size:stored.get(path).length};},async readUTF8(path){return stored.get(path);}}
    },
    probe:{
      async object(path){return path;},
      async path(path){probes.push(path);if(path===unsafe)throw Error('R2_PATH_REDIRECT');}
    }
  });
  assert.deepEqual(await runtime.checkNamespace(directory,candidates),{directory:false,hasFile:false});
  stored.set(directory,'directory');
  assert.deepEqual(await runtime.checkNamespace(directory,candidates),{directory:true,hasFile:false});
  stored.set(directory+'\\'+candidates[0],'data');
  probes.length=0;
  ownerReads=0;
  assert.deepEqual(await runtime.checkNamespace(directory,candidates),{directory:true,hasFile:true});
  assert.equal(ownerReads,1);
  assert.deepEqual(probes.slice(-2),candidates.map(name=>directory+'\\'+name));
  const path=directory+'\\'+candidates[0];
  ownerReads=0;
  assert.equal(await runtime.readBoundedText(path,100,'TOO_LARGE'),'data');
  assert.equal(ownerReads,1);
  await assert.rejects(runtime.readBoundedText(path,1,'TOO_LARGE'),/TOO_LARGE/);
  const tempPath=path+'.tmp';
  ownerReads=0;
  assert.equal(await runtime.readBoundedText(path,100,'TOO_LARGE',{tempPath}),'data');
  assert.equal(ownerReads,1);
  ownerReads=0;
  assert.deepEqual(await runtime.readBoundedTexts([{path,tempPath},{path:tempPath,tempPath:tempPath+'.tmp'}],100,'TOO_LARGE','INCOMPLETE'),['data',null]);
  assert.equal(ownerReads,1);
  stored.set(tempPath,'incomplete');
  await assert.rejects(runtime.readBoundedTexts([{path,tempPath}],100,'TOO_LARGE','INCOMPLETE'),/INCOMPLETE/);
  await assert.rejects(runtime.readBoundedText(path,100,'TOO_LARGE',{tempPath}),/LINK_UNFINISHED_TEMP/);
  stored.delete(tempPath);
  unsafe=directory+'\\'+candidates[1];
  await assert.rejects(runtime.checkNamespace(directory,candidates),/R2_PATH_REDIRECT/);
  stored.set(owner,JSON.stringify({...ownership,enabled:false}));
  await assert.rejects(runtime.checkNamespace(directory,candidates),/R2_CONSENT_REQUIRED/);
});

test('LINK performs one preflight and stops before any source read when admission fails',async()=>{
  const calls=[];
  const scope={
    SMCustomMarkers:{Store:class{}},
    SMRetainedStore:{Store:class{}},
    SMPingMedia:{Store:class{}},
    SMPingCardCommands:{create:cardCommands.create}
  };
  const runtime={
    async preflight(kind){calls.push('preflight:'+kind);throw Error('R2_PENDING_OR_UNKNOWN');},
    async guardTask(kind,task){calls.push('guard:'+kind);return task();}
  };
  bindings.install(scope,runtime);
  const commands=scope.SMPingCardCommands.create({
    io:{id:()=>1,prepare:kind=>runtime.preflight(kind)},
    host:{async readPing(){calls.push('source');}},
    Store:class{},
    writeScope:()=>true
  });
  await assert.rejects(commands.submit({source:{record:{revision:1}}}),/R2_PENDING_OR_UNKNOWN/);
  assert.deepEqual(calls,['guard:LINK','preflight:LINK']);
});

test('Link Store still refuses a journal write that cannot be read back exactly',async()=>{
  const {Store}=require('../addon/pinglink-store.js');
  const calls=[];
  const store=new Store({
    host:{},
    io:{
      digest:()=>'',withLock:fn=>fn(),
      async writeAtomic(){calls.push('write');},
      async exists(){calls.push('temporary');return false;},
      async read(){calls.push('read');return 'different';}
    }
  });
  await assert.rejects(store.write('intent-v1.json','expected'),error=>error.outcome==='UNKNOWN');
  assert.deepEqual(calls,['write','temporary','read','temporary','read']);
});

test('batch deletion refreshes once and reports only committed rows',async()=>{
  const {create}=require('../addon/ping-batch-delete.js');
  const calls=[];
  const records=['a','b','c'].map(pingID=>({pingID,revision:0}));
  const service=create({
    validate(){},
    async reload(){calls.push('reload');},
    list:()=>records,
    async inspectMany(records){calls.push('inspect:'+records.map(record=>record.pingID).join(','));return records.map(()=>({status:'UNLINKED'}));},
    async remove(record,guard){
      guard();
      calls.push('delete:'+record.pingID);
      if(record.pingID==='b')throw Object.assign(Error('cannot confirm'),{outcome:'UNKNOWN'});
      return {outcome:'CONFIRMED',operationID:'1'};
    },
    changed(){calls.push('refresh');}
  });
  await service.refresh();
  service.selectAll(true);
  const result=await service.execute({
    trusted:true,
    confirm:async total=>total===3,
    progress:(count,total,id)=>calls.push('progress:'+count+'/'+total+':'+id)
  });
  assert.deepEqual(calls,['reload','inspect:a,b,c','delete:a','progress:1/3:a','delete:b','refresh']);
  assert.deepEqual(service.snapshot().rows.map(row=>row.record.pingID),['b','c']);
  assert.equal(result.success,1);
  assert.equal(result.failed,1);
  assert.equal(result.unexecuted,1);
  assert.equal(result.items[1].outcome,'UNKNOWN');
});

test('batch command still rejects a changed or unverified relationship before removal',async()=>{
  const calls=[];
  const source={record:{revision:1}};
  const commands=cardCommands.create({
    io:{id:()=>1,async prepare(){calls.push('preflight');}},
    host:{async readPing(){calls.push('read');return source;}},
    Store:class{
      async inspect(){calls.push('inspect');return {status:'TARGET_UNAVAILABLE'};}
      async removePing(){calls.push('remove');}
    },
    writeScope:()=>true
  });
  await assert.rejects(commands.submit({kind:'DELETE',source,batchGuard:()=>calls.push('guard')}),/BATCH_STORE_UNVERIFIABLE/);
  assert.deepEqual(calls,['preflight','read','inspect','guard']);
});

test('batch checks the disk record without treating object key order as a change',async()=>{
  const selected={epoch:'epoch',record:{revision:3,pointPDF:[1,2]}};
  let live={epoch:'epoch',record:{pointPDF:[1,2],revision:3}};
  const commands=cardCommands.create({
    io:{id:()=>1},
    host:{async readPing(){return live;},async referencesReleased(){return true;}},
    Store:class{
      async inspect(){return {status:'UNLINKED'};}
      async removePing(source){
        assert.deepEqual(Object.keys(source.record),Object.keys(live.record));
        live=null;
        return {outcome:'CONFIRMED'};
      }
    },
    writeScope:()=>true
  });
  await assert.rejects(commands.submit({
    kind:'DELETE',source:{...selected,record:{...selected.record,revision:2}},batchGuard:()=>{}
  }),/BATCH_SOURCE_REVISION_CHANGED/);
  await assert.rejects(commands.submit({
    kind:'DELETE',source:{...selected,record:{...selected.record,pointPDF:[2,1]}},batchGuard:()=>{}
  }),/BATCH_SOURCE_RECORD_CHANGED/);
  assert.equal((await commands.submit({kind:'DELETE',source:selected,batchGuard:()=>{}})).outcome,'CONFIRMED');
});

test('retained state uses the registry verified under the catalog lock',async()=>{
  const {Store}=require('../addon/retained-store.js');
  const epoch='12345678-1234-1234-1234-123456789abc';
  const seen=[];
  const io={
    async exists(){return false;},
    async read(name){seen.push(name);return JSON.stringify({schemaVersion:1,epoch,revision:3,records:[]});}
  };
  const safety={assertHeld(){},async snapshot(){return {state:'RETAINED_V1_VERIFIED',epoch,revision:7,refs:[]};}};
  const store=new Store({io,catalog:{
    ready:Promise.resolve(),
    io:{safety},
    run:task=>task()
  }});
  await store.ready;
  const state=await store.state();
  assert.deepEqual(state.refs,{schemaVersion:1,epoch,revision:7,refs:[]});
  assert.deepEqual(seen,['payload-v1.json','payload-v1.json']);
});

test('production deletion verification checks Ping and references in one locked snapshot',async()=>{
  const {create}=require('../addon/pinglink-gecko-host.js');
  const record={pingID:'ping',libraryID:1,attachmentKey:'PDF12345'};
  const source={epoch:'epoch',record};
  const state={payload:{epoch:'epoch',records:[]},refs:{epoch:'epoch',refs:[record]}};
  let locks=0,snapshots=0;
  const host=create({
    Zotero:{},guard(){},
    customStore:{async run(fn){locks++;return fn();}},
    retained:{async state(){snapshots++;return state;}}
  });
  assert.deepEqual(await host.readDeletionState(source),{pingExists:false,referencesReleased:false});
  assert.equal(locks,1);
  assert.equal(snapshots,1);
  state.refs.refs=[];
  assert.deepEqual(await host.readDeletionState(source),{pingExists:false,referencesReleased:true});
  state.payload.epoch='other-epoch';
  await assert.rejects(host.readDeletionState(source),/LINK_HOST_EPOCH/);
});

test('durable link, move and delete confirm under the transaction lock',async()=>{
  const {Store}=require('../addon/pinglink-store.js');
  const {createHash}=require('node:crypto');
  const id='12345678-1234-1234-1234-123456789abc';
  const source={epoch:id,record:{
    pingID:id,libraryID:1,attachmentKey:'PDF12345',pageIndex:0,
    pointPDF:[30,40],viewBox:[0,0,100,100],markerID:'m-'+'1'.repeat(32),
    assetID:'a'.repeat(64),createdAt:1,revision:0
  }};
  const target={libraryID:1,attachmentKey:'PDF12345',annotationKey:'NOTE1234',itemID:1,position:{
    pageIndex:0,rects:[[10,10,20,20]]
  },type:'highlight',saved:true,editable:true,deleted:false};
  const files=new Map();
  let live=source,held=false,locks=0,reads=0,dropReferences=true,deletionReads=0;
  const io={
    id:()=>id,
    digest:text=>createHash('sha256').update(text).digest('hex'),
    async withLock(fn){assert.equal(held,false);held=true;locks++;try{return await fn();}finally{held=false;}},
    async exists(name){assert.ok(held);return files.has(name);},
    async read(name){assert.ok(held);return files.get(name)??null;},
    async writeAtomic(name,text){assert.ok(held);files.set(name,text);},
    async removeIntent(){assert.ok(held);files.delete('intent-v1.json');}
  };
  const store=new Store({io,authorize:()=>true,host:{
    async readPing(){assert.ok(held);reads++;return live;},
    async readPings(sources){assert.ok(held);reads++;return sources.map(()=>live);},
    async readAnnotation(){assert.ok(held);return target;},
    async move(_,after){assert.ok(held);live=after;},
    async remove(){assert.ok(held);live=null;return dropReferences?{outcome:'DELETED',verified:true}:undefined;},
    async readDeletionState(){assert.ok(held);deletionReads++;return {pingExists:live!==null,referencesReleased:dropReferences};}
  }});
  const linked=await store.link(source,target);
  assert.equal(linked.commitVerified,true);
  assert.equal(files.has('intent-v1.json'),false);
  assert.equal(reads,2);
  const moved=await store.move(source,1,[31,41]);
  assert.equal(moved.commitVerified,true);
  assert.deepEqual(moved.source.record.pointPDF,[31,41]);
  const oldLocks=locks,oldReads=reads;
  assert.deepEqual((await store.inspectMany([moved.source,moved.source])).map(x=>x.status),['AVAILABLE','AVAILABLE']);
  assert.equal(locks,oldLocks+1);
  assert.equal(reads,oldReads+1);
  const deleted=await store.removePing(moved.source,2);
  assert.equal(deleted.commitVerified,true);
  assert.equal(deletionReads,1);
  assert.equal(files.has('intent-v1.json'),false);
  assert.deepEqual(await store.inspect(moved.source),{status:'UNLINKED'});

  live=source;
  dropReferences=false;
  await assert.rejects(store.removePing(source),error=>error.outcome==='PARTIAL');
  assert.equal(files.has('intent-v1.json'),true);
  assert.equal(store.blocked,true);
  assert.equal(deletionReads,2);
});

test('journal verifies writes through the targeted read and reconciles through the full read',async()=>{
  const {Store}=require('../addon/pinglink-store.js');
  const calls=[];
  let stored=null,verifyWorks=true;
  const store=new Store({
    host:{},
    io:{
      digest:()=>'',withLock:fn=>fn(),
      async writeAtomic(name,text){stored=text;calls.push('write:'+name);},
      async verifyWrittenFile(name){calls.push('verify:'+name);return verifyWorks?stored:'mismatch';},
      async exists(name){calls.push('exists:'+name);return false;},
      async read(name){calls.push('read:'+name);return stored;},
      async removeIntent(){stored=null;calls.push('remove');}
    }
  });
  await store.write('intent-v1.json','current');
  await store.clearIntent();
  assert.deepEqual(calls,['write:intent-v1.json','verify:intent-v1.json','remove','verify:intent-v1.json']);
  calls.length=0;
  verifyWorks=false;
  await store.write('backup-v1.json','reconciled');
  assert.deepEqual(calls,['write:backup-v1.json','verify:backup-v1.json','exists:backup-v1.json.tmp','read:backup-v1.json']);
});

test('grouped transaction reads preserve backup, missing-primary and recovery checks',async()=>{
  const {Store}=require('../addon/pinglink-store.js');
  const {createHash}=require('node:crypto');
  const calls=[];
  let entries;
  const store=new Store({host:{},io:{
    digest:text=>createHash('sha256').update(text).digest('hex'),
    withLock:fn=>fn(),
    async readLockedFiles(names){calls.push(names);return entries;},
    async exists(){return false;}
  }});
  const initial=store.pack({schemaVersion:1,revision:0,links:[]});
  const backup=store.pack({present:false,text:null});
  entries=[null,backup,initial];
  assert.deepEqual(await store.ready(true),{raw:initial,value:{schemaVersion:1,revision:0,links:[]}});
  assert.deepEqual(calls,[['intent-v1.json','backup-v1.json','links-v1.json']]);
  entries=[null,backup,null];
  await assert.rejects(store.ready(true),/LINK_PRIMARY_MISSING/);
  entries=[null,'corrupt',initial];
  await assert.rejects(store.ready(true),/LINK_FILE_CORRUPT/);
  entries=['pending',backup,initial];
  await assert.rejects(store.ready(true),/LINK_RECOVERY_REQUIRED/);
});
