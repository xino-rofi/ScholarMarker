/* Local overlay data only. Coordinates are PDF-space offsets of the icon center. */
(function(scope){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 function identity(id){if(!id||!Number.isInteger(id.libraryID)||id.libraryID<1||!['attachmentKey','annotationKey'].every(k=>/^[A-Z0-9]{8}$/.test(id[k])))throw Error('Invalid stable annotation identity');return id.libraryID+'/'+id.attachmentKey+'/'+id.annotationKey;}
 function validate(value){
  if(value?.schemaVersion!==1||value.units!=='pdf-user-space'||!value.positions||typeof value.positions!=='object'||Object.keys(value).sort().join(',')!=='positions,schemaVersion,units'||Array.isArray(value.positions)||Object.keys(value.positions).length>10000)throw Error('Unsupported position schema');
  for(const [key,p] of Object.entries(value.positions))if(!/^[1-9]\d*\/[A-Z0-9]{8}\/[A-Z0-9]{8}$/.test(key)||!p||Object.keys(p).sort().join(',')!=='offsetPDF,pageIndex'||!Number.isInteger(p.pageIndex)||p.pageIndex<0||p.pageIndex>1000000||!Array.isArray(p.offsetPDF)||p.offsetPDF.length!==2||!p.offsetPDF.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e7))throw Error('Invalid position record');
  return value;
 }
 class Store{
  constructor(io){this.io=io;this.data={schemaVersion:1,units:'pdf-user-space',positions:{}};this.blocked=false;this.closed=false;this.error='';this.tail=Promise.resolve();this.ready=this.load();}
  async load(){try{const text=await this.io.read();this.diskText=text;if(text!==null){if(typeof text!=='string'||text.length>2e6)throw Error('Position file too large');this.data=validate(JSON.parse(text));}}catch(e){this.blocked=true;this.error=e.message;}}
  ensure(){if(this.blocked||this.closed)throw Error('Position storage unavailable: '+this.error);}
  get(id,pageIndex){this.ensure();const p=this.data.positions[identity(id)];return p&&p.pageIndex===pageIndex?clone(p):null;}
  update(id,value,guard=()=>{}){
   const key=identity(id);
   const run=async()=>{
    await this.ready;this.ensure();guard();const next=clone(this.data);
    if(value===null)delete next.positions[key];else next.positions[key]=clone(value);validate(next);
    if(JSON.stringify(next)===JSON.stringify(this.data))return 'Already reset';
    const before=JSON.stringify(this.data);let written=false;
    try{guard();if(await this.io.read()!==this.diskText)throw Error('Position file changed externally; preserved');await this.io.writeAtomic(JSON.stringify(next));written=true;guard();this.data=next;this.diskText=JSON.stringify(next);return value===null?'Position reset':'Position saved';}
    catch(e){if(written){try{await this.io.writeAtomic(before);this.diskText=before;}catch(recovery){this.blocked=true;this.error='Rollback failed: '+recovery.message;throw Error(this.error);}}else{this.blocked=true;this.error=e.message;}throw e;}
   };
   const p=this.tail.then(run);this.tail=p.catch(()=>{});return p;
  }
  remove(id,guard){return this.update(id,null,guard);}
  async close(){this.closed=true;await this.ready;await this.tail;}
 }
 const api={Store,identity,validate};if(typeof module!=='undefined')module.exports=api;else scope.SMPositions=api;
})(this);
