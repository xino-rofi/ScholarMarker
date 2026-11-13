/* UI policy only. Native annotation persistence remains in unchanged core.js. */
(function(scope) {
  'use strict';
  const allowed = ['q','r','j','k'];
  const defaults = Object.freeze({wheel:'r',smile:'q',wow:'j'});
  function bindings(raw) {
    const value = raw == null || raw === '' ? {...defaults} : JSON.parse(raw);
    if (!value || Object.keys(value).sort().join(',') !== 'smile,wheel,wow' ||
        !Object.values(value).every(k => allowed.includes(k)) || new Set(Object.values(value)).size !== 3)
      throw Error('Use distinct keys from Q, R, J, K for wheel, smile and wow');
    return value;
  }
  function accepts(e) {
    return !e.defaultPrevented && !e.repeat && !e.isComposing &&
      !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey &&
      !e.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
  }
  function direction(dx,dy,count) {
    if (count < 1 || Math.hypot(dx,dy) < 26) return null;
    const angle = (Math.atan2(dy,dx) + Math.PI/2 + 2*Math.PI) % (2*Math.PI);
    return Math.floor((angle + Math.PI/count) % (2*Math.PI) / (2*Math.PI/count));
  }
  function placement(width,height,anchor) {
    const margin=8,gap=8,size=220;
    if(width<236||height<270)return {compact:true,left:margin,top:margin,width:Math.max(0,width-16),height:Math.max(0,Math.min(150,height-16))};
    const a=anchor||{left:width-244,right:width-24,top:86,bottom:102};
    const below=height-margin-a.bottom,above=a.top-margin;
    const top=below>=size+gap?a.bottom+gap:above>=size+gap?a.top-gap-size:Math.max(margin,Math.min(a.top,height-margin-size));
    return {compact:false,left:Math.max(margin,Math.min((a.left+a.right-size)/2,width-margin-size)),top,width:size,height:size};
  }
  const api = {bindings,defaults,accepts,direction,placement};
  if (typeof module !== 'undefined') module.exports = api; else scope.SMInteraction = api;
})(this);
