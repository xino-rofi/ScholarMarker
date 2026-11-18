const {test}=require('node:test');
const assert=require('node:assert/strict');
const limits=require('../addon/ping-capacity.js');
const retained=require('../addon/retained-store.js');
const safety=require('../addon/asset-safety.js');
const link=require('../addon/pinglink-store.js');

const id=n=>'12345678-1234-1234-1234-'+String(n).padStart(12,'0');
const epoch=id(0);
const markerID='m-'+'1'.repeat(32),assetID='a'.repeat(64);
function record(n,attachmentKey='PDF00001'){
  return {pingID:id(n),libraryID:1,attachmentKey,pageIndex:n%200,pointPDF:[20,30],
    viewBox:[0,0,200,200],markerID,assetID,createdAt:1,revision:0};
}
const payload=records=>({schemaVersion:1,epoch,revision:0,records});
const registry=records=>({schemaVersion:1,epoch,revision:0,refs:records.map(retained.refOf)});

test('one PDF accepts 100 Pings, and one profile accepts 300',()=>{
  assert.deepEqual(limits,{perPDF:100,perProfile:300});
  const records=Array.from({length:300},(_,n)=>record(n+1,'PDF0000'+(1+Math.floor(n/100))));
  assert.equal(retained.validate(payload(records),epoch).records.length,300);
  assert.equal(retained.validate(payload(records.slice(0,20)),epoch).records.length,20);
  assert.equal(safety.registry(JSON.stringify(registry(records)),epoch).refs.length,300);
  assert.throws(()=>retained.validate(payload([...records.slice(0,100),record(301)]),epoch),/RETAINED_PDF_LIMIT/);
  assert.throws(()=>retained.validate(payload([...records,record(301,'PDF00004')]),epoch),/RETAINED_PAYLOAD_INVALID/);
  assert.throws(()=>safety.registry(JSON.stringify(registry([...records,record(301,'PDF00004')])),epoch),/ASSET_SAFETY_REGISTRY_INVALID/);
  const links=records.map(r=>({linkID:r.pingID,linkVersion:1,source:{epoch,record:r},target:{
    libraryID:1,attachmentKey:r.attachmentKey,annotationKey:'NOTE1234',itemID:1,type:'highlight',
    saved:true,editable:true,deleted:false,position:{pageIndex:r.pageIndex,rects:[[0,0,10,10]]}
  },offset:[20,20],createdAt:1,updatedAt:1}));
  assert.equal(link.state({schemaVersion:1,revision:0,links}).links.length,300);
});

test('creation saves number 100 and rejects number 101 without writing',async()=>{
  const records=Array.from({length:99},(_,n)=>record(n+1));
  const files=new Map([
    ['payload-v1.json',JSON.stringify(payload(records))],
    ['references-v1.json',JSON.stringify(registry(records))]
  ]);
  let writes=0,nextID=999;
  const io={
    id:()=>id(nextID++),
    async exists(name){return files.has(name);},
    async read(name){return files.get(name)??null;},
    async write(name,value){writes++;files.set(name,value);}
  };
  const catalog={ready:Promise.resolve(),disk:'catalog',run:task=>task(),
    data:{definitions:{[markerID]:{assetID}},assets:{[assetID]:{}}},
    io:{readState:async()=> 'catalog',safety:{
      assertHeld(){},
      async snapshot(){
        const value=JSON.parse(files.get('references-v1.json'));
        return {state:'RETAINED_V1_VERIFIED',...value};
      }
    }}
  };
  const store=new retained.Store({io,catalog});
  const spec=record(700);
  await store.create(spec);
  assert.equal(store.list(spec).length,100);
  assert.equal(writes,2);
  await assert.rejects(store.create(spec),/RETAINED_PDF_LIMIT/);
  assert.equal(writes,2);
});
