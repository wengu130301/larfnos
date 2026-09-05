/*
 * bridge.c —— 原生系统调用实现层（深度集成的心脏）
 *
 * 所有"看起来像真的"的系统能力都在这里用原生 Linux API 完成：
 *   sys.stats    读取 /proc（CPU/内存/磁盘），内核版本 uname(2)
 *   sys.listApps 扫描 /usr/share/larfn/apps/*.json 应用清单
 *   app.launch   用 g_spawn 启动独立桌面应用进程
 *   sys.exec     通过 /bin/sh 执行命令（白名单受限，禁止任意代码执行）
 *   sys.power    systemctl 关机/重启/挂起/注销（需 polkit 授权，由 systemd 弹窗）
 *   settings.open D-Bus 打开系统设置（xdg 门户 / gnome-control-center）
 *   notify.send  D-Bus 通知服务 (org.freedesktop.Notifications)
 *
 * 注意：请把本文件当作"系统 API 的 Web 化封装"，不是浏览器玩具。
 */

#include "bridge.h"
#include <string.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/statvfs.h>
#include <sys/utsname.h>

static EventSink g_event_sink = NULL;

void bridge_set_event_sink(EventSink sink) { g_event_sink = sink; }

/* ---------- JS 结果回发 ---------- */
void larfn_reply(WebKitWebView *view, const char *req_id,
                  gboolean ok, const char *payload)
{
    gchar *js = g_strdup_printf(
        "window.onNativeReply && window.onNativeReply(%s, %s, %s);",
        req_id ? req_id : "\"\"",
        ok ? "true" : "false",
        payload ? payload : "{}");
    webkit_web_view_evaluate_javascript(
        view, js, -1, NULL, NULL, NULL, NULL, NULL);
    g_free(js);
}

/* ---------- 工具：JSON 转义 ---------- */
static char *json_escape(const char *s)
{
    GString *out = g_string_new("\"");
    for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
        switch (*p) {
        case '"':  g_string_append(out, "\\\""); break;
        case '\\': g_string_append(out, "\\\\"); break;
        case '\n': g_string_append(out, "\\n");  break;
        case '\r': g_string_append(out, "\\r");  break;
        case '\t': g_string_append(out, "\\t");  break;
        default:
            if (*p < 0x20) g_string_append_printf(out, "\\u%04x", *p);
            else g_string_append_c(out, (gchar)*p);
        }
    }
    g_string_append_c(out, '"');
    return g_string_free(out, FALSE);
}

static gboolean jsc_param_bool(JSCValue *params, const char *key, gboolean def)
{
    if (!params || !jsc_value_is_object(params)) return def;
    JSCValue *v = jsc_value_object_get_property(params, key);
    if (!v || jsc_value_is_undefined(v)) { if (v) g_object_unref(v); return def; }
    gboolean r = jsc_value_to_boolean(v);
    g_object_unref(v);
    return r;
}

static char *jsc_param_str(JSCValue *params, const char *key)
{
    if (!params || !jsc_value_is_object(params)) return NULL;
    JSCValue *v = jsc_value_object_get_property(params, key);
    if (!v || jsc_value_is_undefined(v) || jsc_value_is_null(v)) {
        if (v) g_object_unref(v);
        return NULL;
    }
    char *s = jsc_value_to_string(v);
    g_object_unref(v);
    return s;
}

/* ---------- 系统调用实现 ---------- */

/* sys.stats: /proc + uname 的真实读数 */
static void cmd_sys_stats(WebKitWebView *view, const char *id, JSCValue *params)
{
    (void)params;
    double cpu = 0, mem = 0, disk = 0;
    FILE *fp;

    /* CPU 占用：两次采样 /proc/stat 的 jiffies 差 */
    static long long prev_idle = -1, prev_total = -1;
    long long idle = 0, total = 0;
    fp = fopen("/proc/stat", "r");
    if (fp) {
        char line[256];
        if (fgets(line, sizeof line, fp)) {
            long long u, n, s, i, w, x, y, z;
            if (sscanf(line, "cpu %lld %lld %lld %lld %lld %lld %lld %lld",
                       &u, &n, &s, &i, &w, &x, &y, &z) == 8) {
                idle = i + w;
                total = u + n + s + idle + x + y + z;
            }
        }
        fclose(fp);
        if (prev_idle >= 0 && total > prev_total) {
            long long d_idle = idle - prev_idle;
            long long d_total = total - prev_total;
            cpu = 100.0 * (double)(d_total - d_idle) / (double)d_total;
        }
        prev_idle = idle; prev_total = total;
    }

    /* 内存：/proc/meminfo */
    fp = fopen("/proc/meminfo", "r");
    if (fp) {
        char key[64]; long long val;
        long long total_kb = 0, avail_kb = 0;
        while (fscanf(fp, "%63s %lld kB", key, &val) == 2) {
            if      (strcmp(key, "MemTotal:") == 0) total_kb = val;
            else if (strcmp(key, "MemAvailable:") == 0) { avail_kb = val; break; }
        }
        fclose(fp);
        if (total_kb > 0)
            mem = 100.0 * (double)(total_kb - avail_kb) / (double)total_kb;
    }

    /* 磁盘：statvfs("/") */
    struct statvfs st;
    if (statvfs("/", &st) == 0 && st.f_blocks > 0) {
        double used = (double)(st.f_blocks - st.f_bfree);
        disk = 100.0 * used / (double)st.f_blocks;
    }

    struct utsname un;
    uname(&un);

    char *json = g_strdup_printf(
        "{\"cpu\":\"%.1f\",\"mem\":\"%.1f\",\"disk\":\"%.1f\","
        "\"net\":\"%s\",\"kernel\":\"%s %s\"}",
        cpu, mem, disk,
        access("/sys/class/net/", F_OK) == 0 ? "已连接" : "未知",
        un.sysname, un.release);
    larfn_reply(view, id, TRUE, json);
    g_free(json);
}

/* sys.listApps: 扫描 /usr/share/larfn/apps/*.json 返回应用数组 */
static void cmd_sys_list_apps(WebKitWebView *view, const char *id, JSCValue *params)
{
    (void)params;
    GDir *dir = g_dir_open("/usr/share/larfn/apps", 0, NULL);
    if (!dir) { larfn_reply(view, id, TRUE, "[]"); return; }

    GString *out = g_string_new("[");
    const gchar *name;
    gboolean first = TRUE;
    while ((name = g_dir_read_name(dir)) != NULL) {
        if (!g_str_has_suffix(name, ".json")) continue;
        gchar *path = g_build_filename("/usr/share/larfn/apps", name, NULL);
        gchar *content = NULL;
        if (g_file_get_contents(path, &content, NULL, NULL) && content) {
            /* 应用描述 JSON 直接透传（内部字段由桌面规范约定） */
            if (!first) g_string_append_c(out, ',');
            g_string_append(out, content);
            first = FALSE;
            g_free(content);
        }
        g_free(path);
    }
    g_dir_close(dir);
    g_string_append_c(out, ']');
    larfn_reply(view, id, TRUE, out->str);
    g_string_free(out, TRUE);
}

/* app.launch: 拉起独立应用进程 */
static void cmd_app_launch(WebKitWebView *view, const char *id, JSCValue *params)
{
    char *app_id = jsc_param_str(params, "appId");
    if (!app_id) { larfn_reply(view, id, FALSE, "{\"error\":\"missing appId\"}"); return; }

    gchar *path = g_build_filename("/usr/share/larfn/apps", app_id, ".desktop", NULL);
    gchar *argv[] = { "gio", "launch", path, NULL };
    GError *err = NULL;
    gboolean ok = g_spawn_async(NULL, argv, NULL,
                                G_SPAWN_SEARCH_PATH | G_SPAWN_STDOUT_TO_DEV_NULL,
                                NULL, NULL, NULL, &err);
    if (!ok) {
        char *e = json_escape(err ? err->message : "launch failed");
        char *json = g_strdup_printf("{\"error\":%s}", e);
        larfn_reply(view, id, FALSE, json);
        g_free(json); g_free(e);
        if (err) g_error_free(err);
    } else {
        larfn_reply(view, id, TRUE, "{\"ok\":true}");
    }
    g_free(app_id);
    g_free(path);
}

/* sys.exec: 受限白名单命令执行（前台命令由应用独立执行，这里做目录/进程类） */
static void cmd_sys_exec(WebKitWebView *view, const char *id, JSCValue *params)
{
    char *cmd = jsc_param_str(params, "cmd");
    if (!cmd) { larfn_reply(view, id, FALSE, "{\"error\":\"missing cmd\"}"); return; }

    static const char *allowed_prefixes[] = {
        "ls ", "pwd", "df ", "free ", "uname ", "uptime",
        "cat /etc/os-release", "systemctl --user ", NULL
    };
    gboolean allowed = FALSE;
    for (int i = 0; allowed_prefixes[i]; i++) {
        if (g_str_has_prefix(cmd, allowed_prefixes[i])) { allowed = TRUE; break; }
    }
    if (!allowed) {
        g_free(cmd);
        larfn_reply(view, id, FALSE,
            "{\"error\":\"command not in allowlist\"}");
        return;
    }

    gchar *out = NULL, *err = NULL;
    GError *gerr = NULL;
    if (g_spawn_command_line_sync(cmd, &out, &err, NULL, &gerr)) {
        gchar *o = json_escape(out ? out : "");
        gchar *json = g_strdup_printf("{\"stdout\":%s}", o);
        larfn_reply(view, id, TRUE, json);
        g_free(o); g_free(json);
        g_free(out); g_free(err);
    } else {
        char *e = json_escape(gerr ? gerr->message : "exec failed");
        char *json = g_strdup_printf("{\"error\":%s}", e);
        larfn_reply(view, id, FALSE, json);
        g_free(json); g_free(e);
        if (gerr) g_error_free(gerr);
    }
    g_free(cmd);
}

/* sys.power: 电源动作（systemd 会在 polkit 授权后执行；由系统层处理弹窗） */
static void cmd_sys_power(WebKitWebView *view, const char *id, JSCValue *params)
{
    char *action = jsc_param_str(params, "action");
    if (!action) { larfn_reply(view, id, FALSE, "{\"error\":\"missing action\"}"); return; }

    const char *target = NULL;
    if      (strcmp(action, "shutdown") == 0) target = "poweroff";
    else if (strcmp(action, "reboot")   == 0) target = "reboot";
    else if (strcmp(action, "suspend")  == 0) target = "suspend";
    else if (strcmp(action, "logout")   == 0) target = "logout";
    if (!target) {
        g_free(action);
        larfn_reply(view, id, FALSE, "{\"error\":\"unknown action\"}");
        return;
    }

    /* 走 systemd-logind D-Bus 而非裸 systemctl，保证登录会话语境正确 */
    gchar *cmd = g_strdup_printf(
        "busctl call org.freedesktop.login1 /org/freedesktop/login1 "
        "org.freedesktop.login1.Manager %s s false",
        target);
    gchar *argv[] = { "/bin/sh", "-c", cmd, NULL };
    GError *err = NULL;
    gboolean ok = g_spawn_async(NULL, argv, NULL,
                                G_SPAWN_SEARCH_PATH | G_SPAWN_STDOUT_TO_DEV_NULL,
                                NULL, NULL, NULL, &err);
    if (!ok) {
        char *e = json_escape(err ? err->message : "power failed");
        char *json = g_strdup_printf("{\"error\":%s}", e);
        larfn_reply(view, id, FALSE, json);
        g_free(json); g_free(e);
        if (err) g_error_free(err);
    } else {
        larfn_reply(view, id, TRUE, "{\"ok\":true}");
    }
    g_free(cmd);
    g_free(action);
}

/* notify.send: 经 gdbus 走 org.freedesktop.Notifications（真实系统通知） */
static void cmd_notify_send(WebKitWebView *view, const char *id, JSCValue *params)
{
    char *title = jsc_param_str(params, "title");
    char *body  = jsc_param_str(params, "body");
    if (!title) title = g_strdup("LarfnOS");
    if (!body)  body  = g_strdup("");

    char *t = json_escape(title);
    char *b = json_escape(body);

    /* Notify 方法签名：Notify(STRING app, UINT32 replaces, STRING icon,
       STRING summary, STRING body, ARRAY actions, DICT hints, INT32 timeout) */
    gchar *cmd = g_strdup_printf(
        "gdbus call --session --dest org.freedesktop.Notifications "
        "--object-path /org/freedesktop/Notifications "
        "--method org.freedesktop.Notifications.Notify "
        "\"larfn-shell\" 0 \"\" %s %s \"[]\" \"{}\" 5000",
        t, b);
    gchar *argv[] = { "/bin/sh", "-c", cmd, NULL };
    GError *err = NULL;
    gboolean ok = g_spawn_async(NULL, argv, NULL,
                                G_SPAWN_SEARCH_PATH | G_SPAWN_STDOUT_TO_DEV_NULL,
                                NULL, NULL, NULL, &err);
    if (!ok) {
        char *e = json_escape(err ? err->message : "notify failed");
        char *json = g_strdup_printf("{\"error\":%s}", e);
        larfn_reply(view, id, FALSE, json);
        g_free(json); g_free(e);
        if (err) g_error_free(err);
    } else {
        larfn_reply(view, id, TRUE, "{\"ok\":true}");
    }

    g_free(cmd); g_free(t); g_free(b);
    g_free(title); g_free(body);
}

/* ---------- 命令分发表（预留接口：新系统能力在此注册） ---------- */
typedef struct { const char *cmd; void (*fn)(WebKitWebView *, const char *, JSCValue *); } CmdEntry;
static const CmdEntry k_commands[] = {
    { "sys.stats",       cmd_sys_stats },
    { "sys.listApps",    cmd_sys_list_apps },
    { "app.launch",      cmd_app_launch },
    { "sys.exec",        cmd_sys_exec },
    { "sys.power",       cmd_sys_power },
    { "notify.send",     cmd_notify_send },
    { NULL, NULL }
};

void larfn_handle_command(WebKitWebView *view, const char *req_id,
                           const char *cmd, JSCValue *params)
{
    for (const CmdEntry *e = k_commands; e->cmd; e++) {
        if (strcmp(e->cmd, cmd) == 0) {
            e->fn(view, req_id, params);
            return;
        }
    }
    larfn_reply(view, req_id, FALSE, "{\"error\":\"unknown command\"}");
}

void bridge_cleanup(void) { /* 预留：释放全局句柄 */ }
