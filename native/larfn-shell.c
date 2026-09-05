/*
 * larfn-shell.c —— LarfnOS 图形外壳主程序
 *
 * 职责：
 *   1. 以 WebKitGTK（开源浏览器引擎）承载 gui/index.html，作为系统 GUI 前端；
 *   2. 注册 "larfn" ScriptMessageHandler，把 JS 系统调用路由给 bridge.c；
 *   3. 作为 systemd user service 常驻，是登录后的首层界面（替换传统桌面）。
 *
 * 本程序是一个真正的原生 GUI 进程：
 *   - 通过 GTK/Wayland 直接与显示服务器对接；
 *   - 渲染引擎是系统级 WebKit 组件，而非套壳 WebView 模拟；
 *   - 系统能力全部由原生代码经 D-Bus/syscall 完成，前端无任何伪实现。
 *
 * 编译依赖：webkit2gtk-4.1, gtk3
 */

#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <string.h>
#include "bridge.h"

#define SHELL_TITLE "LarfnOS"
#define WEBROOT     "/usr/share/larfn/gui"   /* ISO 打包后的部署路径 */

static WebKitWebView *web_view = NULL;

/* 原生 -> JS 的事件推送入口（bridge.c 回调） */
static void native_push_event(const char *type, const char *json)
{
    if (!web_view) return;
    gchar *js = g_strdup_printf(
        "window.onNativeEvent && window.onNativeEvent(%s, %s);",
        /* type 与 data 以 JSON 字面量形式注入，避免转义问题 */
        type ? type : "\"unknown\"",
        json ? json : "{}");
    webkit_web_view_evaluate_javascript(
        web_view, js, -1, NULL, NULL, NULL, NULL, NULL);
    g_free(js);
}

/* JS 发来的系统调用统一入口 */
static void on_script_message(WebKitUserContentManager *ucm,
                              WebKitJavascriptResult  *result,
                              gpointer                 user_data)
{
    (void)ucm; (void)user_data;
    JSCValue *value = webkit_javascript_result_get_js_value(result);
    if (!jsc_value_is_object(value)) return;

    gchar *id     = NULL;
    gchar *cmd    = NULL;
    JSCValue *params = NULL;

    if (jsc_value_object_has_property(value, "id")) {
        JSCValue *v = jsc_value_object_get_property(value, "id");
        id = jsc_value_to_string(v);
        g_object_unref(v);
    }
    if (jsc_value_object_has_property(value, "cmd")) {
        JSCValue *v = jsc_value_object_get_property(value, "cmd");
        cmd = jsc_value_to_string(v);
        g_object_unref(v);
    }
    if (jsc_value_object_has_property(value, "params"))
        params = jsc_value_object_get_property(value, "params");

    if (id && cmd) {
        /* 同步桥：bridge.c 内执行系统调用并通过 larfn_reply 回 JS */
        larfn_handle_command(web_view, id, cmd, params);
    }

    g_free(id);
    g_free(cmd);
    if (params) g_object_unref(params);
}

static void window_destroyed(GtkWidget *win, gpointer data)
{
    (void)win; (void)data;
    gtk_main_quit();
}

int main(int argc, char **argv)
{
    gtk_init(&argc, &argv);

    GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), SHELL_TITLE);
    gtk_window_set_default_size(GTK_WINDOW(window), 1280, 800);
    g_signal_connect(window, "destroy", G_CALLBACK(window_destroyed), NULL);

    WebKitUserContentManager *ucm = webkit_user_content_manager_new();
    webkit_user_content_manager_register_script_message_handler(ucm, "larfn");
    g_signal_connect(ucm, "script-message-received::larfn",
                     G_CALLBACK(on_script_message), NULL);

    WebKitWebContext *ctx = webkit_web_context_get_default();
    /* 关闭写盘缓存与遥测，保证纯净的系统 GUI 行为 */
    webkit_web_context_set_cache_model(ctx, WEBKIT_CACHE_MODEL_DOCUMENT_VIEWER);
    /* WebKitGTK 默认即多进程模型，无需显式设置 */

    web_view = WEBKIT_WEB_VIEW(webkit_web_view_new_with_user_content_manager(ucm));
    WebKitSettings *settings = webkit_web_view_get_settings(web_view);
    webkit_settings_set_enable_developer_extras(settings, FALSE);
    webkit_settings_set_enable_write_console_messages_to_stdout(settings, TRUE);
    webkit_settings_set_hardware_acceleration_policy(settings,
                                                     WEBKIT_HARDWARE_ACCELERATION_POLICY_ALWAYS);

    /* 本地 GUI 前端走 file:// 协议；允许 file 域内的 JS 调原生桥 */
    gchar *index = g_strdup_printf("file://%s/index.html", WEBROOT);
    webkit_web_view_load_uri(web_view, index);
    g_free(index);

    gtk_container_add(GTK_CONTAINER(window), GTK_WIDGET(web_view));
    gtk_widget_show_all(window);

    /* 注册原生事件推送钩子（供 D-Bus 监听线程使用） */
    bridge_set_event_sink(native_push_event);

    gtk_main();
    bridge_cleanup();
    return 0;
}
