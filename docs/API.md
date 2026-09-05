# LarfnOS GUI 前端 API 文档

> 面向在 `gui/` 中继续开发 HTML 桌面界面的协作者。本文档只描述**浏览器/WebKitGTK 中可直接使用的 JS API 与界面结构约定**。
>
> 两种运行环境：
> - **演示模式**：直接用浏览器打开 `gui/index.html`，`MarvisBridge.hasNative === false`，所有系统调用走本地 mock，界面完整可交互。
> - **真实系统**：由 larfn-shell（WebKitGTK 原生进程）加载时，`hasNative === true`，调用经 IPC 直达原生层（原生层不属于本仓库）。

---

## 1. 脚本加载顺序

`gui/index.html` 中的固定顺序，**请勿调整**：

```
bridge.js → sysapi.js → apps.js → window-manager.js → app.js
```

| 脚本 | 产出全局对象 | 职责 |
| --- | --- | --- |
| `js/bridge.js` | `MarvisBridge` | IPC 通道 + 原生探测 + mock 降级 |
| `js/sysapi.js` | `MarvisSys` | 面向业务的系统 API 封装 |
| `js/apps.js` | `Apps` | 内置应用注册表 |
| `js/window-manager.js` | `WindowManager` | 窗口系统 |
| `js/app.js` | `App`、`LarfnToast` | 桌面 Shell 主控（顶栏/Dock/启动台/电源） |

---

## 2. 全局对象总览

| 对象 | 来源 | 说明 |
| --- | --- | --- |
| `MarvisBridge` | bridge.js | IPC 底层通道 |
| `MarvisSys` | sysapi.js | 系统 API（主入口，推荐优先使用） |
| `WindowManager` | window-manager.js | 窗口创建与管理 |
| `Apps` | apps.js | 应用注册表 |
| `App` | app.js | 应用启动器 |
| `LarfnToast` | app.js | 轻提示 toast |
| `window.onNativeReply` / `window.onNativeEvent` | bridge.js 注入点 | 原生回调入口，**勿覆盖** |

---

## 3. MarvisBridge（bridge.js）

### 3.1 属性

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `MarvisBridge.hasNative` | Boolean | 是否存在原生通道（`window.webkit.messageHandlers.larfn`） |
| `MarvisBridge.invoke(cmd, params?)` | `(String, Object?) => Promise` | 统一 IPC 入口 |

### 3.2 invoke

```js
MarvisBridge.invoke('sys.stats').then(s => console.log(s));
MarvisBridge.invoke('sys.power', { action: 'reboot' });
```

- 成功：resolve 原生/mock 返回对象。
- 失败：reject `Error`（原生错误或 `native timeout: <cmd>`，超时 8 秒）。
- 未知命令在原生环境返回错误；mock 环境多数返回 `{ ok: true }` 兜底。

### 3.3 原生注入点（勿覆盖）

| 名称 | 签名 | 说明 |
| --- | --- | --- |
| `window.onNativeReply(id, ok, data)` | `(String, Boolean, Object) => void` | 原生应答注入，内部按 id 匹配 Promise |
| `window.onNativeEvent(type, data)` | `(String, Object) => void` | 原生事件注入，转成 `native-event` DOM 事件派发 |

业务代码请勿直接调用上述两个函数，也不要覆盖它们。

---

## 4. MarvisSys（sysapi.js）—— 系统 API

所有方法均返回 Promise。

### 4.1 方法一览

| 方法 | 签名 | 底层命令 | 返回内容 |
| --- | --- | --- | --- |
| `hasNative` | `() => Boolean` | — | 是否原生环境 |
| `getStats` | `() => Promise` | `sys.stats` | CPU/内存/磁盘/网络/内核 |
| `getInfo` | `() => Promise` | `system.info` | 系统名/版本/内核/架构/外壳/合成器 |
| `listApps` | `() => Promise` | `sys.listApps` | 应用清单（Dock/启动台数据源） |
| `listFiles` | `(path) => Promise` | `sys.listFiles` | 文件列表 |
| `runCommand` | `(cmd) => Promise` | `sys.exec` | 受限命令执行 |
| `power` | `(action) => Promise` | `sys.power` | 电源操作 |
| `setSetting` | `(key, value) => Promise` | `settings.set` | 写设置 |
| `getSettings` | `() => Promise` | `settings.get` | 读设置 |
| `notify` | `(title, body) => Promise` | `notify.send` | 桌面通知 |
| `onEvent` | `(handler) => Function` | DOM `native-event` | 订阅系统事件，返回退订函数 |

### 4.2 各方法返回结构

#### getStats —— 系统实时状态

```js
// -> { cpu: "12.3", mem: "41.0", disk: "37.6", net: "已连接", kernel: "Linux 6.6.2-larfn" }
MarvisSys.getStats().then(s => {
  console.log(s.cpu + '%', s.mem + '%', s.disk + '%', s.kernel);
});
```

- cpu / mem / disk 为百分比字符串（保留 1 位小数）。
- mock 环境额外返回 `ip` 字段，kernel 带 `(debug-mode)` 后缀。
- 顶栏每 3 秒轮询一次本方法（`#stat-cpu-mini` / `#stat-mem-mini`）。

#### getInfo —— 系统信息

```js
// -> { name: "LarfnOS", version: "1.0 (dev)", arch: "x86_64",
//      kernel: "6.6.2-larfn", shell: "larfn-shell", compositor: "WebKitGTK + Wayland" }
MarvisSys.getInfo().then(console.log);
```

#### listApps —— 应用清单

```js
// 演示环境 -> [{ id:"files", name:"文件", kind:"embedded", icon:"folder", color:"blue" }, ...]
// 原生环境 -> [{ id, name, svg?, exec?, kind }]（来自 /usr/share/larfn/apps/*.json）
MarvisSys.listApps().then(list => list.forEach(a => console.log(a.id, a.name)));
```

#### listFiles —— 文件列表

```js
// 入参 path：演示环境支持 home / docs / pics / down，缺省 home
// -> { path: "/home", items: [ { n: "文档", d: true }, { n: "readme.txt", d: false } ] }
//    d=true 表示目录
MarvisSys.listFiles('home').then(r => console.log(r.path, r.items));
```

#### runCommand —— 受限命令执行

```js
// -> { stdout: "..." } 成功；{ error: "..." } 命令不在白名单/执行失败；
//    mock 终端输入 poweroff/reboot 时返回 { stdout:"", action:"shutdown"|"reboot" }
MarvisSys.runCommand('uname -a').then(r => console.log(r.stdout));
MarvisSys.runCommand('ls /').catch(e => console.error(e.message));
```

#### power —— 电源操作

```js
// action 枚举：shutdown / reboot / suspend / logout
// -> { ok: true, action }
MarvisSys.power('shutdown');
MarvisSys.power('reboot');
```

#### setSetting / getSettings —— 设置

```js
// key 取值：
//   theme      壁纸主题：aurora / forest / dusk / ocean（写 document.body.dataset.theme）
//   volume     音量 0-100
//   brightness 亮度 0-100
//   wifi / bluetooth  布尔开关
MarvisSys.setSetting('theme', 'ocean').then(() => {});
MarvisSys.getSettings().then(s => console.log(s.volume, s.brightness, s.wifi, s.bluetooth));
```

#### notify —— 桌面通知

```js
MarvisSys.notify('LarfnOS', '通知正文');
// -> { ok: true }
```

#### onEvent —— 订阅系统事件

```js
const off = MarvisSys.onEvent(({ type, data }) => {
  console.log('native event:', type, data);
});
// 不需要时退订：
off();
```

> 事件通道已就绪；当前版本原生事件源未接入，业务层暂以预留为主。

---

## 5. WindowManager（window-manager.js）

### 5.1 静态方法

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `createWindow(app, opts?)` | `(Object, Object) => rec` | 创建窗口并返回窗口记录 |
| `windowsOf(appId)` | `(String) => rec[]` | 某应用已打开的窗口 |
| `allWindows()` | `() => rec[]` | 所有窗口 |
| `focusedWindow()` | `() => rec \| null` | 当前聚焦窗口 |

`createWindow` 的 `opts`：

```js
{ width: 640, height: 440, x: 120, y: 80, title: '窗口标题' }
// width/height 缺省 640x440，会被限制在窗口层内（-40px 安全边距）
// x/y 缺省时居中并带随机抖动；title 缺省取 app.name
```

### 5.2 窗口记录 rec

```js
const rec = WindowManager.createWindow({ id: 'files', name: '文件', iconHTML: fn }, { title: '文件' });
rec.el          // 窗口根元素 <section class="win focus">
rec.body        // 内容容器 <div class="win-body">（应用渲染区）
rec.titlebar    // 标题栏元素
rec.minimized   // Boolean 是否最小化
rec.maximized   // Boolean 是否最大化

rec.focus()          // 聚焦并取消最小化
rec.minimize()       // 最小化
rec.toggleMax()      // 最大化/还原切换
rec.close()          // 关闭并从注册表移除
rec.setContent(htmlOrNode)  // 清空 body 并写入 HTML 字符串或 DOM 节点
```

**内置应用渲染范式**：应用启动函数接收 `rec.body` 后向其中填充内容，窗口标题栏/控制按钮由 WindowManager 自动生成。

### 5.3 窗口相关 DOM 事件

- 窗口创建 / 关闭 / 聚焦变化 / 最小化时，`document` 上派发 `dock:update`（无 detail）：
  ```js
  document.addEventListener('dock:update', syncDock);
  ```

---

## 6. Apps（apps.js）与 App（app.js）

### 6.1 Apps 注册表

```js
Apps.builtins   // 内置应用表 { id: { id, name, kind, color, iconHTML, launch } }
Apps.lookup(id) // 按 id 查应用描述，找不到返回 null
Apps.external(id) // 拉起外部应用（原生链路，失败静默）
```

内置应用 ID：`files`（文件）、`editor`（文本编辑器）、`terminal`（终端）、`settings`（设置）、`about`（关于）。

### 6.2 App 启动器

```js
App.registry        // 已加载应用注册表（内置 + 原生清单补充）
App.launch(id)      // 已有窗口则聚焦；否则创建窗口并调用 app.launch(rec.body)
// 找不到应用：Sys.notify('LarfnOS', '未找到应用：' + id)
```

### 6.3 新增内置应用

1. 在 `apps.js` 实现启动函数：`function launchX(body) { /* 向 body 填充界面 */ }`
2. 在 `BUILTINS` 注册：`{ id:'x', name:'应用名', kind:'embedded', color:'blue', iconHTML: I.x, launch: launchX }`
3. 图标使用 `js/apps.js` 内的 SVG 图标集 `I.*`，不要用 Emoji。

---

## 7. LarfnToast（app.js）

```js
LarfnToast('操作成功');   // 顶部轻提示，自动消失
```

---

## 8. 事件汇总

| 事件名 | 挂载点 | detail | 触发时机 | 消费者 |
| --- | --- | --- | --- | --- |
| `native-event` | `window`（CustomEvent） | `{ type, data }` | 原生主动推送（当前无事件源） | `MarvisSys.onEvent` 订阅 |
| `dock:update` | `document` | 无 | 窗口创建/关闭/聚焦/最小化 | app.js `syncDock` |

---

## 9. 桌面 Shell 关键 DOM 约定

以下节点 id 由 `app.js` 驱动，修改 HTML 时请保留（或同步修改对应 JS）：

| id | 用途 |
| --- | --- |
| `#topbar` | 顶栏容器 |
| `#tb-clock` / `#clock-time` / `#clock-date` | 时钟 |
| `#stat-cpu-mini` / `#stat-mem-mini` | CPU/内存指示（3s 轮询） |
| `#btn-net` / `#btn-vol` / `#btn-batt` / `#btn-status` | 顶栏快捷面板入口（class 含 `.tb-ic`） |
| `#quick-panel` | 快捷面板（音量/亮度/开关/主题/IP） |
| `#qp-volume` `#qp-bright` `#qp-wifi` `#qp-bt` `#qp-theme` `#qp-power` `#qp-settings` `#qp-lock` `#qp-ip` | 快捷面板控件 |
| `#dock` / `#dock-apps` / `#btn-dock-launcher` | Dock（`dock:update` 重绘） |
| `#launcher` / `#launcher-grid` / `#launcher-search` | 启动台 |
| `#power-dialog` / `#pd-shutdown` / `#pd-reboot` / `#pd-cancel` / `#pd-msg` | 电源对话框 |
| `#windows-layer` | 窗口层容器（WindowManager 挂载窗口） |
| `#wallpaper` / `#desktop` / `#desktop-icons` | 桌面壁纸/图标层 |
| `#toast-root` | toast 容器 |
| `#notification-stack` | 通知堆栈容器（预留） |
| `#ctx-menu` | 右键菜单（预留） |

**弹层显隐约定（重要）**：所有弹层（`.modal`、`#launcher` 等）通过 HTML `hidden` 属性显隐，CSS 顶部已有 `[hidden] { display: none !important; }`，**不要为弹层直接写 `display:flex` 类覆盖该规则**，否则弹层会常显无法关闭。

**主题切换**：`document.body.dataset.theme` 取值 `aurora / forest / dusk / ocean`，CSS 据此切换壁纸配色。

---

## 10. 开发约定

1. 界面图标一律使用内联 SVG，**禁止 Emoji**。
2. 纯静态文件，无构建工具链；保持现有目录与命名风格。
3. 业务调用系统能力优先走 `MarvisSys`，底层 IPC 由 `MarvisBridge` 统一封装，不要直接 `postMessage`。
4. 新增窗口/应用交互时，保持 `apps.js` 注册 + `window-manager.js` 渲染的现有模式。
5. 不要覆盖 `window.onNativeReply` / `window.onNativeEvent`。
