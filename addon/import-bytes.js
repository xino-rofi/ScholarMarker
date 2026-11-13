/* Trusted binary boundaries only. No species constructors, iterators or unwrapping. */
(function(scope){
 'use strict';
 const MAX=2*1024*1024;
 function copy(view){
  const n=view.length;if(!Number.isInteger(n)||n<1||n>MAX)throw Error('Invalid binary length');
  const bytes=new Uint8Array(n);
  for(let i=0;i<n;i++){const value=view[i];if(!Number.isInteger(value)||value<0||value>255)throw Error('Invalid binary byte');bytes[i]=value;}return bytes;
 }
 function fromDataURL(value){
  if(typeof value!=='string'||value.length>MAX*1.4+256)throw Error('Invalid or oversized FileReader result');
  const match=/^data:[a-zA-Z0-9.+/\-]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);if(!match||!match[1].length||match[1].length%4)throw Error('Invalid FileReader encoding');
  const encoded=match[1],padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0,n=encoded.length/4*3-padding;
  if(n<1||n>MAX)throw Error('Invalid image size');const bytes=new Uint8Array(n),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let bits=0,count=0,at=0;
  for(let i=0;i<encoded.length-padding;i++){bits=(bits<<6)|alphabet.indexOf(encoded[i]);count+=6;if(count>=8){count-=8;bytes[at++]=(bits>>>count)&255;}}
  if(at!==n||(bits&((1<<count)-1))!==0)throw Error('Noncanonical base64');return bytes;
 }
 function ascii(bytes,start,end){let value='';for(let i=start;i<end;i++)value+=String.fromCharCode(bytes[i]);return value;}
 const api={copy,fromDataURL,ascii};if(typeof module!=='undefined')module.exports=api;else scope.SMImportBytes=api;
})(this);
