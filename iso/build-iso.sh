#!/usr/bin/env bash
# ============================================================================
# build-iso.sh —— 将 larfn-shell + GUI 前端打成可启动的 x86_64 Linux ISO
#
# 推荐基座：Arch Linux x86_64 + archiso
# 原理：以 archiso 最小 profile 为基础，注入 larfn 包(GUI 前端 + 原生桥二进制)，
#       systemd 在登录图形会话后直接拉起 larfn-shell，替换传统桌面。
# 产物：out/larfnos-x86_64-YYYYMMDD.iso
#
# 前置（在用于构建的 Arch/Debian 机器上执行）：
#   sudo pacman -S archiso
# 说明：本脚本需要 rootfs 内装有 webkit2gtk、gtk3、systemd、wayland、
#       seatd/sway 或 gnome-session(仅取其图形会话初始化) 等运行时。
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ISO_DATE="$(date +%Y%m%d)"
WORK="$(mktemp -d /tmp/larfn-iso.XXXXXX)"
PROFILE="$WORK/releng"
OUT_DIR="$ROOT/out"

echo "[1/6] 准备 archiso profile ..."
cp -r /usr/share/archiso/configs/releng "$PROFILE"

# --- 注入 larfn 打包脚本（在 chroot 内安装 GUI 前端 + 二进制） ---
mkdir -p "$PROFILE/airootfs/root"
cat > "$PROFILE/airootfs/root/build-larfn.sh" <<'CHROOT'
#!/usr/bin/env bash
set -euo pipefail
cd /root
# 1) 原生桥：在目标 rootfs 内现场编译，确保 ABI 与发行版 WebKit 一致
cd /tmp/larfn-src/native
make clean && make
make install PREFIX=/usr DESTDIR=/
# 2) 应用清单与 desktop 文件
mkdir -p /usr/share/applications
cat > /usr/share/applications/org.larfn.shell.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=LarfnOS Shell
Comment=WebKitGTK native system GUI
Exec=/usr/bin/larfn-shell
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOF
CHROOT
chmod +x "$PROFILE/airootfs/root/build-larfn.sh"

# --- 将源码带进 chroot ---
mkdir -p "$PROFILE/airootfs/tmp/larfn-src"
cp -r "$ROOT/gui" "$PROFILE/airootfs/tmp/larfn-src/gui"
cp -r "$ROOT/native" "$PROFILE/airootfs/tmp/larfn-src/native"

# --- 定制开机自启：把 larfn-shell 作为用户会话默认 shell ---
# (archiso releng 默认用 SDDM+plasma；此处改为登录后启动 larfn-shell)
mkdir -p "$PROFILE/airootfs/etc/systemd/system"
cat > "$PROFILE/airootfs/etc/systemd/system/larfn-autostart.service" <<'EOF'
[Unit]
Description=Launch LarfnOS GUI
After=graphical.target
ConditionUser=!root

[Service]
Type=simple
ExecStart=/usr/bin/larfn-shell
Restart=on-failure
Environment=GDK_BACKEND=wayland,x11
EOF

echo "[2/6] 注册开机服务 ..."
cat >> "$PROFILE/airootfs/root/build-larfn.sh" <<'CHROOT2'
ln -sf /etc/systemd/system/larfn-autostart.service \
       /etc/systemd/system/graphical.target.wants/larfn-autostart.service
# 默认不启动 SDDM/plasma，避免两套桌面打架
systemctl disable sddm 2>/dev/null || true
systemctl enable getty@tty1 2>/dev/null || true
CHROOT2

echo "[3/6] 写入构建所需包列表 ..."
# 关键运行时包（可依据实际基座增删）
cat >> "$PROFILE/packages.x86_64" <<'PKGS'
webkit2gtk
gtk3
glib2
systemd
polkit
dbus
gdbus
wayland
mesa
xf86-video-vesa
noto-fonts-cjk
PKGS

echo "[4/6] 在 rootfs 中执行安装/编译 (chroot) ..."
cat > "$PROFILE/airootfs/etc/mkinitcpio.conf.d/90-larfn.conf" <<'EOF'
# 保持默认 hook，若自定义 initramfs 需加 modconf block filesystems keyboard fsck
EOF

# releng profile 的 build.sh 会调用自定义脚本，我们直接注入 customize 钩子：
mkdir -p "$PROFILE/airootfs/root/customize_airootfs.sh.dist" || true
# 把构建脚本挂到 customize 阶段执行
mkdir -p "$PROFILE/airootfs/etc/skel"
cat > "$PROFILE/airootfs/etc/skel/.profile" <<'EOF'
# 登录 tty 后如有图形会话则启动 shell（X11 兜底）
[ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ] && exec /usr/bin/larfn-shell
EOF

echo "[5/6] 调用 archiso 生成 ISO ..."
mkdir -p "$OUT_DIR"
# 注意：archiso 构建需 root；若不具备请在真实构建机上执行 sudo ./build-iso.sh
# 下面用 pacman 缓存与并行选项加速
( cd "$PROFILE" && sudo ./build.sh -o "$OUT_DIR" -l "larfnos-x86_64-$ISO_DATE" )

echo "[6/6] 清理与产物"
rm -rf "$WORK"
ls -lh "$OUT_DIR"/*.iso
echo "ISO 已生成：$OUT_DIR/larfnos-x86_64-$ISO_DATE.iso"
echo "验证：qemu-system-x86_64 -cdrom <iso> -m 2048 -enable-kvm"
