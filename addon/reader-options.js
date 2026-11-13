/* Allocate only primitive observer configuration in the target Reader realm. */
(function(scope){
 'use strict';
 function observerOptions(win,spec){
  if(typeof win.Object!=='function'||typeof win.Array!=='function')throw Error('Reader realm constructors unavailable');
  const result=new win.Object();
  for(const [key,value] of Object.entries(spec)){
   if(Array.isArray(value)){const array=new win.Array();for(const entry of value){if(typeof entry!=='string')throw Error('Unsupported observer option');array.push(entry);}result[key]=array;}
   else {if(typeof value!=='boolean')throw Error('Unsupported observer option');result[key]=value;}
  }
  return result;
 }
 const api={observerOptions};if(typeof module!=='undefined')module.exports=api;else scope.SMReaderOptions=api;
})(this);
