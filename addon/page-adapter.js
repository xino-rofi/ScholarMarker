/* PRIVATE READ-ONLY EXPERIMENT: Zotero 10.0.7 only; never a public API claim. */
(function(scope){
 'use strict';
 function fail(code,message,transient=false){const error=new Error(message);error.code=code;error.transient=transient;throw error;}
 function read(doc,page,pageIndex,version){
  if((version!=='10.0.7'&&version!=='10.0.8')||doc.documentURI!=='resource://zotero/reader/pdf/web/viewer.html')fail('INVALID_VIEWER','Unvalidated viewer/version',false);
  const win=doc.defaultView,raw=win.wrappedJSObject||win;
  const view=raw.PDFViewerApplication?.pdfViewer?.getPageView(pageIndex);
  if(page.ownerDocument!==doc||!page.isConnected||page.getAttribute('data-page-number')!==String(pageIndex+1))fail('INVALID_GEOMETRY','Page DOM identity mismatch');
  if(!view||!view.pdfPage)fail('PAGE_NOT_READY','Native page view not yet ready',true);
  if(view.id!==pageIndex+1||view.pdfPage.pageNumber!==pageIndex+1||!page.isSameNode(view.div))fail('INVALID_GEOMETRY','Page identity mismatch');
  if(!page.querySelector('.canvasWrapper canvas'))fail('PAGE_NOT_READY','Canvas not yet available',true);
  const style=win.getComputedStyle(page);
  if(style.position!=='relative'||style.transform!=='none'||parseFloat(style.paddingLeft)||parseFloat(style.paddingRight)||parseFloat(style.paddingTop)||parseFloat(style.paddingBottom))fail('INVALID_GEOMETRY','Unvalidated page CSS',false);
  const vp=view.viewport,m=Array.from(vp?.transform||[]),b=Array.from(vp?.viewBox||[]);
  const width=page.clientWidth,height=page.clientHeight;
  if(m.length!==6||!m.every(Number.isFinite)||b.length!==4||!b.every(Number.isFinite)||b[2]<=b[0]||b[3]<=b[1]||![0,90,180,270].includes(vp.rotation)||![width,height,vp.width,vp.height].every(v=>Number.isFinite(v)&&v>0))fail('INVALID_GEOMETRY','Viewport metadata unavailable',true);
  const sx=width/vp.width,sy=height/vp.height;
  if(Math.abs(sx-sy)/Math.max(sx,sy)>.01||Math.abs(m[0]*m[2]+m[1]*m[3])>1e-5)fail('INVALID_GEOMETRY','Inconsistent CSS stretch/viewport',true);
  const determinant=m[0]*m[3]-m[1]*m[2];if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-8)fail('INVALID_GEOMETRY','Noninvertible viewport');
  const matrix=[m[0]*sx,m[1]*sy,m[2]*sx,m[3]*sy,m[4]*sx,m[5]*sy];
  // The transformed CropBox must match the measured page content bounds.
  const corners=[[b[0],b[1]],[b[2],b[1]],[b[0],b[3]],[b[2],b[3]]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
  const bounds=[Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];
  if(bounds.some((n,i)=>Math.abs(n-[0,0,width,height][i])>2))fail('INVALID_GEOMETRY','CropBox transform mismatch',true);
  const textLayer=page.querySelector('.textLayer'),pageRect=page.getBoundingClientRect();
  if(!textLayer)fail('PAGE_NOT_READY','Text layer not yet available',true);
  if(![pageRect.width,pageRect.height].every(Number.isFinite)||Math.abs(pageRect.width-page.offsetWidth)>2||Math.abs(pageRect.height-page.offsetHeight)>2)fail('INVALID_GEOMETRY','Page CSS content bounds mismatch',true);
  const ox=pageRect.left+page.clientLeft,oy=pageRect.top+page.clientTop;
  const textRects=Array.from(textLayer.querySelectorAll('span')).map(span=>span.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0).map(r=>[r.left-ox,r.top-oy,r.right-ox,r.bottom-oy]);
  if(textRects.some(r=>!r.every(Number.isFinite)))fail('INVALID_GEOMETRY','Nonfinite text layer bounds');
  if(!textRects.length)fail('PAGE_NOT_READY','Selectable text geometry not yet rendered',true);
  return {pageIndex,width,height,cropBox:b,matrix,textRects};
 }
 const api={read};if(typeof module!=='undefined')module.exports=api;else scope.SMPageAdapter=api;
})(this);
