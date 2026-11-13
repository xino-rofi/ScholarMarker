/* Original POC code. No Zotero source is bundled. */
(function (scope) {
  'use strict';
  const PREFIX = 'scholarmarker:poc:v1:';
  const REACTIONS = Object.freeze({smile: {emoji: '🙂', label: 'Smile'}, wow: {emoji: '😮', label: 'Wow'}});
  function selection(value) {
    if (!value || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 100000)
      throw new Error('No supported text selection');
    const p = value.position;
    if (!p || !Number.isInteger(p.pageIndex) || p.pageIndex < 0 || p.nextPageRects ||
        !Array.isArray(p.rects) || !p.rects.length || p.rects.length > 1000 ||
        !p.rects.every(r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] < r[2] && r[1] < r[3]))
      throw new Error('Unsupported selection geometry (cross-page selections are not supported)');
    if (typeof value.sortIndex !== 'string' || !/^\d{5}\|\d{6}\|\d{5}$/.test(value.sortIndex))
      throw new Error('Missing supported native sortIndex');
    return {text: value.text, position: {pageIndex: p.pageIndex, rects: p.rects.map(r => r.slice())},
      sortIndex: value.sortIndex, pageLabel: String(value.pageLabel ?? (p.pageIndex + 1))};
  }
  function sameSelection(a, b) {
    try {
      const x = selection(a), y = selection(b);
      return x.text.replace(/\s+/g, ' ').trim() === y.text.replace(/\s+/g, ' ').trim() &&
        x.position.pageIndex === y.position.pageIndex && x.position.rects.length === y.position.rects.length &&
        x.position.rects.every((r, i) => r.every((n, j) => Math.abs(n - y.position.rects[i][j]) < .01));
    } catch { return false; }
  }
  function association(tags, key) {
    const names = tags.map(t => t.tag ?? t.name);
    const reactionID = Object.keys(REACTIONS).find(id => names.includes(PREFIX + 'reaction:' + id));
    return reactionID && names.includes(PREFIX + 'id:' + key) ? {reactionID, recordID: key} : null;
  }
  function shortcut(e) {
    return !e.defaultPrevented && !e.repeat && !e.isComposing && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey &&
      e.key?.toLowerCase() === 'q' && !e.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
  }
  class Controller {
    constructor(api) { this.api = api; this.tail = Promise.resolve(); this.closed = false; }
    save(parent, raw, reactionID) {
      if (this.closed) return Promise.reject(new Error('Plugin is shutting down'));
      const snapshot = selection(raw);
      const run = async () => {
        if (this.closed) throw new Error('Plugin is shutting down');
        if (!REACTIONS[reactionID]) throw new Error('Unknown Reaction ID');
        await this.api.guard(parent);
        const existing = await this.api.list(parent);
        for (const item of existing) {
          if (!item.deleted && item.type === 'highlight' && sameSelection(item, snapshot)) {
            const linked = association(item.tags || [], item.key);
            return {status: linked ? 'exists' : 'conflict', key: item.key, association: linked};
          }
        }
        const key = this.api.key();
        // Never pass a selection-provided ID/key, comment or tags into a write.
        if (await this.api.keyExists(parent, key)) throw new Error('Annotation key collision; retry');
        await this.api.create(parent, {...snapshot, key, type: 'highlight', color: '#ffd400', comment: '',
          tags: [{name: PREFIX + 'reaction:' + reactionID}, {name: PREFIX + 'id:' + key}]});
        return {status: 'created', key, association: {reactionID, recordID: key}};
      };
      const result = this.tail.then(run);
      this.tail = result.catch(() => {});
      return result;
    }
    async close() { this.closed = true; await this.tail; }
  }
  const api = {PREFIX, REACTIONS, selection, sameSelection, association, shortcut, Controller};
  if (typeof module !== 'undefined') module.exports = api;
  else scope.SMCore = api;
})(this);
