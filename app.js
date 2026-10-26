/* Watermark — every setting is relative to the photo size, so the preview matches the full-size export. All local. */
(function () {
  "use strict";
  const $ = S3.$, $$ = S3.$$;
  const MAX_SIDE = 16384, MAX_AREA = 40e6, PREVIEW = 1100;
  const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const FONT = "Inter, system-ui, sans-serif";
  const POS = ["Top left", "Top", "Top right", "Left", "Center", "Right", "Bottom left", "Bottom", "Bottom right"];
  const saved = S3.store("watermark") || {};
  const o = Object.assign({ kind: "text", text: "© Your Name", color: "#ffffff", weight: "700", shadow: true, pos: 8, tiled: false, opacity: 60, size: 28, rotation: 0, margin: 4, format: "keep", quality: 92 }, saved);
  let logo = null, items = [], sel = null, nextId = 1;

  // ---------- drawing (pure: ctx, size, options, logo) ----------
  function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function mark(x, W, H, opt, lg) {
    // Element size: its width is `size`% of the photo width.
    const tw = opt.size / 100 * W;
    let ew, eh, px = 0;
    if (opt.kind === "logo") {
      if (!lg) return;
      const lw = lg.naturalWidth || lg.width || 100, lh = lg.naturalHeight || lg.height || 100;
      ew = tw; eh = tw * lh / lw;
      if (eh > H * 0.9) { eh = H * 0.9; ew = eh * lw / lh; }
    } else {
      if (!opt.text.trim()) return;
      x.font = opt.weight + " 100px " + FONT;
      px = 100 * tw / Math.max(1, x.measureText(opt.text).width);
      px = Math.min(px, H * 0.6);
      x.font = opt.weight + " " + px + "px " + FONT;
      ew = x.measureText(opt.text).width; eh = px * 1.2;
    }
    const a = opt.rotation * Math.PI / 180, cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
    const one = () => {
      if (opt.kind === "logo") x.drawImage(lg, -ew / 2, -eh / 2, ew, eh);
      else {
        x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = opt.color;
        if (opt.shadow) { x.shadowColor = "rgba(0,0,0,.45)"; x.shadowBlur = px * 0.12; x.shadowOffsetY = px * 0.04; }
        x.fillText(opt.text, 0, 0);
        x.shadowColor = "transparent";
      }
    };
    x.save(); x.globalAlpha = opt.opacity / 100;
    if (opt.tiled) {
      // Brick pattern rotated about the centre, big enough to cover the corners.
      const gap = 0.35 + opt.margin / 10, sx = ew * (1 + gap), sy = eh * (1 + gap * 2.2), R = Math.hypot(W, H) / 2 + Math.max(sx, sy);
      x.translate(W / 2, H / 2); x.rotate(a);
      for (let j = -Math.ceil(R / sy), row = 0; j <= Math.ceil(R / sy); j++, row++) {
        for (let i = -Math.ceil(R / sx) - 1; i <= Math.ceil(R / sx) + 1; i++) {
          x.save(); x.translate(i * sx + (Math.abs(j) % 2 ? sx / 2 : 0), j * sy); one(); x.restore();
        }
      }
    } else {
      const bw = ew * cos + eh * sin, bh = ew * sin + eh * cos, m = opt.margin / 100 * Math.min(W, H);
      const col = opt.pos % 3, rw = Math.floor(opt.pos / 3);
      const cx = col === 0 ? m + bw / 2 : col === 1 ? W / 2 : W - m - bw / 2;
      const cy = rw === 0 ? m + bh / 2 : rw === 1 ? H / 2 : H - m - bh / 2;
      x.translate(cx, cy); x.rotate(a); one();
    }
    x.restore();
  }
  function fit(w, h, max) {
    let s = Math.min(1, (max || MAX_SIDE) / Math.max(w, h));
    if (w * h * s * s > MAX_AREA) s = Math.sqrt(MAX_AREA / (w * h));
    return { w: Math.max(1, Math.floor(w * s + 1e-6)), h: Math.max(1, Math.floor(h * s + 1e-6)) };
  }
  function compose(img, max, opt, lg, bg) {
    const s = fit(img.naturalWidth, img.naturalHeight, max), c = canvas(s.w, s.h), x = c.getContext("2d");
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, s.w, s.h); }
    x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, s.w, s.h);
    mark(x, s.w, s.h, opt, lg);
    return c;
  }
  async function exportItem(it, opt, lg) {
    const type = opt.format === "keep" ? (EXT[it.file.type] ? it.file.type : "image/png") : MIME[opt.format];
    const c = compose(it.img, 0, opt, lg, type === "image/jpeg" ? "#ffffff" : null);
    const blob = await new Promise(r => c.toBlob(r, type, opt.quality / 100));
    if (!blob) throw new Error("Could not encode " + it.file.name);
    return { blob, name: it.file.name.replace(/\.[^.]+$/, "") + "-watermarked." + EXT[type] };
  }
  function loadImage(blob) {
    const url = URL.createObjectURL(blob), img = new Image();
    img.src = url;
    return img.decode().then(() => { if (!img.naturalWidth) throw 0; img._url = url; return img; })
      .catch(() => { URL.revokeObjectURL(url); throw new Error("Can't read " + (blob.name || "this image")); });
  }

  // ---------- UI ----------
  const cv = $("#cv");
  function preview() {
    S3.store("watermark", o);
    $("#textBox").hidden = o.kind !== "text"; $("#logoBox").hidden = o.kind !== "logo";
    $("#pos").classList.toggle("off", o.tiled);
    $("#mgl").textContent = o.tiled ? "Spacing" : "Margin";
    $("#opv").textContent = o.opacity + "%"; $("#szv").textContent = o.size + "%"; $("#rov").textContent = o.rotation + "°";
    $("#mgv").textContent = o.margin + "%"; $("#qv").textContent = o.quality + "%";
    $$("#pos button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === o.pos)));
    const has = items.length > 0;
    $("#empty").hidden = has; $("#stage").hidden = !has; $("#one").disabled = !has; $("#zip").disabled = !has;
    $("#count").textContent = has ? items.length + (items.length === 1 ? " photo" : " photos") : "";
    if (!sel) return;
    const c = compose(sel.img, PREVIEW, o, logo);
    cv.width = c.width; cv.height = c.height; cv.getContext("2d").drawImage(c, 0, 0);
  }
  const later = S3.debounce(preview, 30);
  function renderList() {
    const ul = $("#list"); ul.textContent = "";
    items.forEach(it => {
      const pick = S3.h("button", { "class": "wm-item", "aria-pressed": String(it === sel), "aria-label": "Preview " + it.file.name, title: it.file.name }, [S3.h("img", { src: it.img._url, alt: "" })]);
      pick.addEventListener("click", () => { sel = it; renderList(); preview(); });
      const x = S3.h("button", { "class": "wm-x", "aria-label": "Remove " + it.file.name, text: "×" });
      x.addEventListener("click", () => { items = items.filter(i => i !== it); URL.revokeObjectURL(it.img._url); if (sel === it) sel = items[0] || null; renderList(); preview(); });
      ul.appendChild(S3.h("li", { "class": "wm-li" }, [pick, x]));
    });
  }
  async function addFiles(files) {
    for (const f of files) {
      try { const it = { id: nextId++, file: f, img: await loadImage(f) }; items.push(it); if (!sel) sel = it; }
      catch (e) { S3.toast(e.message, "error"); }
    }
    renderList(); preview();
  }

  POS.forEach((label, i) => {
    const b = S3.h("button", { "aria-label": label, title: label, "aria-pressed": "false" });
    b.addEventListener("click", () => { o.pos = i; preview(); });
    $("#pos").appendChild(b);
  });
  function bind(id, key, conv) {
    const el = $("#" + id);
    if (el.type === "checkbox") el.checked = o[key]; else el.value = o[key];
    el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", () => {
      o[key] = el.type === "checkbox" ? el.checked : conv ? conv(el.value) : el.value; later();
    });
  }
  ["text", "color", "weight", "format"].forEach(k => bind(k, k));
  ["opacity", "size", "rotation", "margin", "quality"].forEach(k => bind(k, k, Number));
  ["shadow", "tiled"].forEach(k => bind(k, k));
  $$("#kind button").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.v === o.kind));
    b.addEventListener("click", () => { o.kind = b.dataset.v; $$("#kind button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); preview(); });
  });

  S3.drop($("#drop"), addFiles, { accept: "image/*", multiple: true });
  S3.drop($("#logoDrop"), async fs => {
    try { const im = await loadImage(fs[0]); if (logo) URL.revokeObjectURL(logo._url); logo = im; $("#logoLbl").textContent = fs[0].name; preview(); }
    catch (e) { S3.toast(e.message, "error"); }
  }, { accept: "image/*,.svg", multiple: false });
  document.addEventListener("paste", e => {
    const fs = Array.prototype.slice.call((e.clipboardData && e.clipboardData.files) || []).filter(f => /^image\//.test(f.type));
    if (fs.length) { e.preventDefault(); addFiles(fs); }
  });
  $("#one").addEventListener("click", async () => {
    if (!sel) return;
    try { const r = await exportItem(sel, o, logo); S3.download(r.blob, r.name); S3.done(); } catch (e) { S3.toast(e.message, "error"); }
  });
  $("#zip").addEventListener("click", async () => {
    const btn = $("#zip"), lbl = $("#zipLbl"); btn.disabled = true;
    try {
      const files = [], used = {};
      for (const it of items) {
        lbl.textContent = "Working " + (files.length + 1) + " / " + items.length + "…";
        const r = await exportItem(it, o, logo);
        let n = r.name, i = 2;
        while (used[n]) n = r.name.replace(/(\.[^.]+)$/, "-" + (i++) + "$1");
        used[n] = 1;
        files.push({ name: n, data: new Uint8Array(await r.blob.arrayBuffer()) });
      }
      S3.download(S3.zip(files), "watermarked.zip"); S3.done();
    } catch (e) { S3.toast(e.message, "error"); }
    lbl.textContent = "Download all (.zip)"; btn.disabled = false;
  });
  const fontReady = (document.fonts && document.fonts.load ? document.fonts.load("700 40px Inter") : Promise.resolve()).catch(() => {});
  fontReady.then(preview);
  preview();

  // ---------- sample photos (drawn locally) ----------
  function sample(w, h, hue) {
    const c = canvas(w, h), x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "hsl(" + hue + ",55%,32%)"); g.addColorStop(1, "hsl(" + (hue + 50) + ",70%,62%)");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      x.fillStyle = "hsla(" + (hue + i * 18) + ",80%,75%,.22)";
      x.beginPath(); x.arc(w * (0.15 + i * 0.13), h * (0.3 + (i % 3) * 0.2), h * (0.12 + (i % 4) * 0.05), 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, h * 0.78, w, h * 0.22);
    return c;
  }
  async function sampleFile(name, w, h, hue) { const b = await new Promise(r => sample(w, h, hue).toBlob(r, "image/jpeg", 0.9)); return new File([b], name, { type: "image/jpeg" }); }
  window.S3_DEMO = async function () {
    await fontReady;
    await addFiles([await sampleFile("studio-01.jpg", 1800, 1200, 200), await sampleFile("studio-02.jpg", 1200, 1500, 320), await sampleFile("studio-03.jpg", 1600, 1000, 30)]);
    Object.assign(o, { kind: "text", text: "© S3eidat Studio", tiled: true, rotation: -25, opacity: 35, size: 26, margin: 3 });
    ["text", "rotation", "opacity", "size", "margin"].forEach(k => { $("#" + k).value = o[k]; });
    $("#tiled").checked = true; preview();
  };

  window.S3_SELFTEST = async function () {
    await fontReady;
    const base = { kind: "text", text: "WWW", color: "#ffffff", weight: "900", shadow: false, pos: 8, tiled: false, opacity: 100, size: 30, rotation: 0, margin: 5 };
    const black = canvas(400, 300); { const x = black.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, 400, 300); }
    const img = await loadImage(await new Promise(r => black.toBlob(r, "image/png")));
    const quads = c => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, q = [0, 0, 0, 0];
      let max = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > max) max = d[i];
        if (d[i] > 60) { const p = i / 4, xx = p % c.width, yy = Math.floor(p / c.width); q[(yy >= c.height / 2 ? 2 : 0) + (xx >= c.width / 2 ? 1 : 0)]++; }
      }
      return { q, max };
    };
    const br = quads(compose(img, 0, base, null));                                     // bottom-right only
    const tl = quads(compose(img, 0, Object.assign({}, base, { pos: 0 }), null));      // top-left only
    const tile = quads(compose(img, 0, Object.assign({}, base, { tiled: true, size: 15, rotation: -30 }), null));
    const half = quads(compose(img, 0, Object.assign({}, base, { opacity: 50 }), null));
    const ok1 = br.q[3] > 50 && br.q[0] + br.q[1] + br.q[2] === 0 && tl.q[0] > 50 && tl.q[1] + tl.q[2] + tl.q[3] === 0 &&
      tile.q.every(n => n > 50) && half.max >= 120 && half.max <= 135;
    // Logo: a red square centred at 50% width.
    const lg = canvas(50, 50); { const x = lg.getContext("2d"); x.fillStyle = "#ff0000"; x.fillRect(0, 0, 50, 50); }
    const logoImg = await loadImage(await new Promise(r => lg.toBlob(r, "image/png")));
    const lc = compose(img, 0, Object.assign({}, base, { kind: "logo", pos: 4, size: 50 }), logoImg), lx = lc.getContext("2d");
    const mid = lx.getImageData(200, 150, 1, 1).data, corner = lx.getImageData(5, 5, 1, 1).data;
    const ok2 = mid[0] === 255 && mid[1] === 0 && corner[0] === 0;
    // Export: JPEG keeps the size, file name gets the suffix.
    const r = await exportItem({ img, file: new File([], "photo.png", { type: "image/png" }) }, Object.assign({}, base, { format: "jpeg", quality: 90 }), null);
    const back = await loadImage(r.blob), head = new Uint8Array(await r.blob.slice(0, 2).arrayBuffer());
    const ok3 = back.naturalWidth === 400 && back.naturalHeight === 300 && head[0] === 0xFF && head[1] === 0xD8 && r.name === "photo-watermarked.jpg";
    return (ok1 && ok2 && ok3) || { ok1, ok2, ok3, br: br.q, tl: tl.q, tile: tile.q, half: half.max };
  };
})();
