# OPERATIONS.md — 日常维护手册

> 面向**不需要懂编程**的维护者。日常改内容只看第 1 节就够了；
> 第 2 节起是给技术人员的。

---

## 1. 日常维护（维护者视角）

### 1.1 登录后台

打开浏览器访问：

```
https://www.wx-seastar.cn/admin/
```

输入管理员账号与密码（首次登录会强制要求修改密码）。

**建议把这一页加入书签。** 手机上也能用。

> 🔴 **密码不要写进本文件，也不要写进仓库里的任何文件。**
> 本仓库托管在 **GitHub 公开仓库** 上 —— 写进去等于公开。
> 密码请存到密码管理器（或交接时的加密渠道）。
> 忘记密码时的重置办法见第 3 节。

### 1.2 能做什么

| 想做的事 | 在后台哪里做 |
|---|---|
| 上架新产品 | 产品管理 → 新建产品 |
| 改产品名称 / 参数 / 简介 | 产品管理 → 找到它 → 编辑 |
| 换产品主图 | 产品管理 → 编辑 → 图片区 → 点选某张图即设为主图 |
| 给产品加图片 | 产品管理 → 编辑 → 图片区 → 点虚线框上传（可拖拽） |
| 临时下架某个产品 | 产品管理 → 下架（数据保留，随时可重新上架） |
| 上传规格书 / 说明书 / IES | 资料文件 → 上传资料 |
| 把资料挂到某个产品下 | 上传时选「关联产品」，或在资料列表里编辑 |
| 看客户留言 | 客户留言（未读的有角标） |
| 导出台账给同事 | 客户留言 → 导出 CSV（可直接用 Excel 打开） |
| 回复客户 | 留言详情 → 写邮件回复（会自动带上对方邮箱） |

### 1.3 几条重要提醒

- **改完即生效**：保存后刷新前台页面就能看到，不需要等、不需要找人发布。
- **删除是"下架"不是"销毁"**：产品点"删除"实际是下架，前台不再显示，数据仍在后台，
  可以随时重新上架。图片与资料文件的删除才是真的删。
- **图片建议先压一下**：单张控制在 12MB 以内（系统限制），
  但为了网站打开快，建议控制在 500KB 左右、宽度 1600px 以内。
- **IES 文件**直接上传即可，系统会识别为「IES 光度文件」类型。
- **别忘了改初始密码**：系统会强制第一次登录时修改。

---

## 2. 系统构成（技术人员视角）

```
                     nginx（/etc/nginx/sites-available/wx-seastar）
  浏览器 ──HTTPS──▶  ├── /            静态站  → /var/www/wx-seastar
                     ├── /api/*       反代    → 127.0.0.1:3000
                     ├── /admin       后台    → 127.0.0.1:3000
                     └── /uploads/*   上传文件 → /var/www/wx-seastar/uploads

                     Node 服务（systemd: wx-seastar.service）
                       ├ 认证 / 产品 / 资料 / 图片 / 留言 / 公开接口
                       └ SQLite: /var/lib/wx-seastar/data.db
```

| 部位 | 路径 |
|---|---|
| 后端代码 | `/opt/wx-seastar/server` |
| 数据库 | `/var/lib/wx-seastar/data.db`（含 `-wal` / `-shm`） |
| 上传文件 | `/var/www/wx-seastar/uploads/{img,doc}` |
| 环境配置 | `/etc/wx-seastar.env` |
| 服务单元 | `/etc/systemd/system/wx-seastar.service` |
| 运行日志 | `journalctl -u wx-seastar` |

**依赖极少**：只有 `express` 与 `multer` 两个纯 JS 包，数据库用 Node 内置的
`node:sqlite`，密码哈希用内置 `crypto.scrypt` —— **没有任何需要编译的原生模块**，
所以 Node 升级不会导致服务起不来。

---

## 3. 常用运维命令

```bash
# 服务状态 / 重启 / 日志
systemctl status wx-seastar
systemctl restart wx-seastar
journalctl -u wx-seastar -n 100 --follow

# 数据库备份（服务运行中也可安全执行，SQLite 支持热备）
sqlite3 /var/lib/wx-seastar/data.db ".backup '/root/wx-seastar-db-$(date +%F).db'"
#   或直接打包（连同 WAL）：
tar czf /root/wx-seastar-db-$(date +%F).tar.gz -C /var/lib/wx-seastar .

# 查看数据量
node -e "const d=require('/opt/wx-seastar/server/src/lib/db');
  console.log('产品', d.scalar('SELECT COUNT(*) FROM products'),
              '| 资料', d.scalar('SELECT COUNT(*) FROM documents'),
              '| 留言', d.scalar('SELECT COUNT(*) FROM messages'));"

# 重置管理员密码（忘记密码时）
cd /opt/wx-seastar/server && node src/tools/create-admin.js admin --reset

# 新增一个管理员
cd /opt/wx-seastar/server && node src/tools/create-admin.js zhangsan "张三"

# 手工重装依赖（一般不需要）
cd /opt/wx-seastar/server && npm install --omit=dev
```

---

## 4. 发布流程

### 主路径：push 即自动上线（**推荐**）

```
git push origin main
```

**最多 2 分钟**后自动上线。原理是**服务器自己去拉代码**——
服务器上有个 systemd timer 每 2 分钟检查一次 GitHub 有没有新提交。

```bash
# 看自动部署的日志
journalctl -u wx-seastar-deploy -n 50 --no-pager

# 看下次什么时候检查
systemctl list-timers wx-seastar-deploy.timer

# 不想等 2 分钟，立刻跑一次
systemctl start wx-seastar-deploy.service
```

**为什么不用 GitHub Actions 直接推？**
实测 runner → 本服务器的 SSH/SCP 链路**不稳定**：会卡住、留下僵尸会话，
加 `BatchMode` 和超时参数都压不住。与其在那条路上反复打补丁，
不如让服务器自己拉 —— 出网正常，且完全不依赖 runner 的网络环境。
GitHub Actions 仍然保留着，能跑通就是"快通道"，跑不通也不影响上线。

### 上线范围

由 `deploy/auto-deploy.sh` 里的 `FILES` 白名单决定（与 CI 的清单一致）。
**新增页面/静态文件时，这里和 `.github/workflows/deploy-lighthouse.yml` 的 `FILES` 都要改。**

### 后端（server 目录）

后端代码**在上线范围内**，脚本会自动同步；
只有代码真有变化时才重启服务（避免无谓中断）。
`package.json` 变了会自动 `npm install`。

### 删除了已发布的文件

把路径补进 `deploy/obsolete.txt`，部署时会自动清理。

### 出问题要回滚

每次部署前会整站备份到 `/root/webroot-backup-<时间戳>.tar.gz`（保留最近 5 份）：

```bash
ls -lt /root/webroot-backup-*.tar.gz | head -3
tar xzf /root/webroot-backup-2026-09-30-125842.tar.gz -C /var/www/wx-seastar
chown -R www-data:www-data /var/www/wx-seastar
```

---

## 5. 故障排查

| 现象 | 先查什么 |
|---|---|
| 后台打不开 | `systemctl status wx-seastar`；`journalctl -u wx-seastar -n 50` |
| 前台产品不显示 | 浏览器控制台看 `/api/public/products` 是否报错；服务是否在跑 |
| 上传失败 | 文件是否超限（图片 12MB / 文档 80MB）；磁盘 `df -h` |
| 图片 404 | `/var/www/wx-seastar/uploads/img` 下是否有该文件；属主是否 www-data |
| 忘记密码 | 用上面第 3 节的 `--reset` 重置 |
| **push 后没上线** | `journalctl -u wx-seastar-deploy -n 50`；`systemctl list-timers`；确认 timer 在跑 |
| 改了内容前台没变 | 浏览器强刷（Ctrl+F5）；确认保存成功 |

**排查任何异常的第一步都是看日志**：
```bash
journalctl -u wx-seastar -n 100 --no-pager          # 站点服务
journalctl -u wx-seastar-deploy -n 100 --no-pager   # 自动部署
```

---

## 6. 备份策略（建议）

| 备份对象 | 频率 | 方式 |
|---|---|---|
| 数据库 | 每天 | `sqlite3 /var/lib/wx-seastar/data.db ".backup '/root/wx-seastar-db-$(date +%F).db'"` |
| 上传文件 | 每周 | `tar czf /root/uploads-$(date +%F).tar.gz -C /var/www/wx-seastar uploads` |
| 站点文件 | 每次部署自动 | `/root/webroot-backup-*.tar.gz`（保留 5 份） |
| 代码 | 每次发布 | 已在 GitHub |

> **数据库与上传文件尚未配置自动备份**（站点文件的备份是自动的）。
> 这两样正是"丢了就没了"的数据，建议加一条 cron。
> 数据量很小（数据库通常 < 1MB），备份成本几乎为零。

---

## 7. 扩展指引（日后要加功能时）

- **加中英双语前台**：数据库字段已预留（`title_zh`/`title_en` 等），
  前台 `js/site.js` 里的 `setLang('en')` 即可切换；只需要再做一套英文页面。
- **换数据库**：只改 `server/src/lib/db.js` 一个文件（全项目唯一接触 SQL 的地方）。
- **上传到对象存储**：`server/src/lib/upload.js` 是唯一的上传落盘处，可改为写入腾讯云 COS。
- **加留言通知**：在 `public.routes.js` 的留言插入处挂钩子（`config.js` 已预留 `NOTIFY_TO`）。
- **调整自动部署频率**：改 `/etc/systemd/system/wx-seastar-deploy.timer` 里的
  `OnUnitActiveSec=2min`，然后 `systemctl daemon-reload && systemctl restart wx-seastar-deploy.timer`。

---

## 8. 版本与发布记录

**三个地方必须一致，缺一个都不算发完：**

| 位置 | 作用 |
|---|---|
| 根目录 `VERSION` | **版本号的唯一来源**（部署脚本读它，写线上的 `.deployed-version` 哨兵） |
| `CHANGELOG.md` | 每个版本改了什么 —— 也是 GitHub Release 正文的来源 |
| GitHub 的 Tags / Releases | 对外可查的发布记录（<https://github.com/WisdomHuang2020/wx-seastar/releases>） |

**发版收尾跑一条命令，退出码非 0 就是没发完：**

```bash
python3 deploy/release-audit.py
```

它会四方比对 `CHANGELOG` ↔ `VERSION` ↔ 远端 tag ↔ GitHub Release，
把缺口直接列出来（例如"CHANGELOG 里的 v0.9.0 没有远端 tag"）。

> ⚠️ **为什么必须有这一步**：`git push` 之后站点会自动上线，
> 整个过程**不会**因为你漏打 tag 或漏建 Release 而报任何错 —— 那是静默发生的。
> 另外注意：**推送 tag 不会自动创建 Release**，两件事要分别做。

**日常发版的顺序**（改内容 → 上线不需要走这套；只有改了代码/功能才需要）：

```bash
① 改代码，同时把 VERSION 和 CHANGELOG.md 顶部条目改成同一个新版本号
② git commit && git push origin main          # 最多 2 分钟自动上线
③ git tag -a vX.Y.Z <该提交> -m 'vX.Y.Z · 一句话' -m '正文'
   git push origin vX.Y.Z
④ 在 GitHub 网页上 New release 选刚推的 tag（或用 API 建）
⑤ python3 deploy/release-audit.py             # 必须退 0
```
