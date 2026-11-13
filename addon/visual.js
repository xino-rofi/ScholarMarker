/* Original shared visual layer; never writes annotation data. */
(function(scope) {
  'use strict';
  const markers = Object.freeze({
    smile: Object.freeze({id:'smile',name:'Smile',icon:'🙂',gif:'assets/smile.gif',audio:'assets/chime.wav',defaultKey:'q'}),
    wow: Object.freeze({id:'wow',name:'Wow',icon:'😮',gif:'assets/wow.gif',audio:'assets/chime.wav',defaultKey:'j'})
  });
  function create(doc, marker, {root='',motion=()=>true,anchor=null}={}) {
    const node=doc.createElement('span'), listeners=[];
    node.textContent=marker.icon; node.setAttribute('aria-label',marker.name);
    if(marker.static){
      const image=doc.createElement('img');image.src=marker.static;image.alt=marker.name;
      image.style.cssText='width:20px;height:20px;object-fit:contain';
      image.addEventListener('error',()=>{image.remove();node.textContent=marker.icon;},{once:true});
      node.textContent='';node.append(image);
    }
    node.style.cssText='display:inline-block;font-size:20px;line-height:24px;';
    let preview=null,timer=null,disposed=false;
    const close=()=>{
      doc.defaultView.clearTimeout(timer);timer=null;
      if(preview){preview.remove();preview=null;}
    };
    const show=()=>{
      close();
      if(disposed||!node.isConnected||doc.hidden||!motion()||doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches||!marker.gif)return;
      preview=doc.createElement('img');preview.alt=marker.name;preview.src=marker.gif.startsWith('data:')?marker.gif:root+marker.gif;
      const a=(anchor||node).getBoundingClientRect?.()||{left:16,bottom:100};
      const width=Math.max(0,Math.min(88,(doc.defaultView.innerWidth||1000)-16));
      const height=Math.max(0,Math.min(88,(doc.defaultView.innerHeight||600)-16));
      preview.style.cssText='position:fixed;pointer-events:none;image-rendering:pixelated;z-index:2147483647;'+
        'width:'+width+'px;height:'+height+'px;left:'+Math.max(8,Math.min(a.left,(doc.defaultView.innerWidth||1000)-width-8))+'px;'+
        'top:'+Math.max(8,Math.min(a.bottom+4,(doc.defaultView.innerHeight||600)-height-8))+'px;';
      preview.addEventListener('error',close,{once:true});doc.body.append(preview);
      timer=doc.defaultView.setTimeout(close,2400);
    };
    for(const [type,handler] of [['mouseenter',show],['mouseleave',close],['focusin',show],['focusout',close]]){
      node.addEventListener(type,handler);listeners.push(()=>node.removeEventListener(type,handler));
    }
    return {node,show,close,dispose(){if(disposed)return;disposed=true;close();listeners.forEach(fn=>fn());node.remove();}};
  }
  const api={markers,create};
  if(typeof module!=='undefined')module.exports=api;else scope.SMVisual=api;
})(this);
