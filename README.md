# LarfnOS GUI

LarfnOS 桌面系统的图形界面层（GUI Shell），基于 HTML/CSS/JS 构建，由 WebKitGTK 原生进程（larfn-shell）渲染承载，登录后即接管整机桌面。

> 本仓库为前端部分，供 GUI 界面开发与迭代使用。原生 C 层与 ISO 构建脚本不在此仓库中。

## 界面组成

```
gui/
  ├── index.html           桌面 Shell 主页面：顶栏 / 启动台 / Dock / 窗口 / 通知
  ├── css/main.css         桌面样式（玻璃拟态 + 全矢量图标，零 Emoji）
  └── js/
      ├── bridge.js        界面 ↔ 原生 IPC 通道（messageHandlers.larfn，无原生时自动降级为演示模式）
      ├── sysapi.js        系统 API 封装：stats / apps / files / exec / power / settings / notify
      ├── apps.js          内置应用：文件 / 编辑器 / 终端 / 设置 / 关于
      ├── window-manager.js  窗口系统：拖动 / 缩放 / 最小化 / 最大化 / 关闭
      └── app.js           桌面 Shell 主控：Dock 拉起窗口 / 启动台 / 顶栏 / 电源菜单
docs/
  └── 接口文档.md          前端 ↔ 原生桥接接口说明（消息通道 / 命令表 / JS API / 事件）
```

## 快速预览

无 Linux 原生环境时，直接用浏览器打开 `gui/index.html` 即可进入演示模式：`bridge.js` 会降级为本地 mock，界面功能可完整浏览与操作。

## 开发约定

- 界面图标一律使用内联 SVG，**禁止使用 Emoji**
- 前端通过 `bridge.js` 暴露的通道调用系统能力；可直接调用的全局 API 与事件见 [docs/API.md](docs/API.md)
- 修改请保持现有目录结构与命名风格，不引入构建工具链，纯静态文件即可

## License

All rights reserved. 仅供项目协作者开发使用。
