/* ===================================================================
   52户型装修设计 · 手机端适配层（运行时）
   职责：首开空白图纸、抽屉遮罩、安全区外的浮层收口、
         补「从 CAD 图纸 / 户型图片新建」入口（桌面版由 main.js 提供，手机端在这里补上）、
         自动布水电、以及手机上的键盘/长按/手势细节。
   依赖：同文件内联的 DSDXF（app/dxf.js）、DSIMG（app/imgwall.js）、
         __dsPickLayers（app/picker.js）、__dsAsk（app/ask.js）、window.__designer
   =================================================================== */
(function () {
  'use strict';
  if (window.__dsMobile) return;

  var VERSION = '1.0.0';
  var BLANK = {
    version: 2, kind: 'building', name: '未命名户型', cur: 0, slab: 120, base: 0, grade: 0,
    floors: [{
      id: 'fl1', name: '一层',
      plan: {
        version: 2, name: '未命名户型 · 一层', height: 3000, phase: 'renovate',
        nodes: [], walls: [], openings: [], furniture: [], structs: [], beams: [],
        rooms: [], measures: [], elec: [], prices: {}, north: 0, voids: [], comments: [],
      },
    }],
  };

  function el(sel, root) { return (root || document).querySelector(sel); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ------------------------------ 提示条 ------------------------------ */
  var tipEl = null, tipTimer = null;
  function tips(text, ms) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'dsMobileTips';
      document.body.appendChild(tipEl);
    }
    tipEl.textContent = text;
    tipEl.classList.add('on');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { tipEl.classList.remove('on'); }, ms || 3600);
  }

  /* --------------------------- 确认 / 选择弹层 --------------------------- */
  function confirmBox(title, text, buttons, primaryIndex) {
    return new Promise(function (resolve) {
      var host = document.createElement('div');
      host.id = 'dsMConfirm';
      var row = buttons.map(function (b, i) {
        return '<button data-i="' + i + '" class="' + (i === (primaryIndex || 0) ? 'primary' : '') + '">' + b + '</button>';
      }).join('');
      host.innerHTML = '<div class="dsm-box"><h3>' + title + '</h3><p>' + text + '</p><div class="dsm-row">' + row + '</div></div>';
      document.body.appendChild(host);
      host.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        host.remove();
        resolve(Number(b.getAttribute('data-i')));
      });
    });
  }

  /* ------------------------------ 抽屉遮罩 ------------------------------ */
  function installMask() {
    if (el('#dsMobileMask')) return;
    var m = document.createElement('div');
    m.id = 'dsMobileMask';
    var main = el('main');
    (main || document.body).appendChild(m);
    m.addEventListener('pointerdown', function (e) {
      e.preventDefault(); e.stopPropagation();
      document.body.classList.remove('left-open', 'right-open');
    }, true);
  }

  /* ------------------------ 从图纸 / 图片新建 入口 ------------------------ */
  function closeMenus() {
    ['#moreMenu', '#exportMenu'].forEach(function (s) {
      var d = el(s + ' .dropdown');
      if (d) d.classList.remove('open');
    });
  }

  function fileButton(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      closeMenus();
      onClick();
    });
    return b;
  }

  function chooseFile(kind) {
    var old = el('#dsMFile');
    if (old) old.parentNode.removeChild(old);
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'dsMFile';
    inp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    inp.accept = kind === 'dxf' ? '.dxf,text/plain' : 'image/*';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      if (kind === 'dxf') importDxfFile(f); else importImageFile(f);
    };
    document.body.appendChild(inp);
    inp.click();
  }

  function installMenuEntries() {
    var dd = el('#moreMenu .dropdown');
    if (!dd || dd.getAttribute('data-ds-mobile')) return;
    dd.setAttribute('data-ds-mobile', '1');
    var bPkg = fileButton('导出交付包（看板图 / 设备清单 / 配电箱表）…', function () { exportDelivery(); });
    var bImg = fileButton('从户型图片新建（自动识墙）…', function () { chooseFile('img'); });
    var bDxf = fileButton('从 CAD 图纸新建（DXF）…', function () { chooseFile('dxf'); });
    bPkg.setAttribute('data-ds-mobile-btn', 'deliver');
    bImg.setAttribute('data-ds-mobile-btn', 'img');
    bDxf.setAttribute('data-ds-mobile-btn', 'dxf');
    dd.insertBefore(bPkg, dd.firstChild);
    dd.insertBefore(bImg, dd.firstChild);
    dd.insertBefore(bDxf, dd.firstChild);
  }

  /* ------------------------------ DXF 解码 ------------------------------ */
  function decodeDxf(buf) {
    var utf = new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/, '');
    var bad = (utf.match(/\uFFFD/g) || []).length;
    if (bad > 6) {
      try {
        var gbk = new TextDecoder('gbk').decode(buf);
        if ((gbk.match(/\uFFFD/g) || []).length < bad) return gbk;
      } catch (e) {}
    }
    return utf;
  }

  /* ------------------------------ 生成方案 ------------------------------ */
  function applySpec(spec, label) {
    if (!window.__designer || !window.__designer.replacePlan) { tips('设计器还没准备好，稍等再试'); return false; }
    if (!window.__dsSpecToBuilding) { tips('这个版本的设计器缺少 spec 入口'); return false; }
    var b = window.__dsSpecToBuilding(spec);
    window.__designer.replacePlan(b);
    try { window.__designer.fit2D && window.__designer.fit2D(); } catch (e) {}
    var walls = spec.floors.reduce(function (n, f) { return n + (f.walls || []).length; }, 0);
    tips('已生成方案：' + walls + ' 面墙 · ' + spec.floors.length + ' 层 · 正在自动布水电…', 5200);
    if (label) { try { localStorage.setItem('ds-mobile-last-plan', label); } catch (e) {} }
    setTimeout(function () { autoPlaceMep(); }, 900);
    return true;
  }

  /* --------------------------- 自动布水电（手机版） --------------------------- */
  // 手机上没有桌面菜单，直接走左栏「一键布置水电」按钮，流程与桌面版一致
  async function autoPlaceMep() {
    if (!window.__designer) return { ok: false };
    try {
      document.body.classList.add('left-open');
      await sleep(500);
      var tabs = document.querySelectorAll('#leftPanel [data-tab]');
      for (var i = 0; i < tabs.length; i++) {
        if ((tabs[i].textContent || '').indexOf('水电') >= 0) { tabs[i].click(); break; }
      }
      await sleep(700);
      var btn = el('#autoElec');
      if (!btn) {
        var hit = null;
        document.querySelectorAll('#leftPanel button[data-tool], #leftPanel .tbtn').forEach(function (b) {
          if (/一键布置水电/.test(b.textContent || '')) hit = b;
        });
        btn = hit;
      }
      if (btn) btn.click();
      await sleep(900);
      // 已有电点位时会弹「会替换现有的 N 个点位」，只点里面的“重新布置”
      var boxes = Array.prototype.slice.call(document.querySelectorAll('.modal-box, .modal, .dialog, .confirm'));
      var host = boxes.filter(function (b) { return /一键布置水电|替换现有/.test(b.textContent || ''); })[0];
      if (host) {
        var rb = Array.prototype.slice.call(host.querySelectorAll('button')).filter(function (b) {
          return /重新布置/.test((b.textContent || '').trim());
        })[0];
        if (rb) rb.click();
      }
      await sleep(1300);
      document.body.classList.remove('left-open');
      try { window.__designer.setTool && window.__designer.setTool('select'); } catch (e) {}
      var n = window.__designer.app && window.__designer.app.plan ? window.__designer.app.plan.elec.length : -1;
      if (n > 0) tips('水电已自动布置：' + n + ' 个点位 · 可在左栏「水电」里逐个核', 4200);
      return { ok: true, elec: n };
    } catch (e) {
      document.body.classList.remove('left-open');
      return { ok: false, error: String(e && e.message) };
    }
  }

  /* ------------------------------- DXF 导入 ------------------------------- */
  async function importDxfFile(file) {
    try {
      tips('正在读图纸：' + file.name, 2000);
      var buf = await file.arrayBuffer();
      await importDxfText(decodeDxf(buf), file.name.replace(/\.dxf$/i, ''));
    } catch (e) {
      tips('读图纸失败：' + (e && e.message));
    }
  }

  async function importDxfText(text, label) {
    if (!window.DSDXF) { tips('DXF 解析没加载'); return { ok: false }; }
    var a = DSDXF.analyzeLayers(text);
    if (!a.layers.length) { tips('这张 DXF 里没有直线 / 多段线，先在 CAD 里 EXPLODE 打散再导出'); return { ok: false, error: 'no-entities' }; }
    var auto = a.layers.filter(function (o) { return o.suggested; }).map(function (o) { return o.layer; });
    var picked = auto.length ? auto : await (window.__dsPickLayers
      ? window.__dsPickLayers({ file: label, layers: a.layers.slice(0, 120) })
      : Promise.resolve(a.layers.slice(0, 3).map(function (o) { return o.layer; })));
    if (!picked || !picked.length) { tips('已取消'); return { ok: false, error: 'cancel' }; }

    var res = DSDXF.parse(text, { layers: picked });
    if (!res.ok) { tips('识别失败：' + (res.error || '换一组图层再试')); return { ok: false, error: res.error }; }

    var split = null;
    try { split = DSDXF.splitFloors(res.walls, { gap: 2200, minWalls: 4 }); } catch (e) {}
    var spec;
    if (split && split.multi && split.count > 1) {
      var pick = await confirmBox('图里像是画了 ' + split.count + ' 个平面',
        split.floors.map(function (f, i) { return '第 ' + (i + 1) + ' 处：' + f.walls + ' 面墙'; }).join('\n') +
        '\n\n「整栋生成」= 每处当一层；「合成一层」= 全部并进当前层。',
        ['整栋生成（' + split.count + ' 层）', '合成一层'], 0);
      if (pick === 0) {
        var groups = split.groups.map(function (g) { return DSDXF.reorigin(g, 300); });
        spec = DSDXF.toSpecMulti(groups, null, { name: label + '（整栋）', city: '成都', height: 3000, slab: 120 });
      } else {
        spec = DSDXF.toSpec(res, label, { city: '成都', height: 3000, slab: 120 });
      }
    } else {
      spec = DSDXF.toSpec(res, label, { city: '成都', height: 3000, slab: 120 });
    }
    var ok = applySpec(spec, label);
    return { ok: ok, walls: res.walls.length, floors: spec.floors.length, layers: picked };
  }

  /* ------------------------------ 图片识墙 ------------------------------ */
  async function importImageFile(file) {
    try {
      tips('正在读图：' + file.name, 2000);
      var url = URL.createObjectURL(file);
      var out = await importImageURL(url, file.name.replace(/\.(png|jpg|jpeg|bmp|webp)$/i, ''));
      URL.revokeObjectURL(url);
      return out;
    } catch (e) {
      tips('读图失败：' + (e && e.message));
      return { ok: false, error: String(e && e.message) };
    }
  }

  async function importImageURL(url, label, realWidthMM) {
    if (!window.DSIMG) { tips('识墙模块没加载'); return { ok: false }; }
    var bmp;
    try { bmp = await createImageBitmap(await (await fetch(url)).blob()); }
    catch (e) { tips('这张图打不开，用 PNG / JPG 再试'); return { ok: false, error: 'decode' }; }

    var MAXSIDE = 2600;
    var k = Math.min(1, MAXSIDE / Math.max(bmp.width, bmp.height));
    var w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    var gray = DSIMG.toGrayFromRGBA(ctx.getImageData(0, 0, w, h).data, w, h);

    var det = DSIMG.detect(gray, w, h, {});
    if (!det.ok) { tips('没认出墙：' + (det.error || '换一张线条更清楚的户型图')); return { ok: false, error: det.error }; }

    var bb = det.bboxPx;
    var realW = realWidthMM || 0;
    if (!realW && window.__dsAsk) {
      realW = await window.__dsAsk({
        title: '确认比例尺',
        hint: '识别到 ' + det.walls.length + ' 面墙（墙厚约 ' + det.thicknessPx + ' 像素）。填这套房最外沿的总宽（毫米），或直接选常见尺寸。',
        label: '实际总宽',
        def: Math.round(bb.w * 11.9 / 100) * 100,
        suffix: 'mm',
        presets: [8000, 10000, 12000, 14000, 16000],
      });
    }
    if (!realW) realW = Math.round(bb.w * 11.9);

    var mmPerPx = realW / bb.w;
    var wallsMM = DSIMG.toMillisWalls(det.walls, mmPerPx, { maxThick: 400, minThick: 80 });
    var spec = DSDXF.toSpec({ walls: wallsMM }, label, { city: '成都', height: 3000, slab: 120 });
    var ok = applySpec(spec, label);
    return { ok: ok, pxWalls: det.walls.length, mmPerPx: Number(mmPerPx.toFixed(3)), walls: spec.floors[0].walls.length };
  }

  /* 进 3D 自动把镜头拉到「看得见整栋」的位置（手机上默认视角常卡在墙里）。
     3D 场景是懒加载的，早点点 #camReset 会对着还没建好的模型算相机框，
     所以在几个时间点各点一次（重复点等价，只会重新取景）。 */
  function installCamFit() {
    function fitWhenReady() {
      [1200, 2600, 4200, 6500].forEach(function (ms) {
        setTimeout(function () {
          var r = document.getElementById('camReset');
          if (r) r.click();
        }, ms);
      });
    }
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-view]') : null;
      if (!b) return;
      var v = b.getAttribute('data-view');
      if (v === '3d' || v === 'split') fitWhenReady();
    }, true);
    window.__dsMobileFit3D = fitWhenReady;
  }


  /* ---------------------------- 交付包（手机端） ----------------------------
     与电脑版同一份 app/deliver.js：看板图 SVG/PNG + 设备清单 + 配电箱回路表。
     手机上一次下载，所以打成 zip（store 模式，自己实现的极简 zip，不引第三方库）。 */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function makeZip(entries) {
    var enc = new TextEncoder();
    var now = new Date();
    var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (Math.floor(now.getSeconds() / 2))) & 0xFFFF;
    var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

    var parts = [];
    var central = [];
    var offset = 0;
    entries.forEach(function (e) {
      var name = enc.encode(e.name);
      var data = e.data;
      var crc = crc32(data);
      var head = new Uint8Array(30 + name.length);
      var dv = new DataView(head.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true);   // UTF-8 文件名
      dv.setUint16(8, 0, true);        // store
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      dv.setUint16(28, 0, true);
      head.set(name, 30);

      var cd = new Uint8Array(46 + name.length);
      var cdv = new DataView(cd.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, dosTime, true);
      cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, data.length, true);
      cdv.setUint32(24, data.length, true);
      cdv.setUint16(28, name.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      cd.set(name, 46);
      central.push(cd);

      parts.push(head, data);
      offset += head.length + data.length;
    });

    var cdSize = central.reduce(function (n, c) { return n + c.length; }, 0);
    var eocd = new Uint8Array(22);
    var edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, entries.length, true);
    edv.setUint16(10, entries.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);
    edv.setUint16(20, 0, true);

    var all = parts.concat(central, [eocd]);
    return new Blob(all, { type: 'application/zip' });
  }

  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function svgToPngBytes(svg) {
    return new Promise(function (resolve, reject) {
      var m = /width="(\d+)"[^>]*height="(\d+)"/.exec(svg);
      var w = Math.min(3200, Math.max(600, m ? Number(m[1]) : 1600));
      var h = Math.min(4000, Math.max(400, m ? Number(m[2]) : 1000));
      var img = new Image();
      img.onload = function () {
        try {
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          cv.toBlob(function (blob) {
            blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
          }, 'image/png');
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('svg 渲染失败')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function stampName() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  async function exportDelivery() {
    if (!window.DSDELIVER) { tips('这个版本的交付包模块没加载'); return { ok: false }; }
    if (!window.__designer || !window.__designer.bld) { tips('当前没有打开的方案'); return { ok: false }; }
    tips('正在生成交付包（看板图 3 张 + 清单 + 配电箱表）…', 6000);
    await sleep(60);
    var bld;
    try { bld = JSON.parse(JSON.stringify(window.__designer.bld)); } catch (e) { tips('方案读不出来'); return { ok: false }; }
    var pack = DSDELIVER.delivery(bld, { width: 1600 });
    if (!pack || !pack.ok) { tips('导不了：' + ((pack && pack.error) || '方案里没有墙')); return { ok: false }; }

    var enc = new TextEncoder();
    var entries = [];
    var pngCount = 0, pngFail = 0;
    for (var i = 0; i < pack.files.length; i++) {
      var f = pack.files[i];
      if (f.type === 'svg') {
        entries.push({ name: f.name, data: enc.encode(f.content) });
        if (f.png) {
          try {
            entries.push({ name: f.name.replace(/\.svg$/, '.png'), data: await svgToPngBytes(f.content) });
            pngCount++;
          } catch (e) {
            pngFail++;
            console.warn('[deliver png]', f.name, e && e.message);
          }
        }
      } else {
        entries.push({ name: f.name, data: enc.encode(f.content) });
      }
    }
    entries.push({
      name: '交付汇总.json',
      data: enc.encode(JSON.stringify({ at: new Date().toISOString(), plan: pack.model.name, stats: pack.stats, pngs: pngCount, files: entries.map(function (e) { return e.name; }) }, null, 2)),
    });

    var zip = makeZip(entries);
    var zipName = '交付包-' + stampName() + '.zip';
    download(zip, zipName);
    var s = pack.stats;
    tips('交付包已下载：' + zipName + '\n' + s.floors + ' 层 / ' + s.devices + ' 个点位 / ' + s.breakers + ' 路断路器 / 装接 ' + (s.totalW / 1000).toFixed(1) + ' kW（建议总闸 ' + s.mainBreaker + 'A）· PNG ' + pngCount + ' 张', 9000);
    return { ok: true, zip: zipName, files: entries.length, png: pngCount, pngFail: pngFail, bytes: zip.size, stats: s };
  }

  /* Android 安装版：WebView 里 blob: 链接点下载存不下来，改走原生保存（DSAndroid.saveBase64）。
     拦 HTMLAnchorElement.click 就能同时兜住内核自己的导出（ji()）和本层交付包下载。 */
  function installNativeSaver() {
    var A = window.DSAndroid;
    if (!A || typeof A.saveBase64 !== 'function') return;
    window.__dsNativeSave = true;
    var orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      var a = this;
      try {
        if (a.href && a.href.indexOf('blob:') === 0 && a.download) {
          fetch(a.href).then(function (r) { return r.blob(); }).then(function (b) {
            var fr = new FileReader();
            fr.onload = function () {
              var s = String(fr.result);
              var i = s.indexOf(',');
              A.saveBase64(a.download, i >= 0 ? s.slice(i + 1) : s, b.type || 'application/octet-stream');
            };
            fr.readAsDataURL(b);
          }).catch(function (e) { tips('保存失败：' + (e && e.message)); });
          return;
        }
      } catch (e) {}
      return orig.call(this);
    };
  }

  /* ------------------------------ 首开空白 ------------------------------ */
  function firstRunBlank() {
    var KEY = 'ds-mobile-started';
    if (localStorage.getItem(KEY)) return;
    localStorage.setItem(KEY, '1');
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (!window.__designer || !window.__designer.replacePlan) {
        if (tries > 120) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      // 等内核自己的初始化/存档恢复跑完，再清成空白
      setTimeout(function () {
        try {
          window.__designer.replacePlan(BLANK);
          window.__designer.fit2D && window.__designer.fit2D();
          tips('空白户型已就绪：点「画墙」直接上手，或 ⋯ →「从 CAD 图纸 / 户型图片新建」', 6000);
        } catch (e) { console.warn('[mobile] blank', e && e.message); }
      }, 1200);
    }, 150);
  }

  /* ------------------------------ 手势 / 输入 ------------------------------ */
  function installInputGuards() {
    document.addEventListener('contextmenu', function (e) {
      if (!/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) e.preventDefault();
    }, true);
    // 键盘弹出时让画布重算尺寸（不能 dispatch window resize，会和内核互相触发）
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () {
        try { window.__designer && window.__designer.requestDraw && window.__designer.requestDraw(); } catch (e) {}
      });
    }
    // 数字输入一律拉起数字键盘
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t && t.tagName === 'INPUT' && t.type === 'number' && !t.getAttribute('inputmode')) {
        t.setAttribute('inputmode', 'decimal');
      }
    });
  }

  /* -------------------------------- 启动 -------------------------------- */
  function boot() {
    installMask();
    installMenuEntries();
    installInputGuards();
    installCamFit();
    installNativeSaver();
    firstRunBlank();
    // 菜单每次重建后补入口（内核切换楼层/方案会重绘 header）
    setInterval(installMenuEntries, 3000);
    window.__dsMobile = {
      version: VERSION,
      tips: tips,
      blank: BLANK,
      autoMep: autoPlaceMep,
      importDxfText: importDxfText,
      importImageURL: importImageURL,
      applySpec: applySpec,
      exportDelivery: exportDelivery,
      openDxfPicker: function () { chooseFile('dxf'); },
      openImagePicker: function () { chooseFile('img'); },
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
