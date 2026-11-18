/* Supported desktop platforms and minimum Zotero patch by platform. */
(function(scope){'use strict';
const TARGETS=Object.freeze([{os:'WINNT',host:'10.0.8'},{os:'Darwin',host:'10.0.9'}]);
function allows(identity,host){const matrix=identity.platforms;if(matrix===undefined)return host.os===identity.os&&host.host===identity.host;if(!Array.isArray(matrix)||matrix.length!==2||matrix.some((v,i)=>v?.os!==TARGETS[i].os||v?.host!==TARGETS[i].host||Object.keys(v).sort().join(',')!=='host,os'))return false;const match=/^10\.0\.(0|[1-9]\d*)$/.exec(host.host);if(!match)return false;const patch=Number(match[1]);return Number.isSafeInteger(patch)&&matrix.some(v=>v.os===host.os&&patch>=Number(v.host.split('.')[2]));}
const api={allows,TARGETS};if(typeof module!=='undefined')module.exports=api;else scope.SMRuntimePlatform=api;
})(this);
