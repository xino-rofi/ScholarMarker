'use strict';
// New geometric and analytic inputs specified in MEDIA-AUTHORING.md.
// No previous GIF pixels, waveform samples, artwork, fonts or generator code are inputs.
const fs=require('node:fs'),p=require('node:path');
function gif(kind){
 const result=[Buffer.from('GIF89a','ascii'),Buffer.from([16,0,16,0,0x81,0,0,248,250,252,10,136,148,123,61,185,28,40,56])];
 for(let phase=0;phase<2;phase++){
  result.push(Buffer.from([0x21,0xf9,4,8,18,0,0,0,0x2c,0,0,0,0,16,0,16,0,0,2]));
  const payload=[];let pending=0,bits=0;
  function put(code){pending|=code<<bits;bits+=3;while(bits>=8){payload.push(pending&255);pending>>>=8;bits-=8;}}
  for(let row=0;row<16;row++)for(let col=0;col<16;col++){
   const dx=Math.abs(2*col-15),dy=Math.abs(2*row-15);
   // PLUS: short/wide cross; DIAMOND: two concentric Manhattan-distance bands.
   const ink=kind==='plus'?(Math.min(dx,dy)<=3&&Math.max(dx,dy)<=11+phase*2):(dx+dy>=8-phase*2&&dx+dy<=12+phase*2);
   put(4);put(ink?(kind==='plus'?1:2):0);
  }
  put(5);if(bits)payload.push(pending&255);
  for(let n=0;n<payload.length;n+=255){const part=payload.slice(n,n+255);result.push(Buffer.from([part.length,...part]));}result.push(Buffer.from([0]));
 }
 result.push(Buffer.from([0x3b]));return Buffer.concat(result);
}
function wav(){
 const rate=16000,total=4800,data=Buffer.alloc(total*2),notes=[{start:320,length:1760,hz:440},{start:2560,length:1760,hz:660}];
 for(let sample=0;sample<total;sample++){let amplitude=0;for(const note of notes){const j=sample-note.start;if(j<0||j>=note.length)continue;const ramp=Math.min(1,j/240,(note.length-1-j)/240),phase=((j*note.hz)%rate)/rate;amplitude=0.12*ramp*(1-4*Math.abs(phase-0.5));}data.writeInt16LE(Math.round(amplitude*32767),sample*2);}
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);return Buffer.concat([header,data]);
}
function generate(){const audio=wav();return {'assets/smile.gif':gif('plus'),'assets/wow.gif':gif('diamond'),'assets/chime.wav':audio,'sound.js':Buffer.from('var SMTestSound = '+JSON.stringify('data:audio/wav;base64,'+audio.toString('base64'))+';\n')};}
if(require.main===module){if(p.basename(__dirname)!=='scripts'||!fs.existsSync(p.resolve(__dirname,'../identity.json')))throw Error('RUN_ONLY_INSIDE_BUILD_PROJECT_SCRIPTS');const dir=p.resolve(__dirname,'../addon');for(const [name,b]of Object.entries(generate())){const file=p.join(dir,name);fs.mkdirSync(p.dirname(file),{recursive:true});fs.writeFileSync(file,b);}}
module.exports={generate,gif,wav};
