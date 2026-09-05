---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 61a5cf72abe713e5c0125a0bbe6814bd_cadb6658a8dd11f1be88525400aeaaa3
    ReservedCode1: Q8IgtPsMVS/BlH52CuAtKj8v0HNXX6lbxWxkylJ8FJLAiPV8hg0oCSVJ20Y+KDNA0QzXjJaL9XkNdabXdcOKOOtt6Pwht4TziAJigbw98tkQBgGDKwpLRkjSSaVWDfzXNPO33dT7ZnPe7Ewhbw2gFkeWzGEC8zkvlSqNR3aRosiekaiNztonp737Tzs=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 61a5cf72abe713e5c0125a0bbe6814bd_cadb6658a8dd11f1be88525400aeaaa3
    ReservedCode2: Q8IgtPsMVS/BlH52CuAtKj8v0HNXX6lbxWxkylJ8FJLAiPV8hg0oCSVJ20Y+KDNA0QzXjJaL9XkNdabXdcOKOOtt6Pwht4TziAJigbw98tkQBgGDKwpLRkjSSaVWDfzXNPO33dT7ZnPe7Ewhbw2gFkeWzGEC8zkvlSqNR3aRosiekaiNztonp737Tzs=
---

# LarfnOS

面向 x86_64 的 Linux 桌面系统：WebKitGTK 渲染的真实图形外壳（非"网页项目"），
由原生 C 桥接层直通系统资源，登录后即接管整机桌面。

```
native/   原生图形外壳（C / WebKitGTK）
  ├── larfn-shell.c   主程序：窗口承载 / IPC 收发 / 全屏 GUI 会话
  ├── bridge.c        桥接分发表：sys.* / app.launch / notify / settings / wm.*
  └── Makefile        make install 将 GUI+清单+服务一并安装到 /usr/share/larfn
gui/      界面层（HTML/CSS/JS，矢量图标，零 Emoji）
  ├── index.html         桌面 Shell：顶栏 / 启动台 / Dock / 窗口 / 通知
  ├── css/main.css       现代 Linux 桌面样式（玻璃拟态 + 全矢量图标）
  └── js/
      ├── bridge.js      界面↔原生 IPC 通道（messageHandlers.larfn，无原生时降级演示）
      ├── sysapi.js      系统 API：stats/apps/files/exec/power/settings/notify
      ├── apps.js        内置应用：文件/编辑器/终端/设置/关于
      ├── window-manager.js  窗口系统：拖动 / 缩放 / 最小化 / 最大化 / 关闭
      └── app.js         桌面 Shell 主控：Dock 点击拉起窗口、启动台、顶栏、电源
iso/      ISO 打包（archiso x86_64）
  ├── build-iso.sh       一键构建 larfnos-x86_64-<日期>.iso
  └── usr_lib_systemd_user/larfn-shell.service  用户图形会话开机自启
```

## 它是"真 GUI"，不是网页壳

| 能力 | 实现 |
| --- | --- |
| 桌面会话 | larfn-shell.service 随 graphical-session 拉起，替换传统桌面 |
| Dock 点击 | 真实打开窗口（内置应用）或经 bridge 拉起原生应用 |
| 窗口系统 | 拖动 / 焦点 / 最小化 / 最大化 / 关闭，状态同步 Dock 运行点 |
| 系统状态 | sys.stats 读取 CPU/内存/网络/IP，顶栏实时轮询 |
| 电源/通知 | systemd-logind 电源操作、D-Bus 桌面通知（原生态） |
| 应用清单 | /usr/share/larfn/apps/*.json 作为 Dock / 启动台数据源 |
| 无原生环境 | 自动降级演示数据，前端在浏览器中仍完整可交互 |

## 本地预览（开发调试）

无需原生环境即可预览界面：直接打开 `gui/index.html`（bridge.js 自动进入演示降级模式）。

## 构建 ISO

在 Arch Linux x86_64 构建机执行（需 root 与 archiso）：

```bash
sudo pacman -S archiso
cd iso
sudo ./build-iso.sh
# 产物 out/larfnos-x86_64-YYYYMMDD.iso
qemu-system-x86_64 -cdrom out/larfnos-x86_64-*.iso -m 2048 -enable-kvm
```

ISO 内流程：archiso 注入源码 → chroot 内 `make install`（编译 larfn-shell 并部署
GUI 到 `/usr/share/larfn/gui`）→ systemd 图形会话自启 larfn-shell → 进入 LarfnOS 桌面。

## 原生 IPC 契约（勿随意改动）

- 界面层：`webkit.messageHandlers.larfn.postMessage({id, cmd, params})`
- 系统层：`bridge.c` 的 `k_commands[]` 按 cmd 分发（`sys.stats`、`sys.listApps`、
  `sys.listFiles`、`sys.exec`、`sys.power`、`settings.*`、`notify.send`、`system.info`）
- 应用清单 `/usr/share/larfn/apps/*.json`，格式：
  `{"id":"terminal","name":"终端","kind":"external|embedded","exec":"..."}`
*（内容由AI生成，仅供参考）*
