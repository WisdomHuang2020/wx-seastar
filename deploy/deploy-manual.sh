#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# SEA☆STAR 实益达 官网 —— 本地手动兜底部署（CI 不可用时使用）
#
# 与 .github/workflows/deploy-lighthouse.yml 走**同一套**命令
# （白名单 tar over ssh + 备份 + chown + 哨兵），避免两套实现漂移。
#
# 用法：
#   bash deploy/deploy-manual.sh          # 交互确认后部署
#   bash deploy/deploy-manual.sh -y       # 跳过确认（仅限已获明确授权）
#
# ⚠️ 该脚本会覆盖线上同名文件。默认必须人工确认。
# ─────────────────────────────────────────────────────────────
set -euo pipefail

CONFIRM=1
[ "${1:-}" = "-y" ] && CONFIRM=0

# ── 站点参数（与 deploy/sites.yml 保持一致）──────────────
HOST="43.142.148.37"
USER="root"
WEB_ROOT="/var/www/wx-seastar"
DOMAIN="www.wx-seastar.cn"
KEY="$HOME/.ssh/pfc_ci"
PORT=22
OWNER="www-data"

FILES="index.html odm.html oem.html lighting.html grow-light.html about.html contact.html docs.html 404.html styles.css js assets favicon.ico apple-touch-icon.png robots.txt sitemap.xml"

cd "$(dirname "$0")/.."

VERSION="$(cat VERSION 2>/dev/null || echo unknown)"
echo "站点      : $DOMAIN"
echo "目标      : $USER@$HOST:$WEB_ROOT"
echo "版本      : $VERSION"
echo ""

# ── 前置校验：清单每项都必须存在 ──────────────────────────
missing=0
for f in $FILES; do
  [ -e "$f" ] || { echo "❌ 发布清单中的 $f 不存在"; missing=1; }
done
[ "$missing" -eq 0 ] || { echo "清单校验失败，已中止"; exit 1; }
echo "✅ 发布清单校验通过"

# ── 前置校验：web_root 必须等于 nginx 的 root ─────────────
# 注意要剥掉行尾分号：配置行是 `root /var/www/wx-seastar;`，
# 直接取 $2 会得到带分号的字符串，导致误报不一致（已实测踩到）。
REMOTE_ROOT="$(ssh -i "$KEY" -p "$PORT" -o BatchMode=yes "$USER@$HOST" \
  "awk '/^[[:space:]]*root[[:space:]]/{gsub(/;/,\"\",\$2); print \$2; exit}' /etc/nginx/sites-available/wx-seastar")"
if [ "$REMOTE_ROOT" != "$WEB_ROOT" ]; then
  echo "❌ 闸门拦截：nginx 的 root 是 '$REMOTE_ROOT'，与本脚本的 WEB_ROOT '$WEB_ROOT' 不一致"
  echo "   拒绝部署 —— 否则会出现「文件传上去了但站点读的是另一个目录」的假成功。"
  exit 1
fi
echo "✅ nginx root 与目标目录一致：$REMOTE_ROOT"

# ── 人工确认 ─────────────────────────────────────────────
if [ "$CONFIRM" -eq 1 ]; then
  if [ -t 0 ]; then
    printf "\n即将覆盖线上同名文件，继续？[y/N] "
    read -r ans
    [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "已取消"; exit 0; }
  else
    echo "非交互环境未加 -y，拒绝执行（安全默认）"; exit 1
  fi
fi

# ── 部署 ─────────────────────────────────────────────────
# ⚠️ 不用 `tar czf - | ssh ...` 管道：远端 `tar xzf -` 从 stdin 读数据流，
#    一旦 EOF 传递异常会永久阻塞在 stdin，导致 chown 与写哨兵都不执行
#    （CI 上实测踩到两次）。改为本地打包 + scp，再单独 ssh 解包。
tar czf /tmp/wx-seastar-deploy.tgz $FILES
scp -i "$KEY" -P "$PORT" -o StrictHostKeyChecking=accept-new \
    /tmp/wx-seastar-deploy.tgz "$USER@$HOST:/tmp/wx-seastar-deploy.tgz"
rm -f /tmp/wx-seastar-deploy.tgz

ssh -n -i "$KEY" -p "$PORT" -o StrictHostKeyChecking=accept-new "$USER@$HOST" "
  set -euo pipefail
  WEB_ROOT='$WEB_ROOT'
  VERSION='$VERSION'
  BK=\"\$HOME/webroot-backup-\$(date +%F-%H%M%S).tar.gz\"
  tar czf \"\$BK\" -C \"\$WEB_ROOT\" .
  echo \"已备份: \$BK\"
  tar xzf /tmp/wx-seastar-deploy.tgz -C \"\$WEB_ROOT\"
  rm -f /tmp/wx-seastar-deploy.tgz
  chown -R $OWNER:$OWNER \"\$WEB_ROOT\"
  printf '%s\n' \"\$VERSION\" > \"\$WEB_ROOT/.deployed-version\"
  ls -t \"\$HOME\"/webroot-backup-*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f
  echo '--- 回环自检 ---'
  curl -sk --resolve $DOMAIN:443:127.0.0.1 -o /dev/null -w '  首页 http=%{http_code}\n' --max-time 10 https://$DOMAIN/
  curl -sk --resolve $DOMAIN:443:127.0.0.1 -o /dev/null -w '  不存在路径 http=%{http_code}（应为 404）\n' --max-time 10 https://$DOMAIN/__probe__
"
echo ""
echo "✅ 部署完成。线上核验："
curl -s -o /dev/null -w "  https://$DOMAIN/  http=%{http_code}\n" --max-time 20 "https://$DOMAIN/" || true
