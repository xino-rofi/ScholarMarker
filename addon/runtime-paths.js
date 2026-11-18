/* Lexical namespace operations only; native object validation remains mandatory. */
(function(scope){'use strict';
function create(os){if(!['WINNT','Darwin'].includes(os))throw Error('R2_PATH_PLATFORM');const separator=os==='WINNT'?'\\':'/',minimum=os==='WINNT'?3:1;
 function absolute(value){if(typeof value!=='string'||!value||value.includes('\0'))throw Error('R2_PATH_UNSUPPORTED');if(os==='WINNT'){if(!/^[A-Z]:\\/.test(value)||value.includes('/')||value.slice(2).includes(':')||value.includes('~'))throw Error('R2_PATH_UNSUPPORTED');}else if(!value.startsWith('/')||value.includes('\\')||value.includes(':')||value.includes('//'))throw Error('R2_PATH_UNSUPPORTED');const parts=value.slice(minimum).split(separator);if(value.length>minimum&&parts.some(v=>!v||v==='.'||v==='..'||/[. ]$/.test(v)))throw Error('R2_PATH_UNSUPPORTED');return value;}
 function within(value,base){absolute(value);absolute(base);return value===base||value.startsWith(base.endsWith(separator)?base:base+separator);}
 function join(base,...parts){absolute(base);for(const s of parts)if(typeof s!=='string'||!s||/[\\/\0:]/.test(s)||s==='.'||s==='..'||/[. ]$/.test(s))throw Error('R2_RESOURCE_PATH');return absolute(base+(base.endsWith(separator)?'':separator)+parts.join(separator));}
 function parent(value){absolute(value);if(value.length===minimum)return null;const at=value.lastIndexOf(separator);return at<minimum?value.slice(0,minimum):value.slice(0,at);}
 function basename(value){absolute(value);return value.slice(value.lastIndexOf(separator)+1);}
 function relative(value,base){if(!within(value,base)||value===base)throw Error('R2_OUTSIDE_RESOURCE');return value.slice(base.length+(base.endsWith(separator)?0:1));}
 return {separator,minimum,absolute,within,join,parent,basename,relative};
}
const api={create};if(typeof module!=='undefined')module.exports=api;else scope.SMRuntimePaths=api;
})(this);
