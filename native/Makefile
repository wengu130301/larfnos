# larfn-shell 原生 GUI 编译配置
# 目标机：Linux x86_64，依赖 webkit2gtk-4.1 / gtk3
# 本文件同时用于本地交叉验证（如 Debian/Ubuntu 容器内 build）与 ISO rootfs 内构建

CC      ?= gcc
PKGS     = webkit2gtk-4.1 gtk+-3.0
CFLAGS  += -std=gnu11 -O2 -Wall -Wextra -pthread $(shell pkg-config --cflags $(PKGS))
LIBS    += $(shell pkg-config --libs $(PKGS)) -ljavascriptcoregtk-4.1

TARGET   = larfn-shell
SRCS     = larfn-shell.c bridge.c
PREFIX  ?= /usr
WEBROOT  = $(PREFIX)/share/larfn/gui

all: $(TARGET)

$(TARGET): $(SRCS) bridge.h
	$(CC) $(CFLAGS) -o $@ $(SRCS) $(LIBS)

# 安装：二进制 + GUI 前端静态资源 + 应用清单 + systemd user unit
install:
	install -Dm755 $(TARGET) $(DESTDIR)$(PREFIX)/bin/$(TARGET)
	install -dm755 $(DESTDIR)$(WEBROOT)
	cp -r ../gui/* $(DESTDIR)$(WEBROOT)/
	install -Dm644 ../iso/usr_lib_systemd_user/larfn-shell.service \
		$(DESTDIR)$(PREFIX)/lib/systemd/user/larfn-shell.service
	install -Dm644 ../iso/usr_share_larfn_apps/terminal.json \
		$(DESTDIR)$(PREFIX)/share/larfn/apps/terminal.json

clean:
	rm -f $(TARGET)

.PHONY: all install clean
