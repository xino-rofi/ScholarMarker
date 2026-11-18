const {test}=require('node:test');
const assert=require('node:assert/strict');
const Transient=require('../addon/transient-ping.js');
const Retained=require('../addon/retained-view.js');

function readerDocument(uri){
  let nextTimer=0;
  const animations=[];
  const frames=new Map();
  const doc=events({documentURI:uri,hasFocus:()=>true,querySelector:()=>null});
  function events(target){
    const listeners=new Map();
    return Object.assign(target,{
      addEventListener(type,fn){listeners.set(type,[...(listeners.get(type)||[]),fn]);},
      removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(f=>f!==fn));},
      fire(type,event){for(const fn of listeners.get(type)||[])fn(event);}
    });
  }
  function node(){
    const attrs=new Map();
    return events({
      style:{},dataset:{},children:[],ownerDocument:doc,isConnected:false,
      setAttribute(name,value){attrs.set(name,value);},
      getAttribute:name=>attrs.get(name),
      removeAttribute(name){attrs.delete(name);},
      append(child){this.children.push(child);child.parentNode=this;child.isConnected=true;},
      remove(){this.isConnected=false;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);},
      animate(keyframes,options){
        const host=this.parentNode;
        animations.push({preset:host?.getAttribute('data-sm-ping-animation'),style:{...host?.style},duration:options.duration});
        return {cancel(){},finished:new Promise(()=>{})};
      }
    });
  }
  class Observer{observe(){}unobserve(){}disconnect(){}}
  doc.createElement=node;
  doc.body=doc.documentElement=node();
  doc.body.isConnected=true;
  doc.defaultView=events({
    Array,Object,ResizeObserver:Observer,MutationObserver:Observer,
    matchMedia:()=>({matches:false}),
    setTimeout:()=>++nextTimer,
    clearTimeout(){},
    requestAnimationFrame(fn){frames.set(++nextTimer,fn);return nextTimer;},
    cancelAnimationFrame(id){frames.delete(id);}
  });
  return {doc,node,animations,render(){const current=[...frames.values()];frames.clear();for(const frame of current)frame();}};
}
const identity={libraryID:1,attachmentKey:'PDF12345'};
const material={kind:'custom',markerID:'sample',assetID:'checksum',name:'Sample',url:'data:image/png;base64,AA=='};
const record={...identity,pingID:'first',pageIndex:0,pointPDF:[40,50],viewBox:[0,0,100,100],markerID:material.markerID,assetID:material.assetID};

test('temporary shortcut uses each material preset, and none still plays its media',async()=>{
  const {doc}=readerDocument('resource://zotero/reader/pdf/web/viewer.html');
  const owner=readerDocument('resource://zotero/reader/reader.html');
  const target={closest:()=>target,getAttribute:()=>'1'};
  doc.getElementById=()=>target;
  doc.elementFromPoint=()=>target;
  const meta={page:target,pageIndex:0,width:100,height:100,origin:[0,0],frame:{x:0,y:0},center:[50,50],local:[50,50]};
  let preset='spin',plays=0,now=1000;
  const engine=Transient.create({
    page:{same:(a,b)=>a===b,frame(){},check(){},point:()=>meta},
    geometry:{inverse:p=>p},version:'10.0.8',now:()=>now,
    resolveShortcut:()=>material,loadMaterial:async()=>material,
    animationPreset:item=>{assert.equal(item.markerID,material.markerID);return preset;},
    playMaterial:()=>{plays++;}
  });
  assert.equal(engine.mount({doc,owner:owner.doc,identity,generation:1,validate(){},conflict:()=>false}),true);
  async function press(){
    doc.defaultView.fire('pointermove',{target,isTrusted:true,pointerType:'mouse',buttons:0,clientX:50,clientY:50});
    doc.defaultView.fire('keydown',{key:'P'});
    await new Promise(resolve=>setImmediate(resolve));
    now+=1000;
  }
  await press();
  assert.equal(owner.animations[0]?.preset,'spin');
  assert.equal(owner.animations[0]?.duration,800);
  preset='none';
  await press();
  assert.equal(plays,2);
  assert.equal(owner.animations.length,1);
  engine.stop();
  assert.equal(engine.diagnostics().pings,0);
});

test('retained placement animates once at the final position, while loading a saved Ping is quiet',async()=>{
  const reader=readerDocument('resource://zotero/reader/pdf/web/viewer.html');
  const pageNode=reader.node();
  reader.doc.body.append(pageNode);
  reader.doc.getElementById=()=>({querySelector:()=>pageNode});
  const page={same:(a,b)=>a===b,read:()=>({cropBox:record.viewBox,width:100,height:100}),check(){}};
  let plays=0;
  const view=Retained.layer({
    doc:reader.doc,owner:reader.doc,identity,validate(){},
    store:()=>({list:()=>[record],get:()=>record}),
    page,geometry:{project:p=>p},version:'10.0.8',
    loadMaterial:async()=>material,validMaterial:()=>true,
    pdfDisplaySize:()=>48,animationPreset:()=> 'shake',replay:()=>{plays++;}
  });
  reader.render();
  await new Promise(resolve=>setImmediate(resolve));
  reader.render();
  assert.equal(reader.animations.length,0);
  assert.equal(plays,0);
  view.playOnPlacement(record.pingID);
  reader.render();
  assert.equal(reader.animations[0]?.preset,'shake');
  assert.equal(reader.animations[0]?.style.left,'16px');
  assert.equal(reader.animations[0]?.style.top,'26px');
  view.schedule();
  reader.render();
  assert.equal(reader.animations.length,1);
  assert.equal(plays,1);
  view.dispose();
});
