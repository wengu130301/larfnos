/**
 * bridge.js —— LarfnOS 界面层 <-> 原生图形外壳 桥接通道
 *
 * 契约（保持不变）：
 *   - 界面层 -> 系统层：Native.invoke(cmd, params) 经 messageHandlers.larfn 投递
 *   - 系统层 -> 界面层：原生调 onNativeReply / onNativeEvent 注入
 *   - 无原生环境（hasNative=false）自动降级为本机调试模拟，界面完整可交互。
 *
 * 这不是"网页的 ajax"，而是系统图形外壳的 IPC：cmd 由 native/bridge.c
 * 的 k_commands[] 分发表映射到真实系统调用。
 */
(function (global) {
  'use strict';

  const HAS_NATIVE = !!(global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.larfn);

  function invoke(cmd, params) {
    params = params || {};
    const id = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const payload = { id, cmd, params };

    if (HAS_NATIVE) {
      return new Promise((resolve, reject) => {
        global.__nativeResolvers = global.__nativeResolvers || {};
        global.__nativeResolvers[id] = { resolve, reject };
        global.webkit.messageHandlers.larfn.postMessage(payload);
        setTimeout(() => {
          if (global.__nativeResolvers[id]) {
            delete global.__nativeResolvers[id];
            reject(new Error('native timeout: ' + cmd));
          }
        }, 8000);
      });
    }
    return mockInvoke(cmd, params);
  }

  global.onNativeReply = function (id, ok, data) {
    const entry = (global.__nativeResolvers || {})[id];
    if (!entry) return;
    delete global.__nativeResolvers[id];
    ok ? entry.resolve(data) : entry.reject(new Error((data && data.error) || 'native error'));
  };

  global.onNativeEvent = function (type, data) {
    global.dispatchEvent(new CustomEvent('native-event', { detail: { type, data } }));
  };

  /* ---------- 本机调试模拟（原生接管后由真实系统数据覆盖） ---------- */
  const MOCK_APPS = [
    { id: 'files',    name: '文件',     kind: 'embedded', icon: 'folder', color: 'blue' },
    { id: 'editor',   name: '文本编辑器', kind: 'embedded', icon: 'edit',   color: 'orange' },
    { id: 'terminal', name: '终端',     kind: 'embedded', icon: 'term',   color: 'green' },
    { id: 'settings', name: '设置',     kind: 'embedded', icon: 'gear',   color: 'purple' },
    { id: 'about',    name: '关于',     kind: 'embedded', icon: 'info',   color: 'red' }
  ];
  const MOCK_FILES = {
    home: [
      { n: '文档', d: true }, { n: '图片', d: true }, { n: '下载', d: true },
      { n: 'readme.txt', d: false }, { n: 'notes.md', d: false }, { n: 'project.tar.xz', d: false }
    ],
    docs: [{ n: '系统设计.md', d: false }, { n: '发布计划.md', d: false }],
    pics: [{ n: 'aurora.png', d: false }, { n: 'wallpaper-01.svg', d: false }],
    down: [{ n: 'larfnos-x86_64-20260905.iso', d: false }]
  };
  const SYS = {
    name: 'LarfnOS', version: '1.0 (dev)', arch: 'x86_64',
    kernel: '6.6.2-larfn', shell: 'larfn-shell', compositor: 'WebKitGTK + Wayland'
  };

  let mock = { cpu: 12, mem: 41, vol: 60, bright: 80, wifi: true, bt: true };

  function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function mockInvoke(cmd, params) {
    await delay(90 + Math.random() * 150);
    switch (cmd) {
      case 'sys.stats': {
        mock.cpu = Math.max(2, Math.min(95, mock.cpu + (Math.random() * 10 - 5)));
        mock.mem = Math.max(12, Math.min(90, mock.mem + (Math.random() * 5 - 2.5)));
        return {
          cpu: mock.cpu.toFixed(1), mem: mock.mem.toFixed(1),
          disk: 37.6, net: '以太网 已连接',
          kernel: SYS.kernel + ' (debug-mode)',
          ip: '192.168.1.108'
        };
      }
      case 'sys.listApps': return JSON.parse(JSON.stringify(MOCK_APPS));
      case 'sys.listFiles': {
        const loc = (params && params.path) || 'home';
        return { path: '/' + loc, items: MOCK_FILES[loc] || [] };
      }
      case 'sys.exec': {
        const c = (params && params.cmd) || '';
        return execMock(c);
      }
      case 'sys.power':
        return { ok: true, action: params && params.action };
      case 'settings.set': {
        if (params && params.key === 'theme') document.body.dataset.theme = params.value || 'aurora';
        if (params && params.key === 'volume') mock.vol = Number(params.value) || 60;
        if (params && params.key === 'brightness') mock.bright = Number(params.value) || 80;
        return { ok: true };
      }
      case 'settings.get': return { volume: mock.vol, brightness: mock.bright, wifi: mock.wifi, bluetooth: mock.bt };
      case 'system.info': return JSON.parse(JSON.stringify(SYS));
      case 'notify.send': return { ok: true };
      case 'wm.snap': return { ok: true };
      default: return { ok: true };
    }
  }

  function execMock(cmd) {
    const t = cmd.trim();
    if (!t) return { stdout: '' };
    const low = t.toLowerCase();
    if (low === 'help') return { stdout: '可用命令：help, clear, neofetch, ls, uname, date, echo <text>, poweroff, reboot' };
    if (low === 'clear') return { stdout: '\u0000CLEAR' };
    if (low === 'neofetch') {
      return { stdout: `        .--.       ${SYS.name} ${SYS.version}\n      .'_\\/_'.     ${SYS.kernel} ${SYS.arch}\n    .'   /\\   '.   Shell: ${SYS.shell}\n    /    /  \\    \\  Compositor: ${SYS.compositor}\n   /    /    \\    \\ Debug: 浏览器降级模式` };
    }
    if (low === 'ls') return { stdout: '文档  图片  下载  readme.txt  notes.md' };
    if (low.startsWith('echo ')) return { stdout: t.slice(5) };
    if (low === 'uname') return { stdout: 'Linux larfn 6.6.2-larfn x86_64' };
    if (low === 'date') return { stdout: new Date().toString() };
    if (low === 'poweroff' || low === 'reboot') return { stdout: '', action: low === 'poweroff' ? 'shutdown' : 'reboot' };
    return { stdout: '', error: 'command not found: ' + t.split(/\s+/)[0] + '（演示终端仅支持 help 列出的命令）' };
  }

  global.MarvisBridge = { invoke, hasNative: HAS_NATIVE };
})(window);
