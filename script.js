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
  selectedFiles.forEach(f => { f.freeX = null; f.freeY = null; f.offsetX = null; f.offsetY = null; });
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
    // Free-form canvas position (page-absolute, in PDF pt)
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

// ── Apply canvas zoom (pure CSS — zero DOM rebuild) ───────────────────────────
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

// ═════════════════════════════════════════════════════════════════════════════
// FREE-FORM CANVAS EDITOR
// Images are placed freely anywhere on the page — no grid, no cell clipping.
// Each image tracks freeX, freeY (page-absolute, PDF pt) and freeW, freeH.
// ═════════════════════════════════════════════════════════════════════════════

async function loadPageFreeForm() {
  const { perPage } = getGridConfig(currentMode);
  const startIdx = currentPage * perPage;
  const slice    = selectedFiles.slice(startIdx, startIdx + perPage);
  if (!slice.length) return;

  liveOrientation = slice[0].orientation || 'portrait';
  const { W, H } = PAGE[liveOrientation];

  pagePreview.style.width     = W + 'px';
  pagePreview.style.height    = H + 'px';
  pagePreview.style.transform = 'scale(1)';
  pagePreview.style.position  = 'relative';
  pagePreview.style.overflow  = 'hidden';
  pagePreview.style.background = '#fff';
  pagePreview.innerHTML       = '';

  // Subtle grid dots background to indicate free canvas
  const gridDots = document.createElement('div');
  gridDots.style.cssText = `
    position:absolute; inset:0; pointer-events:none; z-index:0;
    background-image: radial-gradient(circle, #dde1ea 1px, transparent 1px);
    background-size: 30px 30px;
    opacity: 0.6;
  `;
  pagePreview.appendChild(gridDots);

  const imgs = await Promise.all(slice.map(i => loadImage(i.file)));

  // Default layout: tile images in a loose grid as starting positions
  const cols = Math.ceil(Math.sqrt(slice.length));
  const cellW = W / cols;
  const cellH = H / Math.ceil(slice.length / cols);

  imgs.forEach((img, idx) => {
    const item = slice[idx];

    // Default free size: fit nicely in a cell-sized area
    const defaultScale = item.scale || 1;
    const ratio = Math.min(cellW * 0.85 / img.width, cellH * 0.85 / img.height);
    const fw = img.width * ratio * defaultScale;
    const fh = img.height * ratio * defaultScale;

    // Default position: centre of each cell slot
    const defCol = idx % cols;
    const defRow = Math.floor(idx / cols);
    const defX   = defCol * cellW + (cellW - fw) / 2;
    const defY   = defRow * cellH + (cellH - fh) / 2;

    if (item.freeX === null || item.freeX === undefined) item.freeX = defX;
    if (item.freeY === null || item.freeY === undefined) item.freeY = defY;
    if (item.freeW === null || item.freeW === undefined) item.freeW = fw;
    if (item.freeH === null || item.freeH === undefined) item.freeH = fh;

    const wrapper = buildFreeItem(img, item, W, H, idx);
    pagePreview.appendChild(wrapper);
  });

  pageInfoEl.textContent = `${currentPage + 1} / ${totalPages}`;
  updateScalerTransform(W, H);
}

// ── Build a free-form draggable+resizable image element ───────────────────────
function buildFreeItem(img, item, pageW, pageH, zIdx) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: absolute;
    left:   ${item.freeX}px;
    top:    ${item.freeY}px;
    width:  ${item.freeW}px;
    height: ${item.freeH}px;
    z-index: ${10 + zIdx};
    touch-action: none;
    box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 0 0 1.5px rgba(108,99,255,0.25);
    border-radius: 3px;
    cursor: grab;
    user-select: none;
  `;

  const imgEl = document.createElement('img');
  imgEl.src       = img.src;
  imgEl.draggable = false;
  imgEl.style.cssText = `
    width: 100%; height: 100%;
    display: block; object-fit: fill;
    user-select: none; pointer-events: none;
    border-radius: 3px;
  `;
  wrapper.appendChild(imgEl);

  // ── Selection highlight ring ───────────────────────────────────────────────
  let isSelected = false;
  const ring = document.createElement('div');
  ring.style.cssText = `
    position:absolute; inset:-2px; border-radius:4px;
    border: 2px solid rgba(108,99,255,0); pointer-events:none;
    transition: border-color 0.15s;
  `;
  wrapper.appendChild(ring);

  function select() {
    if (isSelected) return;
    isSelected = true;
    ring.style.borderColor = 'rgba(108,99,255,0.85)';
    wrapper.style.zIndex = '999';
    wrapper.style.boxShadow = '0 4px 20px rgba(0,0,0,0.28), 0 0 0 2px rgba(108,99,255,0.5)';
    // Show controls
    controls.style.opacity = '1';
    controls.style.pointerEvents = 'all';
    resizeHandle.style.opacity = '1';
    resizeHandle.style.pointerEvents = 'all';
  }
  function deselect() {
    isSelected = false;
    ring.style.borderColor = 'rgba(108,99,255,0)';
    wrapper.style.zIndex = String(10 + zIdx);
    wrapper.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18), 0 0 0 1.5px rgba(108,99,255,0.25)';
    controls.style.opacity = '0';
    controls.style.pointerEvents = 'none';
    resizeHandle.style.opacity = '0';
    resizeHandle.style.pointerEvents = 'none';
  }

  // Deselect when clicking the page background
  pagePreview.addEventListener('click', e => {
    if (e.target === pagePreview || e.target.tagName === 'DIV' && !e.target.closest('[data-freeitem]')) {
      deselect();
    }
  });

  wrapper.dataset.freeitem = '1';

  // ── Scale / size controls overlay ─────────────────────────────────────────
  const controls = document.createElement('div');
  controls.style.cssText = `
    position:absolute; top:6px; right:6px;
    display:flex; align-items:center; gap:4px;
    background:rgba(10,10,20,0.72); border-radius:8px; padding:4px 6px;
    z-index:20; pointer-events:none; user-select:none;
    border:1px solid rgba(255,255,255,.12);
    opacity:0; transition: opacity 0.15s;
    backdrop-filter: blur(4px);
  `;

  const btnStyle = `
    width:28px; height:28px; border-radius:6px;
    background:rgba(108,99,255,.35); color:#fff;
    border:1px solid rgba(108,99,255,.5);
    font-size:16px; cursor:pointer; line-height:1;
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0;
  `;

  const STEP = 0.1, MIN = 0.2, MAX = 5;
  const clamp = v => Math.min(MAX, Math.max(MIN, v));

  const scaleLabel = document.createElement('span');
  scaleLabel.style.cssText = `color:#e2e8f0; font-size:11px; min-width:38px; text-align:center; font-family:sans-serif;`;
  const syncLabel = () => {
    // Show size as percentage of page width
    scaleLabel.textContent = Math.round((item.freeW / pageW) * 100) + '%';
  };
  syncLabel();

  function growImage(factor) {
    const newW = Math.max(30, Math.min(pageW * 2, item.freeW * factor));
    const newH = item.freeH * (newW / item.freeW);
    item.freeW = newW;
    item.freeH = newH;
    wrapper.style.width  = newW + 'px';
    wrapper.style.height = newH + 'px';
    syncLabel();
  }

  const minusBtn = document.createElement('button');
  minusBtn.innerHTML = '−'; minusBtn.style.cssText = btnStyle;
  minusBtn.addEventListener('click', e => { e.stopPropagation(); growImage(1 / 1.15); });

  const plusBtn = document.createElement('button');
  plusBtn.innerHTML = '+'; plusBtn.style.cssText = btnStyle;
  plusBtn.addEventListener('click', e => { e.stopPropagation(); growImage(1.15); });

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.innerHTML = '✕';
  delBtn.style.cssText = btnStyle + 'background:rgba(220,50,50,.4); border-color:rgba(220,50,50,.6); margin-left:4px;';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    // Find and remove this item from selectedFiles
    const globalIdx = selectedFiles.indexOf(item);
    if (globalIdx !== -1) {
      selectedFiles.splice(globalIdx, 1);
      renderPreview();
      updateActionState();
    }
    wrapper.remove();
  });

  controls.append(minusBtn, scaleLabel, plusBtn, delBtn);
  wrapper.appendChild(controls);

  // ── Resize handle (bottom-right corner) ───────────────────────────────────
  const resizeHandle = document.createElement('div');
  resizeHandle.style.cssText = `
    position:absolute; bottom:-5px; right:-5px;
    width:16px; height:16px; border-radius:3px;
    background:rgba(108,99,255,0.9); cursor:nwse-resize;
    z-index:25; opacity:0; transition: opacity 0.15s;
    border:2px solid #fff;
  `;
  wrapper.appendChild(resizeHandle);

  // Resize drag
  enableResizeDrag(resizeHandle, wrapper, item, syncLabel);

  // ── Scroll-wheel scale ────────────────────────────────────────────────────
  wrapper.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    growImage(e.deltaY < 0 ? 1.08 : 1 / 1.08);
    select();
  }, { passive: false });

  // ── Pinch-to-zoom ─────────────────────────────────────────────────────────
  let pinchStartDist = null, pinchStartW, pinchStartH;
  wrapper.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartW = item.freeW;
      pinchStartH = item.freeH;
      e.preventDefault();
    }
  }, { passive: false });

  wrapper.addEventListener('touchmove', e => {
    if (pinchStartDist === null || e.touches.length !== 2) return;
    e.preventDefault();
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    const factor = dist / pinchStartDist;
    const newW = Math.max(30, Math.min(pageW * 2, pinchStartW * factor));
    const newH = pinchStartH * (newW / pinchStartW);
    item.freeW = newW; item.freeH = newH;
    wrapper.style.width  = newW + 'px';
    wrapper.style.height = newH + 'px';
    syncLabel();
  }, { passive: false });

  wrapper.addEventListener('touchend', e => {
    if (e.touches.length === 0) pinchStartDist = null;
  }, { passive: true });

  // ── Free drag ─────────────────────────────────────────────────────────────
  enableFreeDrag(wrapper, item, pagePreview, select, deselect);

  return wrapper;
}

// ── Free drag (page-relative, no cell clamping) ───────────────────────────────
function enableFreeDrag(el, item, canvas, onSelect, onDeselect) {
  let startMX, startMY, startL, startT, dragging = false, moved = false;

  function getPos(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  function start(e) {
    if (e.target.closest && (
      e.target.closest('.img-scale-controls') ||
      e.target.style.cursor === 'nwse-resize'
    )) return;
    if (e.touches && e.touches.length > 1) return;
    dragging = true; moved = false;
    const pos = getPos(e);
    startMX = pos.x; startMY = pos.y;
    startL  = parseFloat(el.style.left) || 0;
    startT  = parseFloat(el.style.top)  || 0;
    el.style.cursor = 'grabbing';
    el.style.transition = 'none';
    onSelect();
  }

  function move(e) {
    if (!dragging) return;
    if (e.touches && e.touches.length > 1) { end(); return; }
    e.preventDefault();
    const pos = getPos(e);
    const dx = pos.x - startMX;
    const dy = pos.y - startMY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    el.style.left = (startL + dx) + 'px';
    el.style.top  = (startT + dy) + 'px';
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

  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });

  window.addEventListener('mouseup',  end);
  window.addEventListener('touchend', end, { passive: true });
}

// ── Resize drag from corner handle ────────────────────────────────────────────
function enableResizeDrag(handle, wrapper, item, syncLabel) {
  let startMX, startMY, startW, startH, resizing = false;

  function getPos(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  function start(e) {
    e.stopPropagation(); e.preventDefault();
    resizing = true;
    const pos = getPos(e);
    startMX = pos.x; startMY = pos.y;
    startW  = item.freeW;
    startH  = item.freeH;
  }

  function move(e) {
    if (!resizing) return;
    e.preventDefault();
    const pos = getPos(e);
    const dx  = pos.x - startMX;
    const dy  = pos.y - startMY;
    // Maintain aspect ratio via average of dx/dy deltas
    const avgDelta = (dx + dy) / 2;
    const newW = Math.max(30, startW + avgDelta);
    const newH = startH * (newW / startW);
    item.freeW = newW; item.freeH = newH;
    wrapper.style.width  = newW + 'px';
    wrapper.style.height = newH + 'px';
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

// ── Build page (old grid mode — used for PDF layout reference) ────────────────
async function loadPage() {
  // In "Edit Positions" we now always use free-form mode
  await loadPageFreeForm();
}

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
  await loadPage();
});

// ── Page navigation ───────────────────────────────────────────────────────────
prevPageBtn.addEventListener('click', () => {
  if (currentPage > 0) { currentPage--; loadPage(); }
});
nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages - 1) { currentPage++; loadPage(); }
});

// ── Canvas zoom (pure CSS) ────────────────────────────────────────────────────
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

        // Use free-form position if set, else fall back to grid fit
        let x, y, w, h;
        if (item.freeX !== null && item.freeX !== undefined && item.freeW) {
          x = item.freeX;
          y = item.freeY;
          w = item.freeW;
          h = item.freeH;
        } else {
          const fit = calcFit(img, cellW, cellH, item.scale);
          w = fit.w; h = fit.h;
          const ox = item.offsetX !== null ? item.offsetX : (cellW - w) / 2;
          const oy = item.offsetY !== null ? item.offsetY : (cellH - h) / 2;
          x = col * cellW + ox;
          y = row * cellH + oy;
        }

        // Clip to page bounds for PDF safety
        const cx = Math.max(0, x);
        const cy = Math.max(0, y);
        const cw = Math.min(w, W - cx);
        const ch = Math.min(h, H - cy);

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
