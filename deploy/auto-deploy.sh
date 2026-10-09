#!/usr/bin/env bash
# ============================================================================
#  SEA☆STAR 官网 · 服务器侧自动部署（拉取模式）
#
#  【为什么需要它】
#    GitHub Actions 的 runner → 本服务器的 SSH/SCP 链路实测**不稳定**：
#    会卡在 in_progress、留下僵尸会话，BatchMode 与超时参数都压不住。
#    与其在那条路上反复打补丁，不如让**服务器自己**去拉代码 ——
#    出网 443/22 都正常，且完全不依赖 runner 的网络环境。
#
#  【工作方式】
#    systemd timer 每 2 分钟触发；发现 origin/main 有新提交就同步并发布。
#    与 GitHub Actions 并存：CI 若能跑通是"快通道"，跑不通也不影响上线。
#
#  【安全边界】
#    · 只做 git reset --hard origin/main，**不执行**仓库里的任意脚本
#    · 发布范围由下方 FILES 白名单决定，与 CI 的清单保持一致
#    · 数据库（/var/lib/wx-seastar）与后台上传的文件（uploads/）**不在仓库里**，
#      永远不会被本脚本覆盖
# ============================================================================
set -euo pipefail

REPO_DIR="/opt/wx-seastar/repo"
WEB_ROOT="/var/www/wx-seastar"
SERVER_DIR="/opt/wx-seastar/server"
STATE_FILE="/var/lib/wx-seastar/.last-deployed-sha"

# 发布白名单 —— 与 .github/workflows/deploy-lighthouse.yml 的 FILES 保持一致
FILES=(
  index.html odm.html oem.html lighting.html grow-light.html about.html contact.html docs.html 404.html
  styles.css js assets cn favicon.ico apple-touch-icon.png robots.txt sitemap.xml
)

log() { echo "[$(date '+%F %T')] $*"; }

cd "$REPO_DIR"

# ── 1) 取最新，无变化就静默退出 ──
git fetch --quiet origin main
REMOTE_SHA="$(git rev-parse origin/main)"
LAST_SHA="$(cat "$STATE_FILE" 2>/dev/null || echo '')"
[ "$REMOTE_SHA" = "$LAST_SHA" ] && exit 0

log "发现新提交 ${LAST_SHA:0:7} → ${REMOTE_SHA:0:7}"
git reset --hard --quiet origin/main

# ── 2) 备份当前站点 ──
BK="/root/webroot-backup-$(date +%F-%H%M%S).tar.gz"
tar czf "$BK" -C "$WEB_ROOT" . 2>/dev/null || true
log "已备份 → $BK"

# ── 3) 发布静态文件（白名单）──
for f in "${FILES[@]}"; do
  if [ -e "$REPO_DIR/$f" ]; then
    cp -r "$REPO_DIR/$f" "$WEB_ROOT/"
  else
    log "⚠️ 白名单项不存在，跳过: $f"
  fi
done

# ── 4) 清理废弃文件 ──
if [ -f "$REPO_DIR/deploy/obsolete.txt" ]; then
  while IFS= read -r raw; do
    line="$(printf '%s' "$raw" | sed 's/#.*//' | xargs || true)"
    [ -z "$line" ] && continue
    if [ -e "$WEB_ROOT/$line" ]; then
      rm -f "$WEB_ROOT/$line"
      log "已清理废弃文件: $line"
    fi
  done < "$REPO_DIR/deploy/obsolete.txt"
fi

chown -R www-data:www-data "$WEB_ROOT"
printf '%s\n' "$(cat "$REPO_DIR/VERSION" 2>/dev/null || echo unknown)" > "$WEB_ROOT/.deployed-version"
log "哨兵 → $(cat "$WEB_ROOT/.deployed-version")"

# ── 5) 后端代码有变化则同步并重启 ──
NEED_SYNC=0
if [ ! -f "$SERVER_DIR/src/index.js" ]; then
  NEED_SYNC=1
elif ! diff -rq --exclude=node_modules --exclude='*.db*' \
        "$REPO_DIR/server/src" "$SERVER_DIR/src" >/dev/null 2>&1; then
  NEED_SYNC=1
fi

if [ "$NEED_SYNC" = "1" ]; then
  log "后端代码有变化，同步中…"
  mkdir -p "$SERVER_DIR"
  # 只同步代码，不动 node_modules
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude=node_modules --exclude='*.db*' \
          "$REPO_DIR/server/" "$SERVER_DIR/"
  else
    cp -r "$REPO_DIR/server/src" "$REPO_DIR/server/public" "$REPO_DIR/server/package.json" "$SERVER_DIR/"
  fi
  chown -R www-data:www-data "$SERVER_DIR"
  # 依赖有变化时补装（纯 JS，装得很快）
  if [ -f "$REPO_DIR/server/package.json" ] && \
     ! diff -q "$REPO_DIR/server/package.json" "$SERVER_DIR/package.json.bak" >/dev/null 2>&1; then
    (cd "$SERVER_DIR" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1) || true
    cp -f "$SERVER_DIR/package.json" "$SERVER_DIR/package.json.bak"
  fi
  systemctl restart wx-seastar && log "服务已重启"
fi

# ── 6) 回收旧备份（保留最近 5 份）──
ls -t /root/webroot-backup-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f

printf '%s\n' "$REMOTE_SHA" > "$STATE_FILE"
log "部署完成 ${REMOTE_SHA:0:7}"

# ── 7) 自检 ──
code=$(curl -sk --resolve www.wx-seastar.cn:443:127.0.0.1 -o /dev/null -w '%{http_code}' --max-time 10 https://www.wx-seastar.cn/ || echo 000)
log "自检 首页 http=$code"
[ "$code" = "200" ] && log "✅ 正常" || log "⚠️ 首页未返回 200，请检查"
