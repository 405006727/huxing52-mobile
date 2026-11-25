// 生成手机版单文件 HTML：designer.html（内核，2.4MB）+ 移动适配层 + 图纸/图片导入模块
// 用法: node tools/build-mobile.mjs [输出目录]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, '..', '手机版');

function read(p) { return fs.readFileSync(p, 'utf8'); }

const core = read(path.join(ROOT, 'app', 'designer.html'));
const adaptCss = read(path.join(ROOT, 'mobile', 'adapt.css'));
const adaptJs = read(path.join(ROOT, 'mobile', 'adapt.js'));
const modules = [
  ['picker.js', path.join(ROOT, 'app', 'picker.js')],
  ['ask.js', path.join(ROOT, 'app', 'ask.js')],
  ['dxf.js', path.join(ROOT, 'app', 'dxf.js')],
  ['imgwall.js', path.join(ROOT, 'app', 'imgwall.js')],
].map(([n, p]) => ({ name: n, code: read(p) }));

// deliver.js（交付包）是纯计算模块，给个 module 壳就能在浏览器跑，挂到 window.DSDELIVER
const deliverSrc = read(path.join(ROOT, 'app', 'deliver.js'));

function safe(code) { return code.replace(/<\/script/gi, '<\\/script'); }

// 1. viewport / title
let html = core;
const viewportOld = '<meta name="viewport" content="width=device-width,initial-scale=1">';
const viewportNew = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no">';
if (!html.includes(viewportOld)) throw new Error('找不到 viewport meta，内核结构变了');
html = html.replace(viewportOld, viewportNew);
html = html.replace(/<title>[^<]*<\/title>/, '<title>52户型装修设计 · 手机版</title>');

// 2. 手机 / PWA 元信息
const metas = [
  '<meta name="theme-color" content="#2f6fed">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="52户型装修设计">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="format-detection" content="telephone=no">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="icon-192.png">',
].join('\n');
html = html.replace('</head>', metas + '\n</head>');

// 3. 适配层 CSS（放在所有原生样式之后，才压得住）
const styleBlock = '\n<style id="ds-mobile-adapt">\n' + adaptCss + '\n</style>\n';
html = html.replace('</head>', styleBlock + '</head>');

// 4. 适配层 + 导入模块（除内核 module 外的普通脚本，在 body 末尾按依赖顺序执行）
const scriptBlock = [
  '\n<script id="ds-mobile-modules">',
  '/* ---- 以下四个模块与桌面版同一份代码，浏览器双模导出（window.DSDXF / window.DSIMG） ---- */',
  ...modules.map(m => `/* ===== ${m.name} ===== */\n` + safe(m.code)),
  '</script>',
  `<script id="ds-mobile-deliver">
/* ===== deliver.js（与桌面版同一份：看板图 / 设备档案 / 配电箱表）===== */
(function () {
  var module = { exports: {} };
${safe(deliverSrc)}
  window.DSDELIVER = module.exports;
})();
</script>`,
  '<script id="ds-mobile-adapt">\n' + safe(adaptJs) + '\n</script>',
  `<script id="ds-mobile-pwa">\n(function(){
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:/.test(location.protocol)) return; // 本地文件打开时不注册
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('[sw]', e && e.message); });
  });
})();\n</script>`,
].join('\n');
html = html.replace('</body>', scriptBlock + '\n</body>');

// 5. 写盘
fs.mkdirSync(OUT_DIR, { recursive: true });
const single = path.join(OUT_DIR, '52户型装修设计-手机版.html');
fs.writeFileSync(single, html, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html, 'utf8');

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(JSON.stringify({
  out: single,
  bytes: fs.statSync(single).size,
  sizeText: kb(fs.statSync(single).size),
  coreBytes: core.length,
  adaptCssBytes: adaptCss.length,
  adaptJsBytes: adaptJs.length,
  modules: modules.map(m => m.name + ' ' + kb(m.code.length)),
}, null, 2));
