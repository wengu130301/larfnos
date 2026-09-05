/**
 * apps.js —— LarfnOS 内置应用定义
 * 每个应用提供：id/name/kind/color/iconHTML/launch(bodyContainer)
 * 应用清单可被原生 /usr/share/larfn/apps/*.json 完全替换。
 */
(function () {
  'use strict';

  const I = {
    folder: (s) => '<svg viewBox="0 0 24 24" width="' + (s||48) + '" height="' + (s||48) + '"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" fill="#f6c949" opacity=".95"/><path d="M3 10h18" stroke="#e8b52c" stroke-width="1"/></svg>',
    files: (s) => '<svg viewBox="0 0 24 24" width="'+(s||48)+'" height="'+(s||48)+'"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" fill="#3584e4" opacity=".92"/><rect x="8" y="8" width="8" height="1.6" rx=".8" fill="#fff" opacity=".85"/><rect x="8" y="12" width="8" height="1.6" rx=".8" fill="#fff" opacity=".6"/><rect x="8" y="16" width="5" height="1.6" rx=".8" fill="#fff" opacity=".4"/></svg>',
    edit: (s) => '<svg viewBox="0 0 24 24" width="'+(s||48)+'" height="'+(s||48)+'"><rect x="4" y="3" width="16" height="18" rx="2" fill="#ffa348" opacity=".92"/><rect x="7.5" y="7" width="9" height="1.4" rx=".7" fill="#fff" opacity=".9"/><rect x="7.5" y="11" width="9" height="1.4" rx=".7" fill="#fff" opacity=".6"/><rect x="7.5" y="15" width="6" height="1.4" rx=".7" fill="#fff" opacity=".4"/></svg>',
    term: (s) => '<svg viewBox="0 0 24 24" width="'+(s||48)+'" height="'+(s||48)+'"><rect x="3" y="3" width="18" height="18" rx="2.5" fill="#1d2b3a"/><path d="M7 9l3 3-3 3M12.5 15H17" fill="none" stroke="#57e389" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    gear: (s) => '<svg viewBox="0 0 24 24" width="'+(s||48)+'" height="'+(s||48)+'"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z" fill="#9141ac"/><path d="M12 3.5l1.3 2.6 2.9-.6 1.2 2.6 2.8.9-1 2.6 1.6 2.4-2 2-1.6 2.4-2.8-.9-1.2 2.6-2.9-.6-1.3 2.6-1.3-2.6-2.9.6-1.2-2.6-2.8-.9 1-2.6L3 8.8l2-2 1.6-2.4 2.8.9 1.2-2.6 2.9.6 1.3-2.6z" fill="none" stroke="#b57be0" stroke-width="1.3" opacity=".55"/><circle cx="12" cy="12" r="2" fill="#e2c4f2"/></svg>',
    info: (s) => '<svg viewBox="0 0 24 24" width="'+(s||48)+'" height="'+(s||48)+'"><circle cx="12" cy="12" r="9.2" fill="#f66151" opacity=".9"/><path d="M12 11v5.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.15" fill="#fff"/></svg>'
  };

  function appToolbar(title) {
    return '<div class="app-toolbar">' + title + '</div>';
  }

  /* ---------------- 文件管理器 ---------------- */
  function launchFiles(body) {
    const root = document.createElement('div');
    root.className = 'app-root';
    root.innerHTML =
      '<div class="fm">' +
        '<aside class="fm-side">' +
          '<button data-loc="home" class="on">主目录</button>' +
          '<button data-loc="docs">文档</button>' +
          '<button data-loc="pics">图片</button>' +
          '<button data-loc="down">下载</button>' +
        '</aside>' +
        '<div class="fm-main">' +
          '<div class="app-toolbar"><span class="crumb" id="fm-crumb">/home</span>' +
          '<button class="icon-btn" id="fm-up" title="上级">' + backSvg() + '</button></div>' +
          '<div class="fm-grid" id="fm-grid"></div>' +
          '<div class="app-status">连接：' + (window.MarvisBridge.hasNative ? '原生 sys.listFiles' : '演示数据源') + '</div>' +
        '</div>' +
      '</div>';
    body.appendChild(root);

    const grid = root.querySelector('#fm-grid');
    const crumb = root.querySelector('#fm-crumb');
    const locs = root.querySelectorAll('.fm-side button');

    function render(loc) {
      locs.forEach((b) => b.classList.toggle('on', b.dataset.loc === loc));
      window.MarvisSys.listFiles(loc).then((r) => {
        crumb.textContent = r.path || ('/' + loc);
        grid.innerHTML = '';
        (r.items || []).forEach((it) => {
          const d = document.createElement('div');
          d.className = 'fm-item';
          d.title = it.n;
          d.innerHTML = I.folder(38) + '<div class="fm-name">' + esc(it.n) + '</div>';
          d.addEventListener('click', () => {
            if (it.d) render(it.n.toLowerCase());
            else window.MarvisSys.notify(it.n, '已选择文件');
          });
          grid.appendChild(d);
        });
        if (!(r.items || []).length) grid.innerHTML = '<div style="color:var(--text-dim);font-size:13px;padding:30px">空目录</div>';
      });
    }
    render('home');
    locs.forEach((b) => b.addEventListener('click', () => render(b.dataset.loc)));
  }

  /* ---------------- 文本编辑器 ---------------- */
  function launchEditor(body) {
    const root = document.createElement('div');
    root.className = 'app-root';
    root.innerHTML =
      appToolbar('<span class="crumb">未命名.txt — LarfnOS 编辑器</span>') +
      '<textarea class="ed-area" spellcheck="false" placeholder="在此输入文本…"></textarea>' +
      '<div class="app-status">Ctrl+S 保存（演示模式仅保存到本地会话）</div>';
    body.appendChild(root);
    const ta = root.querySelector('textarea');
    ta.focus();
    ta.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.MarvisSys.notify('编辑器', '已保存（演示会话）');
      }
    });
  }

  /* ---------------- 终端 ---------------- */
  function launchTerminal(body) {
    const root = document.createElement('div');
    root.className = 'app-root';
    root.innerHTML =
      appToolbar('<span class="crumb">larfn@larfnos: ~</span>') +
      '<div class="term" id="term-out"></div>' +
      '<div class="term-input-row"><span class="prompt">larfn@larfnos:~$</span><input id="term-input" autocomplete="off" spellcheck="false"></div>';
    body.appendChild(root);
    const out = root.querySelector('#term-out');
    const input = root.querySelector('#term-input');

    function print(html, cls) {
      const div = document.createElement('div');
      div.className = cls || '';
      div.innerHTML = html;
      out.appendChild(div);
      out.scrollTop = out.scrollHeight;
    }
    function banner() {
      print('LarfnOS 终端 — 输入 help 查看可用命令', 'out');
    }
    function run(cmd) {
      print('<span class="prompt">larfn@larfnos:~$</span> ' + esc(cmd));
      if (!cmd.trim()) return;
      window.MarvisSys.runCommand(cmd).then((r) => {
        if (r.stdout === '\u0000CLEAR') { out.innerHTML = ''; return; }
        if (r.stdout) print(esc(r.stdout), 'out');
        if (r.error) print(esc(r.error), 'err');
        if (r.action) {
          if (r.action === 'reboot') window.MarvisSys.power('reboot');
          if (r.action === 'shutdown') window.MarvisSys.power('shutdown');
        }
      });
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { run(input.value); input.value = ''; }
    });
    banner();
    input.focus();
  }

  /* ---------------- 设置 ---------------- */
  const WALLS = { aurora: '极光', forest: '森林', dusk: '暮色', ocean: '深海' };
  function launchSettings(body) {
    const root = document.createElement('div');
    root.className = 'app-root';
    root.innerHTML =
      '<div class="settings">' +
        '<aside class="settings-nav">' +
          '<button data-page="appearance" class="on">外观</button>' +
          '<button data-page="system">系统</button>' +
        '</aside>' +
        '<div class="settings-page" id="set-page"></div>' +
      '</div>';
    body.appendChild(root);
    const page = root.querySelector('#set-page');
    const navs = root.querySelectorAll('.settings-nav button');

    function appearanceHTML() {
      const cur = document.body.dataset.theme || 'aurora';
      let dots = '';
      Object.keys(WALLS).forEach((k) => {
        dots += '<button class="wall-btn sel-' + (k === cur ? 'sel' : '') + '" data-wall="' + k + '" style="background:' +
          wallGrad(k) + '">' + WALLS[k] + '</button>';
      });
      return '<h4>外观</h4>' +
        '<div class="set-row"><div><div>桌面壁纸</div><div class="sub">更换桌面主题壁纸</div></div><div class="wall-opt">' + dots + '</div></div>' +
        '<div class="set-row"><div><div>界面缩放</div><div class="sub">显示器缩放比例</div></div><button id="set-scale">100%</button></div>' +
        '<div class="set-row"><div><div>通知提示音</div><div class="sub">收到通知时播放提示音</div></div><button id="set-sound">开启</button></div>';
    }
    function systemHTML() {
      return '<h4>系统</h4>' +
        '<div class="set-row"><div><div>本机信息</div><div class="sub">查看系统详情</div></div><button id="set-about">打开关于</button></div>' +
        '<div class="set-row"><div><div>检查更新</div><div class="sub">LarfnOS 当前为开发版</div></div><button id="set-update">检查</button></div>' +
        '<div class="set-row"><div><div>重启</div><div class="sub">重启图形外壳</div></div><button id="set-reboot">重启</button></div>' +
        '<div class="set-row"><div><div>关机</div><div class="sub">关闭系统</div></div><button id="set-power" class="danger" style="color:var(--danger)">关机</button></div>';
    }
    function render(pageName) {
      navs.forEach((b) => b.classList.toggle('on', b.dataset.page === pageName));
      page.innerHTML = pageName === 'appearance' ? appearanceHTML() : systemHTML();
      page.querySelectorAll('.wall-btn').forEach((b) => {
        b.classList.toggle('sel', b.dataset.wall === document.body.dataset.theme);
        b.addEventListener('click', () => {
          window.MarvisSys.setSetting('theme', b.dataset.wall).then(() => {
            document.body.dataset.theme = b.dataset.wall;
            render(pageName);
          });
        });
      });
      const about = page.querySelector('#set-about');
      if (about) about.addEventListener('click', () => App.launch('about'));
      const reboot = page.querySelector('#set-reboot');
      if (reboot) reboot.addEventListener('click', () => window.MarvisSys.power('reboot'));
      const power = page.querySelector('#set-power');
      if (power) power.addEventListener('click', () => window.MarvisSys.power('shutdown'));
    }
    render('appearance');
  }

  /* ---------------- 关于 ---------------- */
  function launchAbout(body) {
    const root = document.createElement('div');
    root.className = 'app-root';
    const sys = window.MarvisSys;
    sys.getInfo().then((s) => {
      const info = Object.assign({ name: 'LarfnOS', version: '1.0', kernel: '待读取', arch: 'x86_64', shell: 'larfn-shell', compositor: 'WebKitGTK + Wayland' }, s);
      root.innerHTML =
        '<div class="about-hero"><div class="logo"><svg viewBox="0 0 24 24" width="46" height="46"><path d="M6 4h9a5 5 0 0 1 0 10h-3v6h-6V4zm6 6h3a1.5 1.5 0 0 0 0-3h-3v3z" fill="#fff"/></svg></div>' +
        '<div><h3 style="font-size:22px">' + esc(info.name) + '</h3><div style="color:var(--text-dim)">' + esc(info.version) + '</div></div></div>' +
        '<dl class="about-meta">' +
          '<dt>内核</dt><dd>' + esc(info.kernel) + '</dd>' +
          '<dt>架构</dt><dd>' + esc(info.arch) + '</dd>' +
          '<dt>图形外壳</dt><dd>' + esc(info.shell) + '</dd>' +
          '<dt>合成器</dt><dd>' + esc(info.compositor) + '</dd>' +
          '<dt>桥接</dt><dd>' + (window.MarvisBridge.hasNative ? '原生 IPC 已连接' : '调试降级模式') + '</dd>' +
          '<dt>说明</dt><dd style="color:var(--text-dim)">面向 x86_64 的真 Linux 桌面系统，界面层为 WebKitGTK 渲染的原生图形外壳。</dd>' +
        '</dl>';
    });
    body.appendChild(root);
  }

  function wallGrad(k) {
    const g = {
      aurora: 'linear-gradient(160deg,#182033,#10141d)',
      forest: 'linear-gradient(160deg,#14301f,#0c1512)',
      dusk: 'linear-gradient(160deg,#2b1433,#170e1f)',
      ocean: 'linear-gradient(160deg,#0b2b4d,#06121f)'
    };
    return g[k] || g.aurora;
  }

  function backSvg() {
    return '<svg viewBox="0 0 24 24" width="15" height="15"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  /** 应用注册表（原生 apps/*.json 可覆盖/扩充） */
  const BUILTINS = {
    files:    { id: 'files',    name: '文件',      kind: 'embedded', color: 'blue',   iconHTML: I.files, launch: launchFiles },
    editor:   { id: 'editor',   name: '文本编辑器', kind: 'embedded', color: 'orange', iconHTML: I.edit,   launch: launchEditor },
    terminal: { id: 'terminal', name: '终端',      kind: 'embedded', color: 'green',  iconHTML: I.term,   launch: launchTerminal },
    settings: { id: 'settings', name: '设置',      kind: 'embedded', color: 'purple', iconHTML: I.gear,   launch: launchSettings },
    about:    { id: 'about',    name: '关于',      kind: 'embedded', color: 'red',    iconHTML: I.info,   launch: launchAbout }
  };

  window.Apps = {
    builtins: BUILTINS,
    lookup(id) {
      return BUILTINS[id] || null;
    },
    /** 原生应用（外部应用，经 bridge 拉起；kind=external 由 app.launch 处理） */
    external(id) {
      return window.MarvisSys.runCommand('app.launch ' + id).catch(() => {});
    }
  };
})();
