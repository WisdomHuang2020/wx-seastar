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

### 静态站（页面/样式）

```
git push origin main
```
→ GitHub Actions 自动同步到 `/var/www/wx-seastar`（含部署前整站备份）

### 后端（server 目录）

后端代码不在静态发布白名单里，需单独同步：

```bash
cd "D:/AI Using/wx-seastar"
tar czf - --exclude='node_modules' server \
  | ssh -i ~/.ssh/pfc_ci root@43.142.148.37 "
      tar xzf - -C /opt/wx-seastar
      chown -R www-data:www-data /opt/wx-seastar
      chmod -R o-w /opt/wx-seastar/server
      systemctl restart wx-seastar"
```
（`server/package.json` 的依赖有变化时，需在服务器上额外执行一次 `npm install --omit=dev`）

### 删除了已发布的文件

CI 是**增量覆盖**，不会删服务器上的旧文件。删除时要把路径补进
`deploy/obsolete.txt`，部署时会自动清理。

---

## 5. 故障排查

| 现象 | 先查什么 |
|---|---|
| 后台打不开 | `systemctl status wx-seastar`；`journalctl -u wx-seastar -n 50` |
| 前台产品不显示 | 打开浏览器控制台看 `/api/public/products` 是否报错；检查服务是否在跑 |
| 上传失败 | 文件是否超限（图片 12MB / 文档 80MB）；`/etc/wx-seastar.env` 里的上限；磁盘 `df -h` |
| 图片 404 | `/var/www/wx-seastar/uploads/img` 下是否有该文件；属主是否 www-data |
| 忘记密码 | 用上面第 3 节的 `--reset` 重置 |
| 改了内容前台没变 | 浏览器强刷（Ctrl+F5）；确认保存成功；看接口返回值 |

**所有异常的第一步都是看日志**：`journalctl -u wx-seastar -n 100 --no-pager`

---

## 6. 备份策略（建议）

| 备份对象 | 频率 | 方式 |
|---|---|---|
| 数据库 | 每天 | `sqlite3 .backup` 到 `/root/`，保留 30 天 |
| 上传文件 | 每周 | `tar czf` 到 `/root/` 或下载到本地 |
| 代码 | 每次发布 | 已在 GitHub |

> 目前**尚未配置自动备份**。数据量很小（数据库通常 < 1MB），
> 建议加一条 cron；需要的话可以补上。

---

## 7. 扩展指引（日后要加功能时）

- **加中英双语前台**：数据库字段已预留（`title_zh`/`title_en` 等），
  前台 `js/site.js` 里的 `setLang('en')` 即可切换；只需要再做一套英文页面。
- **换数据库**：只改 `server/src/lib/db.js` 一个文件（全项目唯一接触 SQL 的地方）。
- **上传到对象存储**：`server/src/lib/upload.js` 是唯一的上传落盘处，
  可改为写入腾讯云 COS。
- **加通知**：客户留言后发邮件提醒 —— 在 `public.routes.js` 的留言插入处挂钩子即可
  （`config.js` 已预留 `NOTIFY_TO` 配置位）。
