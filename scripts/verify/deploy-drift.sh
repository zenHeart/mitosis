#!/usr/bin/env bash
# deploy-drift.sh — 检查本地、origin/master、gh-pages 和线上 asset 的部署漂移
#
# 输出格式: DEPLOY_DRIFT: PASS/FAIL + 可读差异描述
# 用法: bash scripts/verify/deploy-drift.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2

note() { printf '  %s\n' "$1"; }
DRIFT=0

# 1. 本地 HEAD vs origin/master
LOCAL_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
ORIGIN_MASTER=$(git rev-parse origin/master 2>/dev/null || echo "unknown")

echo "== 本地 HEAD == $LOCAL_HEAD"
echo "== origin/master == $ORIGIN_MASTER"

if [ "$LOCAL_HEAD" != "$ORIGIN_MASTER" ]; then
  note "WARN: 本地 HEAD 与 origin/master 不一致（可能未推送）"
  DRIFT=1
else
  note "OK: 本地 HEAD == origin/master"
fi

# 2. gh-pages 分支包含的 master 提交
if git show-ref --verify --quiet refs/remotes/origin/gh-pages 2>/dev/null; then
  GH_PAGES=$(git rev-parse origin/gh-pages 2>/dev/null || echo "unknown")
  echo "== origin/gh-pages == $GH_PAGES"

  # gh-pages 的 deploy commit message 格式: deploy: <master_sha>
  DEPLOYED_SHA=$(git log -1 --format=%s origin/gh-pages 2>/dev/null | sed -E 's/^deploy: ([0-9a-f]{7,40}).*/\1/' || echo "unknown")
  if [ "$DEPLOYED_SHA" != "unknown" ] && [ -n "$DEPLOYED_SHA" ]; then
    # 验证提取的 SHA 是否在 master 历史中
    if git merge-base --is-ancestor "$DEPLOYED_SHA" origin/master 2>/dev/null; then
      note "OK: gh-pages 部署了 master 提交 $DEPLOYED_SHA"
    else
      note "WARN: gh-pages 部署提交 $DEPLOYED_SHA 不在 origin/master 历史中"
      DRIFT=1
    fi
  else
    # 备用方案：比较 gh-pages 和 master 的最新 commit 时间戳
    GH_PAGES_TS=$(git log -1 --format=%ct origin/gh-pages 2>/dev/null || echo "0")
    MASTER_TS=$(git log -1 --format=%ct origin/master 2>/dev/null || echo "0")
    if [ "$GH_PAGES_TS" -ge "$MASTER_TS" ]; then
      note "OK: gh-pages 最新提交时间不早于 master"
    else
      note "WARN: gh-pages 最新提交时间早于 master，存在部署漂移"
      DRIFT=1
    fi
  fi
else
  note "WARN: origin/gh-pages 不存在"
  DRIFT=1
fi

# 3. 线上 asset 检查（通过 Last-Modified 或 ETag 判断是否有更新）
ONLINE_HEADERS=$(curl -sI https://mitosis.zenheart.site/ 2>/dev/null || echo "")
if [ -n "$ONLINE_HEADERS" ]; then
  ONLINE_LAST_MOD=$(echo "$ONLINE_HEADERS" | grep -i "^last-modified:" | head -1 | sed 's/^last-modified: //' || echo "unknown")
  ONLINE_ETAG=$(echo "$ONLINE_HEADERS" | grep -i "^etag:" | head -1 | sed 's/^etag: //' || echo "unknown")
  echo "== 线上 Last-Modified == $ONLINE_LAST_MOD"
  echo "== 线上 ETag == $ONLINE_ETAG"

  if [ "$ONLINE_LAST_MOD" != "unknown" ]; then
    # 将 Last-Modified 转换为时间戳并对比
    ONLINE_TS=$(date -j -f "%a, %d %b %Y %H:%M:%S %Z" "$ONLINE_LAST_MOD" +%s 2>/dev/null || echo "0")
    LOCAL_TS=$(git log -1 --format=%ct HEAD 2>/dev/null || echo "0")
    if [ "$ONLINE_TS" -ge "$LOCAL_TS" ]; then
      note "OK: 线上 asset Last-Modified ($ONLINE_LAST_MOD) 不早于本地提交时间"
    else
      note "WARN: 线上 asset Last-Modified ($ONLINE_LAST_MOD) 早于本地提交时间，可能未部署最新代码"
      DRIFT=1
    fi
  fi
else
  note "WARN: 无法获取线上 asset 头信息（站点可能不可达）"
  DRIFT=1
fi

echo
if [ "$DRIFT" = "0" ]; then
  echo "DEPLOY_DRIFT: PASS"
  exit 0
else
  echo "DEPLOY_DRIFT: FAIL (存在部署漂移)"
  exit 1
fi
