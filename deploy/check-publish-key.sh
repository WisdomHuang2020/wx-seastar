#!/usr/bin/env bash
# check-publish-key.sh —— 自检发布密钥的推送权限（在服务器上以 root 运行）
#
# 为什么需要它：GitHub 的 Deploy key **默认只读**，
# 加的时候忘了勾 "Allow write access" 就只能拉不能推，
# 而**只有真正 push 一次才会知道**。这个脚本用 --dry-run 提前验出来。
set -uo pipefail

ALIAS=github-wxseastar-publish
REPO=/opt/wx-seastar/repo
KEY=/root/.ssh/creator_publish

echo "① 密钥存在？"
if [ -f "$KEY" ]; then echo "   ✓ $KEY"; else echo "   ✗ 不存在，先跑 install-publish-service.sh"; exit 1; fi

echo "② SSH 认证"
out=$(ssh -o StrictHostKeyChecking=accept-new -T "git@$ALIAS" 2>&1 || true)
if echo "$out" | grep -q "successfully authenticated"; then
  echo "   ✓ $(echo "$out" | head -1)"
else
  echo "   ✗ 认证失败：$out"
  echo "     → 公钥还没加到 GitHub，或加错了仓库"
  exit 1
fi

echo "③ 推送权限（--dry-run，不会真的建分支）"
out=$(git -C "$REPO" push --dry-run "git@$ALIAS:WisdomHuang2020/wx-seastar.git" \
        "HEAD:refs/heads/__creator_perm_check" 2>&1 || true)
if echo "$out" | grep -qi "read only"; then
  echo "   ✗ 这把密钥是**只读**的 —— 推不上去"
  echo "     处理：GitHub → Settings → Deploy keys → 找到本密钥 →"
  echo "           删除后重新添加并**勾选 Allow write access**（编辑 Deploy key 不能改权限，必须重建）"
  exit 1
fi
if echo "$out" | grep -qiE "permission|denied|403"; then
  echo "   ✗ 权限不足：$out"
  exit 1
fi
echo "   ✓ 具备写权限"
echo
echo "全部就绪。现在可以在 /Creator/ 点「发布更改」了。"
