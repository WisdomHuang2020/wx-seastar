'use strict';
/**
 * 文件上传（multer 2.x，纯 JS 无原生模块）。
 *
 * 安全要点：
 *   · 文件名一律重写为随机串 + 白名单扩展名 → 杜绝路径穿越与畸形文件名
 *   · 按 MIME + 扩展名双重校验，避免改扩展名绕过
 *   · 图片与文档分目录存放（/uploads/img 与 /uploads/doc），便于 nginx 分别设缓存策略
 *   · 原始文件名只存数据库（下载时通过 Content-Disposition 还原），不落磁盘
 */
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const cfg = require('../config');
const { safeFilename } = require('./util');

const IMG_DIR = path.join(cfg.uploadDir, 'img');
const DOC_DIR = path.join(cfg.uploadDir, 'doc');
for (const d of [IMG_DIR, DOC_DIR]) fs.mkdirSync(d, { recursive: true });

// 图片：常见 Web 用图 + 允许的矢量
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif']);
const IMG_MIME = /^image\//i;

// 文档：产品资料类为主（IES 的 MIME 在多数系统里是 application/octet-stream，故主要靠扩展名）
const DOC_EXT = new Set([
  'pdf', 'ies', 'ldt',           // 光度文件
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'dwg', 'dxf', 'step', 'stp', 'igs', 'iges',   // 图纸/模型（照明行业常见）
  'zip', 'rar', '7z',
  'txt', 'csv',
]);

function extOf(name) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

function makeStorage(dir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      // multer 默认按 latin1 解码文件名，中文会变乱码 → 转回 UTF-8
      try { file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch { /* ignore */ }
      cb(null, safeFilename(file.originalname));
    },
  });
}

/** 图片上传：单文件字段名 `file` */
const uploadImage = multer({
  storage: makeStorage(IMG_DIR),
  limits: { fileSize: cfg.maxImageMB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = extOf(file.originalname);
    if (!IMG_EXT.has(ext)) return cb(new Error(`不支持的图片格式 .${ext}（允许：${[...IMG_EXT].join(', ')}）`));
    if (!IMG_MIME.test(file.mimetype) && ext !== 'svg') {
      return cb(new Error('文件内容与图片格式不符，请确认后重传'));
    }
    cb(null, true);
  },
}).single('file');

/** 文档上传：单文件字段名 `file` */
const uploadDoc = multer({
  storage: makeStorage(DOC_DIR),
  limits: { fileSize: cfg.maxDocMB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = extOf(file.originalname);
    if (!DOC_EXT.has(ext)) return cb(new Error(`不支持的文件类型 .${ext}`));
    cb(null, true);
  },
}).single('file');

/**
 * 把 multer 中间件包成 Promise，便于在 async 路由里 try/catch 出可读的错误。
 * 返回上传后的文件信息（含绝对路径与相对 URL）。
 */
function runUpload(middleware) {
  return (req, res) => new Promise((resolve, reject) => {
    middleware(req, res, (err) => {
      if (err) {
        // 把 multer 的英文错误转成中文提示
        if (err.code === 'LIMIT_FILE_SIZE') {
          return reject(Object.assign(new Error('文件过大，超出允许的大小上限'), { status: 413 }));
        }
        return reject(Object.assign(err, { status: 400 }));
      }
      resolve(req.file || null);
    });
  });
}

/** 根据磁盘文件路径推断其在 /uploads 下的相对 URL */
function urlOf(absPath) {
  const rel = path.relative(cfg.uploadDir, absPath).split(path.sep).join('/');
  return `/uploads/${rel}`;
}

/** 删除上传的文件（同时兜住不存在的情况） */
function removeUpload(filename) {
  const p = path.isAbsolute(filename) ? filename : path.join(cfg.uploadDir, filename);
  try { fs.unlinkSync(p); return true; } catch { return false; }
}

module.exports = {
  uploadImage, uploadDoc, runUpload, urlOf, removeUpload,
  IMG_DIR, DOC_DIR, IMG_EXT, DOC_EXT, extOf,
};
