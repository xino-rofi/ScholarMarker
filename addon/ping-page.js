/* Read-only, one-level PDF iframe/page identity. No text extraction or annotation API. */
(function(scope){
 'use strict';
 function same(a,b){return !!a&&!!b&&(typeof a.isSameNode==='function'?a.isSameNode(b):a===b);}
 function sameOwnerDocument(actual,expected){if(actual===expected)return true;try{return !!actual&&!!expected&&typeof expected.isSameNode==='function'&&expected.isSameNode(actual)===true;}catch{return false;}}
 function rect(node){const r=node.getBoundingClientRect();if(![r.left,r.top,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)throw Error('PING_INVALID_RECT');return {left:r.left,top:r.top,width:r.width,height:r.height};}
 function frame(doc,owner){const f=doc.defaultView.frameElement;if(!f||f.ownerDocument!==owner||!f.isConnected||!same(f.contentDocument,doc))throw Error('PING_FRAME_IDENTITY');const r=rect(f);if(Math.abs(r.width-f.offsetWidth)>2||Math.abs(r.height-f.offsetHeight)>2||Math.abs(f.clientWidth-doc.documentElement.clientWidth)>2||Math.abs(f.clientHeight-doc.documentElement.clientHeight)>2)throw Error('PING_FRAME_SCALE');return {node:f,rect:r,x:r.left+f.clientLeft,y:r.top+f.clientTop};}
 function read(doc,owner,page,version){
  if(!/^10\.0\.\d+$/.test(version)||doc.documentURI!=='resource://zotero/reader/pdf/web/viewer.html'||owner.documentURI!=='resource://zotero/reader/reader.html')throw Error('PING_SCOPE');
  if(!page||!sameOwnerDocument(page.ownerDocument,doc)||!page.isConnected)throw Error('PING_PAGE_IDENTITY');const number=Number(page.getAttribute('data-page-number'));if(!Number.isSafeInteger(number)||number<1)throw Error('PING_PAGE_NUMBER');
  const win=doc.defaultView,view=(win.wrappedJSObject||win).PDFViewerApplication?.pdfViewer?.getPageView(number-1);if(!view||view.id!==number||view.pdfPage?.pageNumber!==number||!same(view.div,page))throw Error('PING_PAGE_VIEW');
  const canvas=page.querySelector('.canvasWrapper canvas'),text=page.querySelector('.textLayer');if(!canvas||!text)throw Error('PING_PAGE_NOT_READY');
  const css=win.getComputedStyle(page);if(css.position!=='relative'||css.transform!=='none'||['paddingLeft','paddingRight','paddingTop','paddingBottom'].some(k=>parseFloat(css[k])))throw Error('PING_PAGE_CSS');
  const vp=view.viewport,m=Array.from(vp?.transform||[]),box=Array.from(vp?.viewBox||[]),width=page.clientWidth,height=page.clientHeight;if(m.length!==6||!m.every(Number.isFinite)||box.length!==4||!box.every(Number.isFinite)||box[2]<=box[0]||box[3]<=box[1]||![0,90,180,270].includes(vp.rotation)||![width,height,vp.width,vp.height].every(n=>Number.isFinite(n)&&n>0))throw Error('PING_VIEWPORT');
  const sx=width/vp.width,sy=height/vp.height;if(Math.abs(sx-sy)/Math.max(sx,sy)>.01||Math.abs(m[0]*m[2]+m[1]*m[3])>1e-5||Math.abs(m[0]*m[3]-m[1]*m[2])<1e-8)throw Error('PING_MATRIX');const matrix=[m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy,m[4]*sx,m[5]*sy];
  const corners=[[box[0],box[1]],[box[2],box[1]],[box[0],box[3]],[box[2],box[3]]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]),bounds=[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];if(bounds.some((n,i)=>Math.abs(n-[0,0,width,height][i])>2))throw Error('PING_CROPBOX');
  const r=rect(page),f=frame(doc,owner);if(Math.abs(r.width-page.offsetWidth)>2||Math.abs(r.height-page.offsetHeight)>2)throw Error('PING_PAGE_SCALE');return {page,canvas,text,pageIndex:number-1,width,height,matrix,cropBox:box,origin:[r.left+page.clientLeft,r.top+page.clientTop],frame:f,signature:JSON.stringify([number,width,height,matrix,box,r,f.rect])};
 }
 function point(doc,owner,target,x,y,version){const page=target?.closest?.('.page[data-page-number]');const meta=read(doc,owner,page,version),local=[x-meta.origin[0],y-meta.origin[1]];if(!local.every(Number.isFinite)||local[0]<0||local[1]<0||local[0]>meta.width||local[1]>meta.height)throw Error('PING_OUTSIDE_PAGE');return {...meta,local,center:[meta.frame.x+x,meta.frame.y+y]};}
 function check(doc,owner,snapshot,version){const now=read(doc,owner,snapshot.page,version);if(now.signature!==snapshot.signature||!same(now.canvas,snapshot.canvas)||!same(now.text,snapshot.text))throw Error('PING_GEOMETRY_CHANGED');return now;}
 const api={same,frame,read,point,check};if(typeof module!=='undefined')module.exports=api;else scope.SMPingPage=api;
})(this);
