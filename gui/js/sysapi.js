/**
 * sysapi.js —— LarfnOS 界面层系统 API（封装 bridge 调用）
 * 每个方法对应 native/bridge.c 的真实系统调用或预留扩展点。
 */
(function () {
  'use strict';
  const B = window.MarvisBridge;

  const Sys = {
    hasNative: () => B.hasNative,

    /** 系统实时状态：CPU/内存/磁盘/网络/内核/IP */
    getStats: () => B.invoke('sys.stats'),

    /** 系统信息：名称/内核/架构 */
    getInfo: () => B.invoke('system.info'),

    /** 应用清单（Dock / 启动台数据源） */
    listApps: () => B.invoke('sys.listApps'),

    /** 文件列表（文件管理器数据源） */
    listFiles: (path) => B.invoke('sys.listFiles', { path }),

    /** 执行受限命令（白名单在原生层控制） */
    runCommand: (cmd) => B.invoke('sys.exec', { cmd }),

    /** 电源操作：shutdown / reboot / suspend / logout */
    power: (action) => B.invoke('sys.power', { action }),

    /** 设置项：theme/volume/brightness 等 */
    setSetting: (key, value) => B.invoke('settings.set', { key, value }),
    getSettings: () => B.invoke('settings.get'),

    /** 桌面通知 */
    notify: (title, body) => B.invoke('notify.send', { title, body }),

    /** 订阅系统事件（原生推送 / 模拟层推送） */
    onEvent(handler) {
      const fn = (e) => handler(e.detail);
      window.addEventListener('native-event', fn);
      return () => window.removeEventListener('native-event', fn);
    }
  };

  window.MarvisSys = Sys;
})();
