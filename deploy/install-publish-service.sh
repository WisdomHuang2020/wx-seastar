#!/usr/bin/env bash
# install-publish-service.sh —— 安装 Creator 发布服务（在服务器上以 root 运行）
#
# 做三件事：
#   ① 生成发布专用 SSH 密钥（**有写权限**），与既有的**只读**拉取密钥刻意分开
#   ② 装 systemd 服务与定时器
#   ③ 打印公钥，让你加到 GitHub 的 Deploy keys（这一步**必须人工做**）
#
# 用法：bash install-publish-service.sh
#       bash install-publish-service.sh --uninstall
set -euo pipefail

SERVER_DIR=/opt/wx-seastar/server
KEY=/root/.ssh/creator_publish
ALIAS=github-wxseastar-publish
UNITS=/etc/systemd/system

if [ "${1:-}" = "--uninstall" ]; then
  systemctl disable --now wx-seastar-publish.timer 2>/dev/null || true
  rm -f "$UNITS/wx-seastar-publish.service" "$UNITS/wx-seastar-publish.timer"
  systemctl daemon-reload
  echo "  已卸载发布服务（密钥保留在 $KEY，如需删除请手工处理）"
  exit 0
fi

echo "① 发布专用密钥"
if [ -f "$KEY" ]; then
  echo "   已存在，跳过生成"
else
  ssh-keygen -t ed25519 -N "" -f "$KEY" -C "wx-seastar-creator-publish@$(hostname)" >/dev/null
  chmod 600 "$KEY"
  echo "   已生成 $KEY"
fi

if ! grep -q "^Host $ALIAS" /root/.ssh/config 2>/dev/null; then
  cat >> /root/.ssh/config <<EOS

# Creator 发布专用（**有写权限**）。与只读的拉取密钥刻意分开：
# 拉取路径保持最小权限，即使拉取侧被攻破也拿不到仓库写权限。
Host $ALIAS
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOS
  echo "   已追加 SSH 别名 $ALIAS"
else
  echo "   SSH 别名已存在"
fi

echo "② systemd 单元"
install -m 0644 /opt/wx-seastar/repo/deploy/wx-seastar-publish.service "$UNITS/"
install -m 0644 /opt/wx-seastar/repo/deploy/wx-seastar-publish.timer "$UNITS/"
systemctl daemon-reload
systemctl enable --now wx-seastar-publish.timer
echo "   timer: $(systemctl is-active wx-seastar-publish.timer)"

echo
echo "③ ⚠️ 需要你手工做一步（否则推送会被拒）"
echo "   GitHub → 仓库 Settings → Deploy keys → Add deploy key"
echo "   标题建议：Creator publish (server, write)"
echo "   ⚠️ 必须勾选 “Allow write access” —— 不勾就是只读，推不上去"
echo "   公钥内容（复制下面这一整行）："
echo
echo "     $(cat "$KEY.pub")"
echo
echo "   验证：ssh -T git@$ALIAS    （应回 'Hi WisdomHuang2020/wx-seastar!'）"
echo "   验证写权限：bash /opt/wx-seastar/repo/deploy/check-publish-key.sh"
