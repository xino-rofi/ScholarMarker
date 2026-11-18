/* Versioned preference-only Ping bindings. Independent of quickMarkers and catalog. */
(function(scope){
 'use strict';
 const KEY='extensions.scholarmarker.pingShortcuts.v1',ID=/^m-[a-f0-9]{32}$/;
 const modifiers=['Ctrl','Alt','Shift','Meta'];
 const punctuation={Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};
 const codes=/^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right))$/;
 function chord(value){
  if(typeof value!=='string')throw Error('SHORTCUT_UNSUPPORTED');
  const parts=value.split('+'),code=parts.pop();
  if(!codes.test(code)||parts.join('+')!==modifiers.filter(m=>parts.includes(m)).join('+'))throw Error('SHORTCUT_UNSUPPORTED');
  return value;
 }
 function fromEvent(e){
  if(!e||e.isComposing||e.keyCode===229||e.repeat||e.getModifierState?.('AltGraph')||['Dead','Process','Unidentified'].includes(e.key))throw Error('SHORTCUT_UNSUPPORTED');
  return chord([e.ctrlKey&&'Ctrl',e.altKey&&'Alt',e.shiftKey&&'Shift',e.metaKey&&'Meta',e.code].filter(Boolean).join('+'));
 }
 function label(value){const parts=value.split('+'),code=parts.pop();return [...parts,punctuation[code]??code.replace(/^Key|^Digit/,'')].join('+');}
 function singleFocus(e){const d=e.target?.ownerDocument;if(d?.documentURI!=='resource://zotero/reader/pdf/web/viewer.html'||d.hidden||d.hasFocus?.()!==true)return false;const active=d.activeElement;if(active!==d.body&&!active?.closest?.('#viewer'))return false;const selection=d.defaultView?.getSelection?.();if(!selection||selection.isCollapsed!==true)return false;return true;}
 function candidate(e){if(!e||e.defaultPrevented||e.isTrusted!==true||e.target?.closest?.('input,textarea,select,button,[role="textbox"],[role="dialog"],[contenteditable]:not([contenteditable="false"])'))return false;try{fromEvent(e);return singleFocus(e);}catch{return false;}}
 function nativeConflict(value,doc,platform){
  chord(value);
  const keys=doc?.querySelectorAll?.('key');
  if(!keys)return 'SHORTCUT_NATIVE_UNKNOWN';
  const parts=value.split('+'),code=parts.pop(),expected=new Set(parts);
  const char=punctuation[code]??(/^Key|^Digit/.test(code)?code.replace(/^Key|^Digit/,''):null);
  const names={
   Space:['SPACE'],Enter:['RETURN','ENTER'],NumpadEnter:['ENTER','RETURN'],Backspace:['BACK_SPACE'],
   PageUp:['PAGE_UP'],PageDown:['PAGE_DOWN'],ArrowUp:['UP'],ArrowDown:['DOWN'],ArrowLeft:['LEFT'],ArrowRight:['RIGHT'],
   NumpadAdd:['ADD'],NumpadSubtract:['SUBTRACT'],NumpadMultiply:['MULTIPLY'],NumpadDivide:['DIVIDE'],NumpadDecimal:['DECIMAL'],
   Backquote:['BACK_QUOTE'],BracketLeft:['OPEN_BRACKET'],BracketRight:['CLOSE_BRACKET'],Quote:['QUOTE'],
   Minus:['MINUS','SUBTRACT'],Equal:['EQUALS'],Backslash:['BACK_SLASH']
  };
  const aliases=names[code]??[char??code.toUpperCase()];
  const mac=platform==='Darwin'||(!platform&&/Mac/i.test(doc.defaultView?.navigator?.platform||''));
  const mapping={accel:mac?'Meta':'Ctrl',access:mac?'Ctrl':'Alt',control:'Ctrl',ctrl:'Ctrl',alt:'Alt',shift:'Shift',meta:'Meta',os:'Meta'};
  for(const key of keys){
   if(key.getAttribute('disabled')==='true')continue;
   const nativeChar=key.getAttribute('key')?.toUpperCase(),nativeCode=key.getAttribute('keycode')?.toUpperCase().replace(/^VK_/,'');
   if(!(nativeChar&&(nativeChar===char||code==='Space'&&nativeChar===' ')||nativeCode&&aliases.includes(nativeCode)))continue;
   const raw=(key.getAttribute('modifiers')||'').toLowerCase().split(/[\s,]+/).filter(Boolean);
   const required=new Set(raw.filter(m=>m!=='any').map(m=>mapping[m]??m));
   if([...required].every(m=>expected.has(m))&&(raw.includes('any')||required.size===expected.size))return 'SHORTCUT_NATIVE_CONFLICT';
  }
  return null;
 }
 const empty=debugDefault=>({schemaVersion:1,revision:0,bindings:[],debugDefault});
 class Store{
  constructor(read,write){this.read=read;this.write=write;this.capture=null;this.epoch=0;}
  load(){try{const raw=this.read(KEY);if(raw===undefined||raw==='')return {...empty(false),valid:true};if(typeof raw!=='string'||raw.length>8192)throw Error();const c=JSON.parse(raw);if(!c||Object.keys(c).sort().join(',')!=='bindings,debugDefault,revision,schemaVersion'||c.schemaVersion!==1||!Number.isSafeInteger(c.revision)||c.revision<0||c.revision>=Number.MAX_SAFE_INTEGER||typeof c.debugDefault!=='boolean'||!Array.isArray(c.bindings)||c.bindings.length>50)throw Error();const ids=new Set(),combos=new Set();for(const b of c.bindings){if(!b||Object.keys(b).sort().join(',')!=='chord,markerID'||!ID.test(b.markerID)||ids.has(b.markerID)||combos.has(chord(b.chord)))throw Error();ids.add(b.markerID);combos.add(b.chord);}return {...c,valid:true};}catch{return {...empty(false),valid:false};}}
  list(definitions){const ids=new Set(definitions.map(d=>d.id));return this.load().bindings.filter(b=>ids.has(b.markerID)).map(b=>({...b}));}
  commit(c){const {valid,...data}=c;this.write(KEY,JSON.stringify(data));this.epoch++;}
  update(fn,definitions){const c=this.load();if(!c.valid)throw Error('SHORTCUT_CONFIG_CORRUPT');c.bindings=this.list(definitions);fn(c);c.revision++;this.commit(c);}
  bind(markerID,value,definitions,conflict=()=>null){value=chord(value);if(!ID.test(markerID)||!definitions.some(d=>d.id===markerID))throw Error('SHORTCUT_MARKER_MISSING');const issue=conflict(value);if(issue)throw Error(issue);this.update(c=>{if(c.bindings.some(b=>b.chord===value&&b.markerID!==markerID))throw Error('SHORTCUT_DUPLICATE');c.bindings=c.bindings.filter(b=>b.markerID!==markerID);c.bindings.push({markerID,chord:value});},definitions);}
  unbind(markerID,definitions){this.update(c=>{c.bindings=c.bindings.filter(b=>b.markerID!==markerID);},definitions);}
  prune(definitions){this.update(()=>{},definitions);}
  setDebug(value,definitions){this.update(c=>{c.debugDefault=!!value;},definitions);}
  reset(){this.commit(empty(false));}
  resolve(e,definitions){if(this.capture||!candidate(e))return null;let value;try{value=fromEvent(e);}catch{return null;}const c=this.load();if(!c.valid)return null;const binding=c.bindings.find(b=>b.chord===value),d=binding&&definitions.find(d=>d.id===binding.markerID);if(d)return {kind:'custom',markerID:d.id,assetID:d.assetID,name:d.name,chord:value,revision:c.revision,configToken:this.epoch};if(binding)return null;return null;}
  lease(cancel){this.capture?.();this.capture=cancel;return ()=>{if(this.capture===cancel)this.capture=null;};}
  stop(){this.capture?.();this.capture=null;}
 }
 const api={KEY,Store,chord,fromEvent,label,candidate,nativeConflict};if(typeof module!=='undefined')module.exports=api;else scope.SMPingShortcuts=api;
})(this);
