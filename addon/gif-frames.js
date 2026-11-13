/* Bounded GIF87a/89a decoding. Independent implementation; no browser GIF decoder. */
(function(scope){'use strict';
 const B=typeof module!=='undefined'?require('./import-bytes.js'):scope.SMImportBytes;
 const LIMIT={bytes:2097152,side:512,frames:128,pixels:1048576,duration:10000};
 function decode(input){
  const b=B.copy(input);let at=0,total=0,pixels=0,gce={delay:0,disposal:0,transparent:-1};
  const need=n=>{if(at+n>b.length)throw Error('GIF_TRUNCATED');},u8=()=>{need(1);return b[at++];},u16=()=>u8()+u8()*256;
  const take=n=>{need(n);const out=new Uint8Array(n);for(let i=0;i<n;i++)out[i]=b[at++];return out;};
  const blocks=()=>{const parts=[];let n,size=0;while((n=u8())){parts.push(take(n));size+=n;if(size>LIMIT.bytes)throw Error('GIF_BLOCK_LIMIT');}const out=new Uint8Array(size);let p=0;for(const part of parts){out.set(part,p);p+=part.length;}return out;};
  if(b.length<14||b.length>LIMIT.bytes)throw Error('GIF_SIZE');const signature=B.ascii(take(6),0,6);if(!['GIF87a','GIF89a'].includes(signature))throw Error('GIF_SIGNATURE');
  const width=u16(),height=u16(),packed=u8(),bg=u8();u8();if(!width||!height||width>LIMIT.side||height>LIMIT.side)throw Error('GIF_DIMENSIONS');
  const global=(packed&128)?take(3*(1<<((packed&7)+1))):null,canvas=new Uint8Array(width*height*4),frames=[];
  function fill(x,y,w,h,color){for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++){const p=(row*width+col)*4;for(let c=0;c<4;c++)canvas[p+c]=color[c];}}
  function background(control){return control.transparent>=0||!global||bg*3+2>=global.length?[0,0,0,0]:[global[bg*3],global[bg*3+1],global[bg*3+2],255];}
  let ended=false;
  while(at<b.length){const tag=u8();if(tag===0x3b){ended=true;break;}
   if(tag===0x21){const type=u8();if(type===0xf9){if(u8()!==4)throw Error('GIF_GCE');const flags=u8(),delay=u16(),transparent=u8();if(u8()!==0||(flags&0xe0)||(flags&2))throw Error('GIF_GCE_UNSUPPORTED');const disposal=(flags>>2)&7;if(disposal>3)throw Error('GIF_DISPOSAL_UNSUPPORTED');
     // Zero delay has no specified waiting period. Reject rather than invent timing.
     if(delay>500)throw Error('GIF_DELAY_UNSUPPORTED');gce={delay:delay*10,disposal,transparent:(flags&1)?transparent:-1};
    }else if(type===0x01)throw Error('GIF_PLAIN_TEXT_UNSUPPORTED');else if(type===0xfe||type===0xff)blocks();else throw Error('GIF_EXTENSION_UNSUPPORTED');continue;}
   if(tag!==0x2c)throw Error('GIF_BLOCK');const x=u16(),y=u16(),w=u16(),h=u16(),flags=u8();if(!w||!h||x+w>width||y+h>height||(flags&0x18))throw Error('GIF_FRAME_BOUNDS');
   const palette=(flags&128)?take(3*(1<<((flags&7)+1))):global;if(!palette)throw Error('GIF_PALETTE');pixels+=width*height;total+=gce.delay;if(pixels>LIMIT.pixels||frames.length>=LIMIT.frames||total>LIMIT.duration)throw Error('GIF_RESOURCE_LIMIT');
   if(!frames.length)fill(0,0,width,height,background(gce));
   const before=gce.disposal===3?canvas.slice():null,indices=lzw(u8(),blocks(),w*h),rows=[];
   if(flags&64){for(const [start,step]of [[0,8],[4,8],[2,4],[1,2]])for(let row=start;row<h;row+=step)rows.push(row);}else for(let row=0;row<h;row++)rows.push(row);
   for(let row=0;row<h;row++)for(let col=0;col<w;col++){const c=indices[row*w+col];if(c===gce.transparent)continue;if(c*3+2>=palette.length)throw Error('GIF_PALETTE_INDEX');const p=((y+rows[row])*width+x+col)*4;canvas[p]=palette[c*3];canvas[p+1]=palette[c*3+1];canvas[p+2]=palette[c*3+2];canvas[p+3]=255;}
   frames.push({delay:gce.delay,rgba:canvas.slice()});if(gce.disposal===2)fill(x,y,w,h,background(gce));else if(before)canvas.set(before);gce={delay:0,disposal:0,transparent:-1};
  }
  if(!ended||at!==b.length||!frames.length)throw Error('GIF_INCOMPLETE');if(frames.length>1&&frames.some(f=>f.delay===0))throw Error('GIF_DELAY_UNSUPPORTED');return {width,height,frames,duration:total,decodedBytes:pixels*4};
 }
 function lzw(min,b,expected){
  if(min<2||min>8)throw Error('GIF_LZW_SIZE');const clear=1<<min,end=clear+1,prefix=new Uint16Array(4096),suffix=new Uint8Array(4096),stack=new Uint8Array(4097),out=new Uint8Array(expected);let bits=min+1,next=end+1,old=-1,first=0,bit=0,n=0,finished=false,sawClear=false;
  const code=()=>{if(bit+bits>b.length*8)throw Error('GIF_LZW_TRUNCATED');let v=0;for(let i=0;i<bits;i++)v|=((b[(bit+i)>>3]>>((bit+i)&7))&1)<<i;bit+=bits;return v;};
  for(let i=0;i<clear;i++)suffix[i]=i;
  while(bit+bits<=b.length*8){let c=code();if(c===clear){bits=min+1;next=end+1;old=-1;sawClear=true;continue;}if(!sawClear)throw Error('GIF_LZW_CLEAR');if(c===end){finished=true;break;}if(c>next||c>=4096)throw Error('GIF_LZW_CODE');const original=c;let top=0;
   if(c===next){if(old<0)throw Error('GIF_LZW_FIRST');stack[top++]=first;c=old;}let chain=0;while(c>=clear){if(c>=next||++chain>4096)throw Error('GIF_LZW_CHAIN');stack[top++]=suffix[c];c=prefix[c];}first=suffix[c];stack[top++]=first;
   while(top){if(n>=expected)throw Error('GIF_LZW_OVERFLOW');out[n++]=stack[--top];}
   if(old>=0&&next<4096){prefix[next]=old;suffix[next]=first;next++;if(next===(1<<bits)&&bits<12)bits++;}old=original;
  }if(!finished||n!==expected)throw Error('GIF_LZW_INCOMPLETE');return out;
 }
 const api={decode,lzw,LIMIT};if(typeof module!=='undefined')module.exports=api;else scope.SMGifFrames=api;
})(this);
