/**
 * window-manager.js —— LarfnOS 窗口系统
 * 负责窗口的创建/聚焦/拖动/最小化/最大化/关闭，以及窗口状态同步给 Dock。
 */
(function () {
  'use strict';

  const layer = document.getElementById('windows-layer');
  const registry = new Map();   // appId -> window 记录列表
  let zTop = 100;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  /** 标题栏窗口控制按钮（矢量图标） */
  const B_MIN = '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 6h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const B_MAX = '<svg viewBox="0 0 12 12" width="11" height="11"><rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  const B_RESTORE = '<svg viewBox="0 0 12 12" width="11" height="11"><rect x="2" y="4.5" width="5.5" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 2h5a.5.5 0 0 1 .5.5v5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
  const B_CLOSE = '<svg viewBox="0 0 12 12" width="12" height="12"><path d="M3 3l6 6M9 3L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  let winCounter = 0;
  function genId(appId) { return (appId || 'win') + '-' + (++winCounter); }

  function setFocus(rec) {
    registry.forEach((list) => list.forEach((w) => {
      const focused = w.id === rec.id;
      w.el.classList.toggle('focus', focused);
      w.el.style.zIndex = focused ? ++zTop : w.el.style.zIndex;
    }));
    notifyDock();
  }

  function notifyDock() {
    document.dispatchEvent(new CustomEvent('dock:update'));
  }

  function createWindow(app, opts) {
    opts = opts || {};
    const w = opts.width || 640;
    const h = opts.height || 440;
    const layerRect = layer.getBoundingClientRect();

    const el = document.createElement('section');
    el.className = 'win focus';
    el.dataset.winId = genId(app && app.id);
    el.style.width = Math.min(w, layerRect.width - 40) + 'px';
    el.style.height = Math.min(h, layerRect.height - 40) + 'px';
    el.style.left = (opts.x ?? Math.max(24, (layerRect.width - w) / 2 + (Math.random() * 60 - 30))) + 'px';
    el.style.top = (opts.y ?? Math.max(24, (layerRect.height - h) / 2 + (Math.random() * 50 - 25))) + 'px';

    const titlebar = document.createElement('div');
    titlebar.className = 'win-titlebar';
    titlebar.innerHTML =
      '<span class="win-ic">' + (app && app.iconHTML ? app.iconHTML(18) : '') + '</span>' +
      '<span class="win-title">' + escapeHtml(opts.title || (app && app.name) || '窗口') + '</span>' +
      '<span class="win-btns">' +
        '<button data-act="min" aria-label="最小化" title="最小化">' + B_MIN + '</button>' +
        '<button data-act="max" aria-label="最大化" title="最大化">' + B_MAX + '</button>' +
        '<button data-act="close" class="close" aria-label="关闭" title="关闭">' + B_CLOSE + '</button>' +
      '</span>';

    const body = document.createElement('div');
    body.className = 'win-body';

    el.appendChild(titlebar);
    el.appendChild(body);
    layer.appendChild(el);

    const rec = { appId: app && app.id, el, body, titlebar, minimized: false, maximized: false };
    if (!registry.has(rec.appId)) registry.set(rec.appId, []);
    registry.get(rec.appId).push(rec);
    notifyDock();

    /* 聚焦 */
    el.addEventListener('pointerdown', () => setFocus(rec));

    /* 标题栏拖动 */
    let dragging = false, dx0 = 0, dy0 = 0, x0 = 0, y0 = 0;
    titlebar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.win-btns')) return;
      if (rec.maximized) return;
      dragging = true;
      const r = el.getBoundingClientRect();
      x0 = r.left; y0 = r.top; dx0 = e.clientX; dy0 = e.clientY;
      titlebar.setPointerCapture && titlebar.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    titlebar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const nx = Math.max(-el.offsetWidth + 80, Math.min(x0 + e.clientX - dx0, window.innerWidth - 80));
      const ny = Math.max(44, Math.min(y0 + e.clientY - dy0, window.innerHeight - 120));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
    });
    titlebar.addEventListener('pointerup', () => { dragging = false; });
    titlebar.addEventListener('dblclick', () => toggleMax(rec));

    /* 窗口按钮 */
    el.querySelector('[data-act="min"]').addEventListener('click', () => minimize(rec));
    el.querySelector('[data-act="max"]').addEventListener('click', () => toggleMax(rec));
    el.querySelector('[data-act="close"]').addEventListener('click', () => closeWindow(rec));

    function minimize(r) {
      r.minimized = true;
      r.el.classList.add('minimized');
      notifyDock();
    }
    function toggleMax(r) {
      r.maximized = !r.maximized;
      r.el.classList.toggle('maximized', r.maximized);
      const btn = titlebar.querySelector('[data-act="max"]');
      btn.innerHTML = r.maximized ? B_RESTORE : B_MAX;
    }
    function closeWindow(r) {
      r.el.remove();
      const list = registry.get(r.appId);
      if (list) {
        const i = list.indexOf(r);
        if (i >= 0) list.splice(i, 1);
        if (!list.length) registry.delete(r.appId);
      }
      notifyDock();
    }

    rec.focus = () => { rec.minimized = false; rec.el.classList.remove('minimized'); setFocus(rec); };
    rec.minimize = () => minimize(rec);
    rec.toggleMax = () => toggleMax(rec);
    rec.close = () => closeWindow(rec);
    rec.setContent = (htmlOrNode) => {
      body.innerHTML = '';
      if (typeof htmlOrNode === 'string') body.innerHTML = htmlOrNode;
      else if (htmlOrNode instanceof Element) body.appendChild(htmlOrNode);
    };

    setFocus(rec);
    return rec;
  }

  function windowsOf(appId) { return registry.get(appId) || []; }
  function allWindows() { const out = []; registry.forEach((l) => out.push(...l)); return out; }
  function focusedWindow() {
    let top = null;
    allWindows().forEach((w) => { if (w.el.classList.contains('focus')) top = w; });
    return top;
  }

  window.WindowManager = { createWindow, windowsOf, allWindows, focusedWindow };
})();
