(function(scope){
 'use strict';
 const valid=r=>Array.isArray(r)&&r.length===4&&r.every(Number.isFinite)&&r[2]>r[0]&&r[3]>r[1];
 function rects(position,meta){
  const {matrix:m,cropBox:b,width,height,pageIndex}=meta;
  if(position?.pageIndex!==pageIndex||position.nextPageRects||!Array.isArray(position.rects)||!valid(b)||!Array.isArray(m)||m.length!==6||!m.every(Number.isFinite)||Math.abs(m[0]*m[3]-m[1]*m[2])<1e-8||![width,height].every(n=>Number.isFinite(n)&&n>0))throw Error('Unsupported PDF geometry');
  return position.rects.filter(valid).map(r=>[Math.max(r[0],b[0]),Math.max(r[1],b[1]),Math.min(r[2],b[2]),Math.min(r[3],b[3])]).filter(valid).map(r=>{
   const p=[[r[0],r[1]],[r[2],r[1]],[r[0],r[3]],[r[2],r[3]]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
   return [Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
  });
 }
 function anchor(boxes,meta,obstacles=[]){
  const r=boxes.at(-1),size=18,gap=4;if(!r||meta.width<24||meta.height<24)return null;
  for(let [left,top] of [[r[2]+gap,(r[1]+r[3]-size)/2],[r[0]-size-gap,(r[1]+r[3]-size)/2],[r[2]-size,r[3]+gap],[r[2]-size,r[1]-size-gap],[meta.width-size-2,(r[1]+r[3]-size)/2],[2,(r[1]+r[3]-size)/2]]){
   left=Math.max(2,Math.min(left,meta.width-size-2));top=Math.max(2,Math.min(top,meta.height-size-2));
   if([...boxes,...obstacles].every(b=>left+size+2<=b[0]||left-2>=b[2]||top+size+2<=b[1]||top-2>=b[3]))return {left,top,size};
  }return null;
 }
 function pdfAnchor(position){
  if(!position||position.nextPageRects||!Number.isInteger(position.pageIndex)||!Array.isArray(position.rects))throw Error('Unsupported stable anchor');
  const last=position.rects.filter(valid).at(-1);if(!last)throw Error('Missing stable PDF rect');return [last[2],(last[1]+last[3])/2];
 }
 function project(p,m){if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||!Array.isArray(m)||m.length!==6||!m.every(Number.isFinite))throw Error('Invalid transform');return [m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];}
 function inverse(p,m){const d=m[0]*m[3]-m[1]*m[2];if(!Number.isFinite(d)||Math.abs(d)<1e-8)throw Error('Noninvertible transform');return project(p, [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d]);}
 function automatic(position,meta,obstacles=[],trace=()=>{},options={}){
  const anchorPDF=pdfAnchor(position),center=project(anchorPDF,meta.matrix);inverse(center,meta.matrix);
  const length=Math.hypot(meta.matrix[0],meta.matrix[1]),normalLength=Math.hypot(meta.matrix[2],meta.matrix[3]);if(!length||!normalLength)throw Error('Invalid anchor direction');
  const ux=meta.matrix[0]/length,uy=meta.matrix[1]/length,vx=meta.matrix[2]/normalLength,vy=meta.matrix[3]/normalLength;
  const hard=options.hard||[],soft=options.soft||obstacles;
  const offsets=[[13,0],[25,0],[13,12],[13,-12],[25,12],[25,-12],[13,17],[13,-17],[13,24],[13,-24]];
  const overlap=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
  const near=(a,b)=>!(a[2]+2<=b[0]||a[0]-2>=b[2]||a[3]+2<=b[1]||a[1]-2>=b[3]);
  const candidates=offsets.map(([dx,dy],id)=>{
   const left=center[0]+dx*ux+dy*vx-9,top=center[1]+dx*uy+dy*vy-9,box=[left,top,left+18,top+18],rejected=[];
   if(left<2||top<2||left+18>meta.width-2||top+18>meta.height-2)rejected.push('PAGE_BOUNDARY');
   if(hard.some(b=>near(box,b)))rejected.push('HIGHLIGHT_OR_ICON_COLLISION');
   const textCollision=soft.some(b=>near(box,b)),textOverlap=soft.reduce((sum,b)=>sum+overlap(box,b),0);
   return {id,direction:'PDF-positive-X',left,top,rejected,textCollision,textOverlap,softReason:textCollision?(textOverlap>48?'TEXT_OVERLAP_LIMIT':'TEXT_CLEARANCE_OR_MINOR_OVERLAP'):null};
  });
  const eligible=candidates.filter(c=>!c.rejected.length),clear=eligible.filter(c=>!c.textCollision),limited=eligible.filter(c=>c.textOverlap<=48);
  const pool=clear.length?clear:limited;
  const selected=pool.find(c=>c.id===options.preferred) || pool.slice().sort((a,b)=>(clear.length?0:a.textOverlap-b.textOverlap)||a.id-b.id)[0];
  const mode=selected?(selected.textCollision?'LIMITED_NEAR_FALLBACK':'CLEAR_NEAR_CANDIDATE'):'ALL_CANDIDATES_REJECTED';
  trace({pageIndex:position.pageIndex,rectsPDF:position.rects,anchorPDF,matrix:meta.matrix,cssSize:[meta.width,meta.height],candidates,result:mode,selectedId:selected?.id??null,previousId:options.preferred??null,changeReason:options.preferred!==undefined&&selected?.id!==options.preferred?'Previous candidate no longer in safest eligible pool':null});
  return selected?{left:selected.left,top:selected.top,size:18,direction:selected.direction,candidateId:selected.id,mode}:null;
 }
 function manual(position,meta,offset){const a=pdfAnchor(position),p=project([a[0]+offset[0],a[1]+offset[1]],meta.matrix);if(p[0]<9||p[1]<9||p[0]>meta.width-9||p[1]>meta.height-9)return null;return {left:p[0]-9,top:p[1]-9,size:18};}
 const api={rects,anchor,pdfAnchor,project,inverse,automatic,manual};if(typeof module!=='undefined')module.exports=api;else scope.SMPageGeometry=api;
})(this);
