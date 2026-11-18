/* Darwin probe policy. No IO authority; the native bridge supplies read-only evidence. */
(function(scope){'use strict';const Paths=typeof module!=='undefined'?require('./runtime-paths.js'):scope.SMRuntimePaths;
function create(native){const paths=Paths.create('Darwin');let closed=false;const equal=(a,b)=>a.dev===b.dev&&a.hi===b.hi&&a.lo===b.lo&&a.mode===b.mode;
 function valid(s){if(!s||![s.dev,s.hi,s.lo,s.mode,s.links].every(Number.isInteger)||s.dev<0||s.dev>0xffffffff||s.hi<0||s.hi>0xffffffff||s.lo<0||s.lo>0xffffffff||s.mode<0||s.mode>0xffff||s.links<1||s.hi===0&&s.lo===0)throw Error('MAC_IDENTITY_UNVERIFIABLE');const type=s.mode&0xf000;if(type!==0x4000&&type!==0x8000||type===0x8000&&s.links!==1)throw Error('MAC_LINK_OR_TYPE_REJECTED');return s;}
 function object(path){if(closed)throw Error('MAC_PROBE_CLOSED');paths.absolute(path);const before=valid(native.lstat(path)),fd=native.open(path);if(!Number.isInteger(fd)||fd<0)throw Error('MAC_OPEN_NOFOLLOW_FAILED');try{const current=valid(native.fstat(fd));if(!equal(before,current)||native.finalPath(fd)!==path)throw Error('MAC_PATH_OR_OBJECT_CHANGED');const after=valid(native.lstat(path));if(!equal(after,current)||after.links!==current.links)throw Error('MAC_PATH_OR_OBJECT_CHANGED');return {volume:current.dev,hi:current.hi,lo:current.lo};}finally{if(native.close(fd)!==0)throw Error('MAC_HANDLE_CLOSE_FAILED');}}
 async function path(target,base){if(closed)throw Error('MAC_PROBE_CLOSED');if(!paths.within(target,base))throw Error('R2_PATH_OUTSIDE');const ancestors=[];for(let cursor=target;cursor!==null;cursor=paths.parent(cursor))ancestors.push(cursor);for(const cursor of ancestors.reverse()){const s=native.maybeLstat(cursor);if(s===null)break;object(cursor);}}
 return {object,path,close(){if(closed)return;closed=true;native.dispose();}};
}
const api={create};if(typeof module!=='undefined')module.exports=api;else scope.SMRuntimeMacPolicy=api;
})(this);
