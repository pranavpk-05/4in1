const imagesInput       = document.getElementById('images');
const generateBtn       = document.getElementById('generate');
const editPositionsBtn  = document.getElementById('editPositions');
const uploadZone        = document.getElementById('uploadZone');
const fileBadge         = document.getElementById('fileBadge');
const previewContainer  = document.getElementById('preview');
const thumbLabel        = document.getElementById('thumbLabel');
const thumbCount        = document.getElementById('thumbCount');
const clearAllBtn       = document.getElementById('clearAll');
const layoutGrid        = document.getElementById('layoutGrid');
const toastEl           = document.getElementById('toast');

const modal             = document.getElementById('modal');
const sheetBackdrop     = document.getElementById('sheetBackdrop');
const pagePreview       = document.getElementById('pagePreview');
const pagePreviewScaler = document.getElementById('pagePreviewScaler');
const previewScroll     = document.getElementById('previewScroll');
const modalClose        = document.getElementById('modalClose');
const swipeHint         = document.getElementById('swipeHint');

const zoomInBtn         = document.getElementById('zoomIn');
const zoomOutBtn        = document.getElementById('zoomOut');
const zoomLevelEl       = document.getElementById('zoomLevel');
const prevPageBtn       = document.getElementById('prevPage');
const nextPageBtn       = document.getElementById('nextPage');
const pageInfoEl        = document.getElementById('pageInfo');

// ── State ─────────────────────────────────────────────────────────────────────
let selectedFiles   = [];
let currentMode     = 'grid';
let currentPage     = 0;
let totalPages      = 0;
let zoom            = 1;
let liveOrientation = 'portrait';
let autoAlignMode   = false;

// ── PDF page dimensions (pt) ──────────────────────────────────────────────────
const PAGE = {
  portrait:  { W: 595, H: 842 },
  landscape: { W: 842, H: 595 },
};

// ── Grid config ───────────────────────────────────────────────────────────────
function getGridConfig(mode) {
  switch (mode) {
    case 'grid':   return { perPage: 4,  rows: 2, cols: 2 };
    case 'grid6':  return { perPage: 6,  rows: 3, cols: 2 };
    case 'grid8':  return { perPage: 8,  rows: 4, cols: 2 };
    case 'grid10': return { perPage: 10, rows: 5, cols: 2 };
    default:       return { perPage: 1,  rows: 1, cols: 1 };
  }
}

// ── Load image from File ──────────────────────────────────────────────────────
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className   = 'toast show ' + type;
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 2800);
}

// ── Layout button selection ───────────────────────────────────────────────────
layoutGrid.addEventListener('click', e => {
  const btn = e.target.closest('.layout-btn');
  if (!btn) return;
  document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentMode = btn.dataset.mode;
  selectedFiles.forEach(f => {
    f.freeX = null; f.freeY = null;
    f.freeW = null; f.freeH = null;
    f.offsetX = null; f.offsetY = null;
  });
});

// ── Upload zone drag events ───────────────────────────────────────────────────
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
['dragleave', 'drop'].forEach(evt =>
  uploadZone.addEventListener(evt, () => uploadZone.classList.remove('drag-over'))
);
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer.files.length) setFiles([...e.dataTransfer.files]);
});
imagesInput.addEventListener('change', () => setFiles([...imagesInput.files]));

function setFiles(files) {
  const newItems = files.map(file => ({
    file,
    orientation: 'portrait',
    offsetX: null, offsetY: null,
    scale: 1,
    freeX: null, freeY: null,
    freeW: null, freeH: null,
  }));
  selectedFiles = [...selectedFiles, ...newItems];
  renderPreview();
  updateActionState();
}

function updateActionState() {
  const has = selectedFiles.length > 0;
  editPositionsBtn.disabled = !has;
  generateBtn.disabled      = !has;
  fileBadge.textContent     = selectedFiles.length + ' selected';
  fileBadge.style.display   = has ? '' : 'none';
  thumbLabel.style.display  = has ? '' : 'none';
  thumbCount.textContent    = selectedFiles.length;
}

clearAllBtn.addEventListener('click', () => {
  selectedFiles = [];
  imagesInput.value = '';
  renderPreview();
  updateActionState();
});

// ── Render thumbnail strip ────────────────────────────────────────────────────
function renderPreview() {
  previewContainer.innerHTML = '';
  selectedFiles.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'preview-item';

    const badge = document.createElement('div');
    badge.className = 'order-badge';
    badge.textContent = idx + 1;

    const img = document.createElement('img');
    img.src = URL.createObjectURL(item.file);
    img.alt = item.file.name;

    const delBtn = document.createElement('button');
    delBtn.className = 'del-btn';
    delBtn.innerHTML = '✕';
    delBtn.setAttribute('aria-label', 'Remove image');
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      selectedFiles.splice(idx, 1);
      renderPreview();
      updateActionState();
    });

    const orientBtn = document.createElement('button');
    orientBtn.className = 'orient-btn';
    const updateOrientLabel = () => {
      orientBtn.innerHTML = item.orientation === 'portrait' ? '↕ Portrait' : '↔ Landscape';
    };
    updateOrientLabel();
    orientBtn.addEventListener('click', e => {
      e.stopPropagation();
      item.orientation = item.orientation === 'portrait' ? 'landscape' : 'portrait';
      item.offsetX = null; item.offsetY = null;
      item.freeX = null; item.freeY = null;
      updateOrientLabel();
    });

    div.append(badge, img, delBtn, orientBtn);
    previewContainer.appendChild(div);
  });
}

// ── Fitted size helper ────────────────────────────────────────────────────────
function calcFit(img, cellW, cellH, scale) {
  const ratio = Math.min(cellW / img.width, cellH / img.height);
  return { w: img.width * ratio * scale, h: img.height * ratio * scale };
}

// ── Canvas zoom ───────────────────────────────────────────────────────────────
function applyCanvasZoom() {
  zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
  if (!liveOrientation) return;
  const { W, H } = PAGE[liveOrientation];
  updateScalerTransform(W, H);
}

function updateScalerTransform(W, H) {
  const availW   = (previewScroll.clientWidth || window.innerWidth) - 32;
  const scaledW  = W * zoom;
  const fitExtra = scaledW > availW ? availW / scaledW : 1;
  const total    = zoom * fitExtra;
  pagePreview.style.transform       = `scale(${total})`;
  pagePreview.style.transformOrigin = 'top center';
  pagePreviewScaler.style.height    = (H * total) + 'px';
  pagePreviewScaler.style.display   = 'flex';
  pagePreviewScaler.style.justifyContent = 'center';
}

// ── Auto-align: snap image to fill its grid cell completely ───────────────────
function applyAutoAlign(item, col, row, cellW, cellH) {
  item.freeW = cellW;
  item.freeH = cellH;
  item.freeX = col * cellW;
  item.freeY = row * cellH;
}

// ═════════════════════════════════════════════════════════════════════════════
// CANVAS EDITOR
// ═════════════════════════════════════════════════════════════════════════════
async function loadPageFreeForm() {
  const { perPage, rows, cols } = getGridConfig(currentMode);
  const startIdx = currentPage * perPage;
  const slice    = selectedFiles.slice(startIdx, startIdx + perPage);
  if (!slice.length) return;

  liveOrientation = slice[0].orientation || 'portrait';
  const { W, H } = PAGE[liveOrientation];
  const cellW = W / cols;
  const cellH = H / rows;

  pagePreview.style.width     = W + 'px';
  pagePreview.style.height    = H + 'px';
  pagePreview.style.transform = 'scale(1)';
  pagePreview.style.position  = 'relative';
  pagePreview.style.overflow  = 'hidden';
  pagePreview.style.background = '#fff';
  pagePreview.innerHTML       = '';

  // ── Background ────────────────────────────────────────────────────────────
  const bgEl = document.createElement('div');
  bgEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;';

  if (autoAlignMode) {
    // Grid cell lines
    let lines = '';
    for (let c = 1; c < cols; c++) {
      const x = c * cellW;
      lines += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"
        stroke="rgba(108,99,255,0.25)" stroke-width="1.5" stroke-dasharray="6,4"/>`;
    }
    for (let r = 1; r < rows; r++) {
      const y = r * cellH;
      lines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"
        stroke="rgba(108,99,255,0.25)" stroke-width="1.5" stroke-dasharray="6,4"/>`;
    }
    // Cell index labels
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const slotIdx = r * cols + c + 1 + currentPage * perPage;
        if (slotIdx <= selectedFiles.length) continue; // filled — no label needed
        lines += `<text x="${c * cellW + cellW / 2}" y="${r * cellH + cellH / 2}"
          text-anchor="middle" dominant-baseline="middle"
          font-size="18" fill="rgba(108,99,255,0.18)" font-family="sans-serif">
          ${slotIdx}
        </text>`;
      }
    }
    bgEl.innerHTML = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"
      style="position:absolute;inset:0">${lines}</svg>`;
  } else {
    bgEl.style.backgroundImage = 'radial-gradient(circle, #dde1ea 1px, transparent 1px)';
    bgEl.style.backgroundSize  = '30px 30px';
    bgEl.style.opacity         = '0.55';
  }
  pagePreview.appendChild(bgEl);

  const imgs = await Promise.all(slice.map(i => loadImage(i.file)));

  imgs.forEach((img, idx) => {
    const item = slice[idx];
    const row  = Math.floor(idx / cols);
    const col  = idx % cols;

    if (autoAlignMode) {
      // Always fill the cell slot completely
      applyAutoAlign(item, col, row, cellW, cellH);
    } else {
      // Free mode: default scatter if first open
      if (item.freeX === null || item.freeX === undefined) {
        const ratio = Math.min(cellW * 0.85 / img.width, cellH * 0.85 / img.height);
        item.freeW = img.width  * ratio;
        item.freeH = img.height * ratio;
        item.freeX = col * cellW + (cellW - item.freeW) / 2;
        item.freeY = row * cellH + (cellH - item.freeH) / 2;
      }
    }

    const wrapper = buildFreeItem(img, item, W, H, idx, cellW, cellH, col, row);
    pagePreview.appendChild(wrapper);
  });

  pageInfoEl.textContent = `${currentPage + 1} / ${totalPages}`;
  updateScalerTransform(W, H);
}

// ── Build draggable image element ─────────────────────────────────────────────
function buildFreeItem(img, item, pageW, pageH, zIdx, cellW, cellH, cellCol, cellRow) {
  const wrapper = document.createElement('div');
  wrapper.dataset.freeitem = '1';
  wrapper.style.cssText = `
    position:absolute;
    left:${item.freeX}px; top:${item.freeY}px;
    width:${item.freeW}px; height:${item.freeH}px;
    z-index:${10 + zIdx};
    touch-action:none;
    box-shadow:0 2px 14px rgba(0,0,0,0.2), 0 0 0 1.5px rgba(108,99,255,0.22);
    border-radius:2px; cursor:grab; user-select:none; overflow:hidden;
  `;

  const imgEl = document.createElement('img');
  imgEl.src       = img.src;
  imgEl.draggable = false;
  imgEl.style.cssText = `
    width:100%; height:100%; display:block;
    object-fit:${autoAlignMode ? 'cover' : 'fill'};
    user-select:none; pointer-events:none;
  `;
  wrapper.appendChild(imgEl);

  // Selection ring
  let isSelected = false;
  const ring = document.createElement('div');
  ring.style.cssText = `
    position:absolute; inset:-2px; border-radius:3px;
    border:2.5px solid rgba(108,99,255,0);
    pointer-events:none; transition:border-color 0.12s; z-index:2;
  `;
  wrapper.appendChild(ring);

  function select() {
    if (isSelected) return;
    isSelected = true;
    ring.style.borderColor = 'rgba(108,99,255,0.9)';
    wrapper.style.zIndex = '999';
    wrapper.style.boxShadow = '0 6px 28px rgba(0,0,0,0.3), 0 0 0 2px rgba(108,99,255,0.55)';
    controls.style.opacity = '1';
    controls.style.pointerEvents = 'all';
    resizeHandle.style.opacity = '1';
    resizeHandle.style.pointerEvents = 'all';
  }

  function deselect() {
    if (!isSelected) return;
    isSelected = false;
    ring.style.borderColor = 'rgba(108,99,255,0)';
    wrapper.style.zIndex = String(10 + zIdx);
    wrapper.style.boxShadow = '0 2px 14px rgba(0,0,0,0.2), 0 0 0 1.5px rgba(108,99,255,0.22)';
    controls.style.opacity = '0';
    controls.style.pointerEvents = 'none';
    resizeHandle.style.opacity = '0';
    resizeHandle.style.pointerEvents = 'none';
  }

  pagePreview.addEventListener('pointerdown', e => {
    if (!wrapper.contains(e.target)) deselect();
  });

  // ── Controls ──────────────────────────────────────────────────────────────
  const controls = document.createElement('div');
  controls.style.cssText = `
    position:absolute; top:6px; right:6px;
    display:flex; align-items:center; gap:4px;
    background:rgba(8,8,20,0.82); border-radius:8px; padding:4px 7px;
    z-index:20; pointer-events:none; user-select:none;
    border:1px solid rgba(255,255,255,.1);
    opacity:0; transition:opacity 0.13s;
    backdrop-filter:blur(6px);
  `;

  const bs = `
    width:28px; height:28px; border-radius:6px;
    background:rgba(108,99,255,.32); color:#fff;
    border:1px solid rgba(108,99,255,.5);
    font-size:16px; cursor:pointer; line-height:1;
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  `;

  const sizeLabel = document.createElement('span');
  sizeLabel.style.cssText = `
    color:#e2e8f0; font-size:11px; min-width:36px;
    text-align:center; font-family:sans-serif;
  `;
  const syncSizeLabel = () => {
    sizeLabel.textContent = Math.round((item.freeW / pageW) * 100) + '%';
  };
  syncSizeLabel();

  function growImage(factor) {
    const newW = Math.max(30, Math.min(pageW * 2.5, item.freeW * factor));
    const newH = item.freeH * (newW / item.freeW);
    item.freeW = newW; item.freeH = newH;
    wrapper.style.width  = newW + 'px';
    wrapper.style.height = newH + 'px';
    syncSizeLabel();
  }

  const minusBtn = document.createElement('button');
  minusBtn.innerHTML = '−'; minusBtn.style.cssText = bs;
  minusBtn.addEventListener('click', e => { e.stopPropagation(); growImage(1 / 1.15); });

  const plusBtn = document.createElement('button');
  plusBtn.innerHTML = '+'; plusBtn.style.cssText = bs;
  plusBtn.addEventListener('click', e => { e.stopPropagation(); growImage(1.15); });

  controls.append(minusBtn, sizeLabel, plusBtn);

  // ── Snap-to-slot button (auto-align mode only) ───────────────────────────
  if (autoAlignMode) {
    const snapBtn = document.createElement('button');
    snapBtn.innerHTML = '⊡';
    snapBtn.title = 'Snap back to grid slot';
    snapBtn.style.cssText = bs +
      'background:rgba(34,197,94,.3); border-color:rgba(34,197,94,.55); margin-left:2px;';
    snapBtn.addEventListener('click', e => {
      e.stopPropagation();
      applyAutoAlign(item, cellCol, cellRow, cellW, cellH);
      wrapper.style.left   = item.freeX + 'px';
      wrapper.style.top    = item.freeY + 'px';
      wrapper.style.width  = item.freeW + 'px';
      wrapper.style.height = item.freeH + 'px';
      syncSizeLabel();
      showToast('↩ Snapped to slot');
    });
    controls.appendChild(snapBtn);
  }

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.innerHTML = '✕';
  delBtn.style.cssText = bs +
    'background:rgba(220,50,50,.35); border-color:rgba(220,50,50,.55); margin-left:4px;';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    const globalIdx = selectedFiles.indexOf(item);
    if (globalIdx !== -1) { selectedFiles.splice(globalIdx, 1); renderPreview(); updateActionState(); }
    wrapper.remove();
  });
  controls.appendChild(delBtn);
  wrapper.appendChild(controls);

  // ── Resize handle ─────────────────────────────────────────────────────────
  const resizeHandle = document.createElement('div');
  resizeHandle.style.cssText = `
    position:absolute; bottom:-5px; right:-5px;
    width:16px; height:16px; border-radius:3px;
    background:rgba(108,99,255,0.9); cursor:nwse-resize;
    z-index:25; opacity:0; transition:opacity 0.13s;
    border:2px solid #fff; touch-action:none;
  `;
  wrapper.appendChild(resizeHandle);
  enableResizeDrag(resizeHandle, wrapper, item, syncSizeLabel);

  // Scroll-wheel zoom
  wrapper.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    growImage(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    select();
  }, { passive: false });

  // Pinch-to-zoom
  let pinchDist0 = null, pinchW0, pinchH0;
  wrapper.addEventListener('touchstart', e => {
    if (e.touches.length !== 2) return;
    pinchDist0 = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    pinchW0 = item.freeW; pinchH0 = item.freeH;
    e.preventDefault();
  }, { passive: false });
  wrapper.addEventListener('touchmove', e => {
    if (pinchDist0 === null || e.touches.length !== 2) return;
    e.preventDefault();
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const newW = Math.max(30, Math.min(pageW * 2.5, pinchW0 * (d / pinchDist0)));
    item.freeW = newW; item.freeH = pinchH0 * (newW / pinchW0);
    wrapper.style.width  = item.freeW + 'px';
    wrapper.style.height = item.freeH + 'px';
    syncSizeLabel();
  }, { passive: false });
  wrapper.addEventListener('touchend', e => {
    if (e.touches.length === 0) pinchDist0 = null;
  }, { passive: true });

  enableFreeDrag(wrapper, item, select, deselect);

  return wrapper;
}

// ── Free drag ─────────────────────────────────────────────────────────────────
function enableFreeDrag(el, item, onSelect) {
  let sx, sy, sl, st, dragging = false;

  function getPos(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }
  function start(e) {
    if (e.target.style && e.target.style.cursor === 'nwse-resize') return;
    if (e.touches && e.touches.length > 1) return;
    dragging = true;
    const p = getPos(e);
    sx = p.x; sy = p.y;
    sl = parseFloat(el.style.left) || 0;
    st = parseFloat(el.style.top)  || 0;
    el.style.cursor = 'grabbing';
    onSelect();
  }
  function move(e) {
    if (!dragging) return;
    if (e.touches && e.touches.length > 1) { end(); return; }
    e.preventDefault();
    const p = getPos(e);
    el.style.left = (sl + p.x - sx) + 'px';
    el.style.top  = (st + p.y - sy) + 'px';
  }
  function end() {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = 'grab';
    item.freeX = parseFloat(el.style.left);
    item.freeY = parseFloat(el.style.top);
  }

  el.addEventListener('mousedown',  start);
  el.addEventListener('touchstart', e => { if (e.touches.length === 1) start(e); }, { passive: false });
  window.addEventListener('mousemove',  move);
  window.addEventListener('touchmove',  move, { passive: false });
  window.addEventListener('mouseup',    end);
  window.addEventListener('touchend',   end, { passive: true });
}

// ── Resize drag ───────────────────────────────────────────────────────────────
function enableResizeDrag(handle, wrapper, item, syncLabel) {
  let sx, sy, sw, sh, resizing = false;
  function getPos(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }
  function start(e) {
    e.stopPropagation(); e.preventDefault();
    resizing = true;
    const p = getPos(e);
    sx = p.x; sy = p.y; sw = item.freeW; sh = item.freeH;
  }
  function move(e) {
    if (!resizing) return;
    e.preventDefault();
    const p = getPos(e);
    const avg = ((p.x - sx) + (p.y - sy)) / 2;
    const newW = Math.max(30, sw + avg);
    item.freeW = newW; item.freeH = sh * (newW / sw);
    wrapper.style.width  = item.freeW + 'px';
    wrapper.style.height = item.freeH + 'px';
    if (syncLabel) syncLabel();
  }
  function end() { resizing = false; }
  handle.addEventListener('mousedown',  start);
  handle.addEventListener('touchstart', start, { passive: false });
  window.addEventListener('mousemove',  move);
  window.addEventListener('touchmove',  move, { passive: false });
  window.addEventListener('mouseup',    end);
  window.addEventListener('touchend',   end, { passive: true });
}

async function loadPage() { await loadPageFreeForm(); }

// ── Swipe between pages ───────────────────────────────────────────────────────
let swipeStartX = null;
previewScroll.addEventListener('touchstart', e => {
  if (e.touches.length === 1) swipeStartX = e.touches[0].clientX;
}, { passive: true });
previewScroll.addEventListener('touchend', e => {
  if (swipeStartX === null) return;
  const dx = e.changedTouches[0].clientX - swipeStartX;
  swipeStartX = null;
  if (Math.abs(dx) < 60) return;
  if (dx < 0 && currentPage < totalPages - 1) { currentPage++; loadPage(); }
  if (dx > 0 && currentPage > 0)              { currentPage--; loadPage(); }
}, { passive: true });

// ── Inject Auto Align toggle into the modal toolbar ───────────────────────────
function injectAlignToggle() {
  if (document.getElementById('alignToggle')) return;
  const toolbar = document.querySelector('.sheet-toolbar');
  if (!toolbar) return;

  const wrap = document.createElement('div');
  wrap.className = 'ctrl-group';

  const btn = document.createElement('button');
  btn.id = 'alignToggle';
  btn.style.cssText = `
    display:flex; align-items:center; gap:6px;
    padding:0 11px; height:32px; border-radius:8px;
    font-size:12px; font-weight:600; cursor:pointer;
    white-space:nowrap; letter-spacing:0.02em;
    transition:background 0.15s, border-color 0.15s, color 0.15s;
    background:rgba(108,99,255,0.12);
    border:1.5px solid rgba(108,99,255,0.3);
    color:#a5b4fc;
  `;

  const indicator = document.createElement('span');
  indicator.style.cssText = `
    width:8px; height:8px; border-radius:50%; flex-shrink:0;
    transition:background 0.15s; background:rgba(108,99,255,0.45);
    display:inline-block;
  `;
  const label = document.createElement('span');

  function syncUI() {
    if (autoAlignMode) {
      label.textContent        = 'Auto Aligned';
      indicator.style.background = '#818cf8';
      btn.style.background     = 'rgba(108,99,255,0.28)';
      btn.style.borderColor    = 'rgba(108,99,255,0.72)';
      btn.style.color          = '#c7d2fe';
    } else {
      label.textContent        = 'Auto Align';
      indicator.style.background = 'rgba(108,99,255,0.4)';
      btn.style.background     = 'rgba(108,99,255,0.12)';
      btn.style.borderColor    = 'rgba(108,99,255,0.3)';
      btn.style.color          = '#a5b4fc';
    }
  }
  syncUI();

  btn.addEventListener('click', async () => {
    autoAlignMode = !autoAlignMode;
    // Clear stored positions so alignment re-runs fresh
    selectedFiles.forEach(f => {
      f.freeX = null; f.freeY = null;
      f.freeW = null; f.freeH = null;
    });
    syncUI();
    showToast(autoAlignMode ? '⊞ Images snapped to grid slots' : '✏️ Free positioning mode');
    await loadPage();
  });

  btn.append(indicator, label);
  wrap.appendChild(btn);

  const closeBtn = toolbar.querySelector('.close-btn');
  closeBtn ? toolbar.insertBefore(wrap, closeBtn) : toolbar.appendChild(wrap);
}

// ── Open editor ───────────────────────────────────────────────────────────────
editPositionsBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) { showToast('Select images first', 'err'); return; }
  const { perPage } = getGridConfig(currentMode);
  totalPages  = Math.ceil(selectedFiles.length / perPage);
  currentPage = 0;
  zoom        = 1;
  zoomLevelEl.textContent = '100%';
  modal.classList.add('open');
  swipeHint.style.display = totalPages > 1 ? '' : 'none';
  injectAlignToggle();
  await loadPage();
});

// ── Page navigation ───────────────────────────────────────────────────────────
prevPageBtn.addEventListener('click', () => { if (currentPage > 0) { currentPage--; loadPage(); } });
nextPageBtn.addEventListener('click', () => { if (currentPage < totalPages - 1) { currentPage++; loadPage(); } });

// ── Canvas zoom ───────────────────────────────────────────────────────────────
zoomInBtn.addEventListener('click',  () => { zoom = Math.min(zoom + 0.25, 3);    applyCanvasZoom(); });
zoomOutBtn.addEventListener('click', () => { zoom = Math.max(zoom - 0.25, 0.25); applyCanvasZoom(); });

// ── Close modal ───────────────────────────────────────────────────────────────
function closeModal() { modal.classList.remove('open'); }
modalClose.addEventListener('click',    closeModal);
sheetBackdrop.addEventListener('click', closeModal);

// ── Generate PDF ──────────────────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) { showToast('Please select images first', 'err'); return; }
  generateBtn.disabled  = true;
  generateBtn.innerHTML = '<span>⏳</span> Generating…';
  showToast('⏳ Building PDF…');

  try {
    const imgs = await Promise.all(selectedFiles.map(i => loadImage(i.file)));
    const { jsPDF } = window.jspdf;
    const { perPage, rows, cols } = getGridConfig(currentMode);
    let doc;

    for (let i = 0; i < imgs.length; i += perPage) {
      const orientation = selectedFiles[i].orientation;
      const { W, H }    = PAGE[orientation];
      const cellW = W / cols;
      const cellH = H / rows;

      if (!doc) {
        doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
      } else {
        doc.addPage('a4', orientation);
      }

      imgs.slice(i, i + perPage).forEach((img, idx) => {
        const item = selectedFiles[i + idx];
        const row  = Math.floor(idx / cols);
        const col  = idx % cols;

        let x, y, w, h;
        if (item.freeX !== null && item.freeX !== undefined && item.freeW) {
          x = item.freeX; y = item.freeY;
          w = item.freeW; h = item.freeH;
        } else {
          const fit = calcFit(img, cellW, cellH, item.scale);
          w = fit.w; h = fit.h;
          const ox = item.offsetX !== null ? item.offsetX : (cellW - w) / 2;
          const oy = item.offsetY !== null ? item.offsetY : (cellH - h) / 2;
          x = col * cellW + ox;
          y = row * cellH + oy;
        }

        const cx = Math.max(0, x), cy = Math.max(0, y);
        const cw = Math.min(w, W - cx), ch = Math.min(h, H - cy);
        doc.addImage(img.src, 'JPEG', cx, cy, cw, ch);
      });
    }

    doc.save('images.pdf');
    showToast('✅ PDF saved!', 'ok');
  } catch (err) {
    console.error(err);
    showToast('❌ Error — check console', 'err');
  } finally {
    generateBtn.disabled  = false;
    generateBtn.innerHTML = '<span>⬇️</span> Generate PDF';
  }
});
