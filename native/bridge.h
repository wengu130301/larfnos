/*
 * bridge.h —— larfn-shell 原生桥接口定义
 * 前端新增系统能力时，在这里扩展 handle 表并在 bridge.c 落地实现。
 */
#ifndef LARFN_BRIDGE_H
#define LARFN_BRIDGE_H

#include <webkit2/webkit2.h>
#include <jsc/jsc.h>

/* 由 shell 注册的事件推送回调：type/json 均需是合法 JSON 字面量 */
typedef void (*EventSink)(const char *type, const char *json);
void bridge_set_event_sink(EventSink sink);

/* JS 消息总入口：cmd 分发到各系统调用实现 */
void larfn_handle_command(WebKitWebView *view,
                           const char    *req_id,
                           const char    *cmd,
                           JSCValue      *params);

/* 向 JS 回发结果：ok=true 成功 / false 失败 */
void larfn_reply(WebKitWebView *view,
                  const char    *req_id,
                  gboolean       ok,
                  const char    *json_result_or_error);

/* 进程退出前清理（释放临时句柄等） */
void bridge_cleanup(void);

#endif /* LARFN_BRIDGE_H */
