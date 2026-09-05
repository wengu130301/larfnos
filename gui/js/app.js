/**
 * app.js —— LarfnOS Shell 主控
 * 顶栏 / 启动台 / Dock / 右键菜单 / 电源对话框 / 桌面状态轮询。
 * 启动后立即从桥接层拉取应用清单并渲染界面（Dock 可点击启动窗口）。
 */
(function () {
  'use strict';
  const Sys = window.MarvisSys;
  const WM = window.WindowManager;

  /* ============ 全局应用注册 ============ */
  const AppRegistry = [];
  let appsLoaded = false;

  function loadApps() {
    AppRegistry.length = 0;
    Object.keys(window.Apps.builtins).forEach((id) => {
      const a = window.Apps.builtins[id];
      AppRegistry.push({ id: a.id, name: a.name, color: a.color, iconHTML: a.iconHTML, kind: 'embedded' });
    });
    // 拉取原生应用清单；失败（无原生）则用内置演示清单
    Sys.listApps().then((list) => {
      if (Array.isArray(list)) {
        list.forEach((a) => {
          if (!window.Apps.lookup(a.id)) {
            AppRegistry.push({ id: a.id, name: a.name, color: a.color || 'blue', kind: a.kind || 'external', iconHTML: genericIcon });
          }
        });
      }
      renderLauncher();
    }).finally(() => {
      appsLoaded = true;
      renderDock();
    });
    renderLauncher(); // 先以内置应用立刻出首帧
  }

  function genericIcon(s) {
    return '<svg viewBox="0 0 24 24" width="' + (s||48) + '" height="' + (s||48) + '"><rect x="4" y="4" width="16" height="16" rx="4" fill="#3584e4" opacity=".9"/><path d="M8.5 16l3-4 2.2 2.8 1.5-2L19 16H8.5z" fill="#fff" opacity=".8"/><circle cx="9" cy="9" r="1.4" fill="#fff" opacity=".85"/></svg>';
  }

  /* ============ 应用启动 ============ */
  const App = {
    registry: AppRegistry,
    launch(id) {
      const app = window.Apps.lookup(id);
      if (!app) { Sys.notify('LarfnOS', '未找到应用：' + id); return; }
      const wins = WM.windowsOf(id);
      if (wins.length) { wins[wins.length - 1].focus(); return; } // 已打开则聚焦
      const rec = WM.createWindow(app, { title: app.name });
      app.launch(rec.body);
    }
  };
  window.App = App;

  /* ============ Dock ============ */
  const dockApps = document.getElementById('dock-apps');

  function renderDock() {
    dockApps.innerHTML = '';
    AppRegistry.forEach((a) => {
      const b = document.createElement('button');
      b.className = 'dock-icon';
      b.dataset.appId = a.id;
      b.setAttribute('aria-label', a.name);
      b.title = a.name;
      b.innerHTML =
        '<span class="di-ic c-' + a.color + '">' + (a.iconHTML ? a.iconHTML(26) : genericIcon(26)) + '</span>' +
        '<span class="tip">' + esc(a.name) + '</span>' +
        '<span class="run-dot"></span>';
      b.addEventListener('click', () => {
        const wins = WM.windowsOf(a.id);
        if (wins.length) {
          const top = wins[wins.length - 1];
          if (top.el.classList.contains('focus')) top.minimize();
          else top.focus();
        } else {
          App.launch(a.id); // 关键修复：点击 Dock 真正拉起窗口
        }
      });
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openCtxMenu(e.clientX, e.clientY, a);
      });
      dockApps.appendChild(b);
    });
    syncDock();
  }

  function syncDock() {
    dockApps.querySelectorAll('.dock-icon').forEach((b) => {
      const id = b.dataset.appId;
      const wins = WM.windowsOf(id);
      b.classList.toggle('running', wins.length > 0);
      b.classList.toggle('focused', wins.some((w) => w.el.classList.contains('focus')));
    });
  }
  document.addEventListener('dock:update', syncDock);

  /* ============ 启动台 ============ */
  const launcher = document.getElementById('launcher');
  const launcherGrid = document.getElementById('launcher-grid');
  const launcherSearch = document.getElementById('launcher-search');

  function renderLauncher(filter) {
    const kw = (filter || '').trim().toLowerCase();
    launcherGrid.innerHTML = '';
    AppRegistry.filter((a) => !kw || a.name.toLowerCase().includes(kw)).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'launcher-app';
      b.innerHTML =
        '<span class="la-ic c-' + a.color + '">' + (a.iconHTML ? a.iconHTML(30) : genericIcon(30)) + '</span>' +
        '<span>' + esc(a.name) + '</span>';
      b.addEventListener('click', () => { toggleLauncher(false); App.launch(a.id); });
      launcherGrid.appendChild(b);
    });
    if (!launcherGrid.children.length) launcherGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-dim);padding:40px">没有匹配的应用</div>';
  }
  function toggleLauncher(show) {
    const to = show === undefined ? launcher.hidden : !show;
    launcher.hidden = to;
    if (!to) { renderLauncher(launcherSearch.value); launcherSearch.focus(); }
    else launcherSearch.blur();
  }

  /* ============ 顶栏 ============ */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function tickClock() {
    const now = new Date();
    document.getElementById('clock-time').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
    document.getElementById('clock-date').textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 周' + WEEK[now.getDay()];
  }
  setInterval(tickClock, 1000 * 20);
  tickClock();

  function pollStats() {
    Sys.getStats().then((s) => {
      if (!s) return;
      document.getElementById('stat-cpu-mini').textContent = 'CPU ' + Math.round(Number(s.cpu) || 0) + '%';
      document.getElementById('stat-mem-mini').textContent = 'MEM ' + Math.round(Number(s.mem) || 0) + '%';
      const net = document.getElementById('qp-net');
      const ip = document.getElementById('qp-ip');
      if (net) net.textContent = '网络：' + (s.net || '已连接');
      if (ip) ip.textContent = 'IPv4：' + (s.ip || '--');
    }).catch(() => {});
  }
  setInterval(pollStats, 3000);
  pollStats();

  /* ============ 日历 ============ */
  function renderCalendar() {
    const pop = document.getElementById('calendar-pop');
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const first = new Date(y, m, 1);
    const startDow = first.getDay();
    const days = new Date(y, m + 1, 0).getDate();
    let html = '<h4>' + y + '年' + (m + 1) + '月</h4><div class="cal-grid">';
    ['日', '一', '二', '三', '四', '五', '六'].forEach((w) => html += '<div class="cal-h">' + w + '</div>');
    for (let i = 0; i < startDow; i++) html += '<div class="cal-d other"></div>';
    for (let d = 1; d <= days; d++) {
      const today = (d === now.getDate()) ? ' today' : '';
      html += '<div class="cal-d' + today + '">' + d + '</div>';
    }
    html += '</div>';
    pop.innerHTML = html;
  }

  /* ============ 面板显隐控制 ============ */
  function hidePopups(except) {
    [['calendar-pop', 'tb-clock'], ['quick-panel', 'btn-status'], ['launcher', null]].forEach(([pid]) => {
      if (pid === except) return;
      const el = document.getElementById(pid);
      if (pid === 'launcher') { if (!el.hidden) el.hidden = true; }
      else if (el && !el.hidden) el.hidden = true;
    });
    hideCtx();
  }
  function toggleEl(id) {
    const el = document.getElementById(id);
    if (el.hidden) { hidePopups(id); el.hidden = false; }
    else el.hidden = true;
    if (id === 'calendar-pop' && !el.hidden) renderCalendar();
  }

  document.getElementById('tb-clock').addEventListener('click', () => toggleEl('calendar-pop'));
  document.getElementById('btn-status').addEventListener('click', () => toggleEl('quick-panel'));
  document.getElementById('btn-net').addEventListener('click', () => toggleEl('quick-panel'));
  document.getElementById('btn-vol').addEventListener('click', () => toggleEl('quick-panel'));
  document.getElementById('btn-batt').addEventListener('click', () => toggleEl('quick-panel'));
  document.getElementById('btn-activities').addEventListener('click', () => toggleLauncher());
  document.getElementById('btn-appmenu').addEventListener('click', () => toggleLauncher());
  document.getElementById('btn-dock-launcher').addEventListener('click', () => toggleLauncher());
  launcher.addEventListener('click', (e) => { if (e.target === launcher) toggleLauncher(false); });
  launcherSearch.addEventListener('input', () => renderLauncher(launcherSearch.value));

  /* ============ 快捷面板控件 ============ */
  const qpBright = document.getElementById('qp-bright');
  const qpVolume = document.getElementById('qp-volume');
  qpBright.addEventListener('input', () => {
    document.getElementById('qp-bright-val').textContent = qpBright.value + '%';
    Sys.setSetting('brightness', qpBright.value);
  });
  qpVolume.addEventListener('input', () => {
    document.getElementById('qp-vol-val').textContent = qpVolume.value + '%';
    Sys.setSetting('volume', qpVolume.value);
  });
  function qpButton(id, onText, offText, key) {
    const b = document.getElementById(id);
    b.addEventListener('click', () => {
      const on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      b.textContent = on ? onText : offText;
      Sys.setSetting(key, on);
    });
  }
  qpButton('qp-wifi', '无线网络', '无线已关', 'wifi');
  qpButton('qp-bt', '蓝牙', '蓝牙已关', 'bluetooth');
  document.getElementById('qp-theme').addEventListener('click', () => {
    const themes = ['aurora', 'forest', 'dusk', 'ocean'];
    const cur = themes.indexOf(document.body.dataset.theme);
    const next = themes[(cur + 1) % themes.length];
    document.body.dataset.theme = next;
    Sys.setSetting('theme', next);
    toast('主题已切换');
  });
  document.getElementById('qp-settings').addEventListener('click', () => { hidePopups(); App.launch('settings'); });
  document.getElementById('qp-lock').addEventListener('click', () => {
    document.body.classList.add('locked');
    toast('屏幕已锁定（演示模式）');
    setTimeout(() => { const unlock = confirm('解锁 LarfnOS 演示屏幕？'); document.body.classList.remove('locked'); }, 0);
  });
  document.getElementById('qp-power').addEventListener('click', () => { hidePopups(); powerDialog(); });

  /* ============ 电源 ============ */
  const powerDlg = document.getElementById('power-dialog');
  function powerDialog() {
    document.getElementById('pd-msg').textContent = '执行以下操作后窗口将交由系统层处理。';
    powerDlg.hidden = false;
  }
  function doPower(action) {
    powerDlg.hidden = true;
    Sys.power(action).then(() => {
      toast(action === 'shutdown' ? '正在关机…' : '正在重启…');
    }).catch(() => toast('系统层未响应（演示模式不执行真实电源操作）'));
  }
  document.getElementById('pd-cancel').addEventListener('click', () => { powerDlg.hidden = true; });
  document.getElementById('pd-reboot').addEventListener('click', () => doPower('reboot'));
  document.getElementById('pd-shutdown').addEventListener('click', () => doPower('shutdown'));

  /* ============ 右键菜单 ============ */
  const ctx = document.getElementById('ctx-menu');
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function ctxItem(label, fn) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => { hideCtx(); fn(); });
    return b;
  }
  function openCtxMenu(x, y, app) {
    ctx.innerHTML = '';
    ctx.appendChild(ctxItem('打开', () => App.launch(app.id)));
    ctx.appendChild(ctxItem('显示所有应用', () => toggleLauncher(true)));
    const sep = document.createElement('div');
    sep.className = 'menu-sep';
    ctx.appendChild(sep);
    ctx.appendChild(ctxItem('关于系统', () => App.launch('about')));
    ctx.appendChild(ctxItem('更改壁纸', () => App.launch('settings')));
    ctx.appendChild(ctxItem('打开终端', () => App.launch('terminal')));
    ctx.appendChild(sep.cloneNode());
    ctx.appendChild(ctxItem('设置', () => App.launch('settings')));
    ctx.appendChild(ctxItem('锁定屏幕', () => {
      document.body.classList.add('locked');
      setTimeout(() => { document.body.classList.remove('locked'); }, 600);
    }));
    ctx.appendChild(ctxItem('电源', powerDialog));
    ctx.hidden = false;
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.min(x, window.innerWidth - r.width - 6) + 'px';
    ctx.style.top = Math.min(y, window.innerHeight - r.height - 6) + 'px';
  }
  function hideCtx() { ctx.hidden = true; }
  document.getElementById('desktop').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openCtxMenu(e.clientX, e.clientY, { id: 'files', name: '桌面' });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu') && !e.target.closest('.tb-btn') && !e.target.closest('.tb-ic') && !e.target.closest('.tb-clock') && !e.target.closest('.dock-icon')) hidePopups();
  });

  /* ============ 桌面图标 ============ */
  function renderDesktopIcons() {
    const host = document.getElementById('desktop-icons');
    const deskApps = AppRegistry.slice(0, 6);
    deskApps.forEach((a, i) => {
      const d = document.createElement('button');
      d.className = 'desk-icon';
      d.style.gridRow = 'auto';
      d.innerHTML = '<span class="di-ic" style="width:auto;height:auto;background:none;box-shadow:none">' +
        '<span class="la-ic c-' + a.color + '" style="width:46px;height:46px;border-radius:13px">' + (a.iconHTML ? a.iconHTML(24) : genericIcon(24)) + '</span>' +
        '</span><span>' + esc(a.name) + '</span>';
      d.addEventListener('click', () => App.launch(a.id));
      d.addEventListener('dblclick', () => App.launch(a.id));
      host.appendChild(d);
    });
  }

  /* ============ Toast ============ */
  function toast(msg) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 2200);
  }
  window.LarfnToast = toast;

  /* ============ 系统通知演示 ============ */
  function bootNotice() {
    Sys.getInfo().then((s) => {
      setTimeout(() => {
        Sys.notify('欢迎使用 ' + (s && s.name || 'LarfnOS'), '图形外壳已就绪，点击下方 Dock 图标打开应用。');
      }, 900);
    });
  }

  /* ============ 启动 ============ */
  document.addEventListener('DOMContentLoaded', () => {
    loadApps();
    renderDesktopIcons();
    bootNotice();
    setTimeout(() => {
      // 首启演示：自动打开"关于"窗口，证明窗口系统可用
      if (!window.__booted) {
        window.__booted = true;
        App.launch('about');
      }
    }, 1400);
  });
})();
