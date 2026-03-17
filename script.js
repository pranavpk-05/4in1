// ── DOM refs ──────────────────────────────────────────────────────────────────
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
let selectedFiles = [];
let currentMode   = 'grid';
let currentPage   = 0;
let totalPages    = 0;
let zoom          = 1;          // canvas-level zoom (CSS transform, no DOM rebuild)

// Per-page live refs for in-place updates (avoids innerHTML wipe flicker)
let liveWrappers  = [];         // [{ wrapper, imgEl, scaleLabel, item, img, cellW, cellH, col, row }]
let liveOrientation = 'portrait';

// ── PDF page dimensions (points) ──────────────────────────────────────────────
const PAGE = {
  portrait:  { W: 595, H: 842 },
  landscape: { W: 842, H: 595 },
};


// ── Grid config ───────────────────────────────────────────────────────────────
function getGridConfig(mode) {
  switch (mode) {
    case 'grid':  return { perPage: 4, rows: 2, cols: 2 };
    case 'grid6': return { perPage: 6, rows: 3, cols: 2 };
    case 'grid8': return { perPage: 8, rows: 4, cols: 2 };
    default:      return { perPage: 1, rows: 1, cols: 1 };
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
  selectedFiles.forEach(f => { f.offsetX = null; f.offsetY = null; });
});


// ── Upload zone drag ──────────────────────────────────────────────────────────
uploadZone.addEventListener('dragover', e => {
  e.preventDefault(); uploadZone.classList.add('drag-over');
});
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
    file, orientation: 'portrait', offsetX: null, offsetY: null, scale: 1
  }));
  selectedFiles = [...selectedFiles, ...newItems];
  renderPreview();
  updateActionState();
}

function updateActionState() {
  const has = selectedFiles.length > 0;
  editPositionsBtn.disabled = !has;
  generateBtn.disabled      = !has;
  fileBadge.textContent = selectedFiles.length + ' selected';
  fileBadge.style.display = has ? '' : 'none';
  thumbLabel.style.display = has ? '' : 'none';
  thumbCount.textContent = selectedFiles.length;
}

clearAllBtn.addEventListener('click', () => {
  selectedFiles = [];
  imagesInput.value = '';
  renderPreview();
  updateActionState();
});


// ── Render thumbnails ─────────────────────────────────────────────────────────
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
      updateOrientLabel();
    });

    div.append(badge, img, delBtn, orientBtn);
    previewContainer.appendChild(div);
  });
}


// ── Apply canvas zoom (CSS transform — zero DOM rebuild, zero flicker) ─────────
function applyCanvasZoom() {
  zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
  if (!liveOrientation) return;
  const { W, H } = PAGE[liveOrientation];
  updateScalerTransform(W, H);
}

// Compute the combined CSS scale (canvas zoom × fit-to-width) and apply it.
// pagePreview dimensions are always in raw PDF-space (no zoom baked in).
function updateScalerTransform(W, H) {
  const availW   = (previewScroll.clientWidth || window.innerWidth) - 32;
  const scaledW  = W * zoom;
  const fitExtra = scaledW > availW ? availW / scaledW : 1;
  const total    = zoom * fitExtra;

  pagePreview.style.transform       = `scale(${total})`;
  pagePreview.style.transformOrigin = 'top center';
  // Keep the scaler container the right height so scroll knows how tall the page is
  pagePreviewScaler.style.height    = (H * total) + 'px';
  pagePreviewScaler.style.display   = 'flex';
  pagePreviewScaler.style.justifyContent = 'center';
}


// ── Calculate image fitted size in PDF space ───────────────────────────────────
function calcFit(img, cellW, cellH, scale) {
  const ratio = Math.min(cellW / img.width, cellH / img.height);
  return { w: img.width * ratio * scale, h: img.height * ratio * scale };
}


// ── Build page DOM (only called on page change, not on zoom/scale) ─────────────
async function loadPage() {
  const { perPage, rows, cols } = getGridConfig(currentMode);
  const startIdx = currentPage * perPage;
  const slice    = selectedFiles.slice(startIdx, startIdx + perPage);
  if (!slice.length) return;

  liveOrientation = slice[0].orientation || 'portrait';
  const { W, H }  = PAGE[liveOrientation];
  const cellW     = W / cols;
  const cellH     = H / rows;

  // Set pagePreview to raw PDF dimensions — zoom is purely CSS
  pagePreview.style.width  = W + 'px';
  pagePreview.style.height = H + 'px';
  pagePreview.style.transform = 'scale(1)'; // reset before measuring

  // Wipe only the page content (one clear, then we never clear again during interaction)
  pagePreview.innerHTML = '';
  liveWrappers = [];

  const imgs = await Promise.all(slice.map(i => loadImage(i.file)));

  imgs.forEach((img, idx) => {
    const item = slice[idx];
    const row  = Math.floor(idx / cols);
    const col  = idx % cols;
    const { w, h } = calcFit(img, cellW, cellH, item.scale);

    if (item.offsetX === null || item.offsetY === null) {
      item.offsetX = col * cellW + (cellW - w) / 2;
      item.offsetY = row * cellH + (cellH - h) / 2;
    }

    // ── Wrapper ──────────────────────────────────────────────────────
    const wrapper = document.createElement('div');
    // GPU-accelerated positioning — will-change prevents repaint flicker
    wrapper.style.cssText = `
      position: absolute;
      left:   ${item.offsetX}px;
      top:    ${item.offsetY}px;
      width:  ${w}px;
      height: ${h}px;
      touch-action: none;
      will-change: transform, left, top;
    `;

    // ── Image element ─────────────────────────────────────────────────
    const imgEl = document.createElement('img');
    imgEl.src   = img.src;
    imgEl.draggable = false;
    imgEl.style.cssText = `
      width: 100%; height: 100%;
      display: block; user-select: none; pointer-events: none;
      will-change: transform;
    `;
    wrapper.appendChild(imgEl);

    // ── Scale label (shared ref updated in-place) ─────────────────────
    const scaleLabel = document.createElement('span');
    scaleLabel.style.cssText = `
      color:#e2e8f0; font-size:11px; min-width:38px;
      text-align:center; font-family:Inter,sans-serif;
    `;
    const syncLabel = () => { scaleLabel.textContent = Math.round(item.scale * 100) + '%'; };
    syncLabel();

    // ── In-place scale update (no DOM wipe!) ──────────────────────────
    function applyScaleInPlace() {
      const { w: nw, h: nh } = calcFit(img, cellW, cellH, item.scale);
      const nx = col * cellW + (cellW - nw) / 2;
      const ny = row * cellH + (cellH - nh) / 2;
      item.offsetX = nx; item.offsetY = ny;
      wrapper.style.width  = nw + 'px';
      wrapper.style.height = nh + 'px';
      wrapper.style.left   = nx + 'px';
      wrapper.style.top    = ny + 'px';
      syncLabel();
    }

    // ── Scale controls overlay ────────────────────────────────────────
    const controls = document.createElement('div');
    controls.className = 'img-scale-controls';
    controls.style.cssText = `
      position:absolute; bottom:6px; right:6px;
      display:flex; align-items:center; gap:4px;
      background:rgba(0,0,0,.65); border-radius:8px; padding:4px 6px;
      z-index:10; pointer-events:all; user-select:none;
      border:1px solid rgba(255,255,255,.1);
    `;

    const btnStyle = `
      width:28px; height:28px; border-radius:6px;
      background:rgba(108,99,255,.3); color:#fff;
      border:1px solid rgba(108,99,255,.4);
      font-size:16px; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
    `;

    const STEP = 0.1, MIN = 0.2, MAX = 5;
    const clamp = v => Math.min(MAX, Math.max(MIN, v));

    const minusBtn = document.createElement('button');
    minusBtn.innerHTML = '−'; minusBtn.style.cssText = btnStyle;
    minusBtn.addEventListener('click', e => {
      e.stopPropagation();
      item.scale = clamp(parseFloat((item.scale - STEP).toFixed(2)));
      applyScaleInPlace();   // ← in-place, no DOM wipe
    });

    const plusBtn = document.createElement('button');
    plusBtn.innerHTML = '+'; plusBtn.style.cssText = btnStyle;
    plusBtn.addEventListener('click', e => {
      e.stopPropagation();
      item.scale = clamp(parseFloat((item.scale + STEP).toFixed(2)));
      applyScaleInPlace();   // ← in-place, no DOM wipe
    });

    controls.append(minusBtn, scaleLabel, plusBtn);
    wrapper.appendChild(controls);

    // ── Scroll-wheel scale (desktop) ──────────────────────────────────
    wrapper.addEventListener('wheel', e => {
      e.preventDefault(); e.stopPropagation();
      item.scale = clamp(parseFloat((item.scale + (e.deltaY < 0 ? STEP : -STEP)).toFixed(2)));
      applyScaleInPlace();   // ← in-place, no DOM wipe
    }, { passive: false });

    // ── Pinch-to-zoom ─────────────────────────────────────────────────
    // During pinch: only CSS transform on imgEl (zero DOM changes).
    // On touchend: commit scale, resize wrapper in-place (no wipe).
    let pinchStartDist  = null;
    let pinchStartScale = 1;
    let isPinching      = false;

    wrapper.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        isPinching = true;
        pinchStartDist  = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartScale = item.scale;
        e.preventDefault();
      }
    }, { passive: false });

    wrapper.addEventListener('touchmove', e => {
      if (!isPinching || e.touches.length !== 2) return;
      e.preventDefault(); e.stopPropagation();
      const dist  = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / pinchStartDist;
      const visual = clamp(pinchStartScale * factor) / pinchStartScale;
      // Visually scale just the imgEl — no wrapper resize, no DOM wipe
      imgEl.style.transform       = `scale(${visual})`;
      imgEl.style.transformOrigin = 'center center';
      scaleLabel.textContent      = Math.round(clamp(pinchStartScale * factor) * 100) + '%';
    }, { passive: false });

    wrapper.addEventListener('touchend', e => {
      if (!isPinching) return;
      if (e.touches.length > 0) return; // still one finger down
      isPinching = false;

      // Parse the visual scale we applied to the img
      const match  = imgEl.style.transform.match(/scale\(([\d.]+)\)/);
      const visual = match ? parseFloat(match[1]) : 1;
      imgEl.style.transform = '';      // clear visual transform before resize

      item.scale = clamp(parseFloat((pinchStartScale * visual).toFixed(2)));
      applyScaleInPlace();             // ← resize wrapper in-place, no DOM wipe
    }, { passive: true });

    // ── Drag to reposition ────────────────────────────────────────────
    enableDrag(wrapper, item);

    // Store live ref
    liveWrappers.push({ wrapper, imgEl, scaleLabel, item, img, cellW, cellH, col, row });
    pagePreview.appendChild(wrapper);
  });

  pageInfoEl.textContent = `${currentPage + 1} / ${totalPages}`;
  updateScalerTransform(W, H);
}


// ── Drag (GPU layer via will-change already set on wrapper) ───────────────────
function enableDrag(el, item) {
  let startMX, startMY, startL, startT, dragging = false;

  function getPos(e) {
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }

  function start(e) {
    if (e.target.closest && e.target.closest('.img-scale-controls')) return;
    if (e.touches && e.touches.length > 1) return;
    dragging = true;
    const pos = getPos(e);
    startMX = pos.x; startMY = pos.y;
    startL  = parseFloat(el.style.left) || 0;
    startT  = parseFloat(el.style.top)  || 0;
    el.style.cursor = 'grabbing';
    el.style.zIndex = '5';
  }

  function move(e) {
    if (!dragging) return;
    if (e.touches && e.touches.length > 1) { end(); return; }
    e.preventDefault();
    const pos   = getPos(e);
    const newL  = startL + pos.x - startMX;
    const newT  = startT + pos.y - startMY;
    // Direct style mutation — GPU composited, no layout triggers
    el.style.left = newL + 'px';
    el.style.top  = newT + 'px';
  }

  function end() {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = 'grab';
    el.style.zIndex = '';
    // Positions are already in PDF-space (pagePreview is 1× PDF dims)
    item.offsetX = parseFloat(el.style.left);
    item.offsetY = parseFloat(el.style.top);
  }

  el.addEventListener('mousedown',  start);
  el.addEventListener('touchstart', e => { if (e.touches.length === 1) start(e); }, { passive: false });
  el.addEventListener('mousemove',  move);
  el.addEventListener('touchmove',  move, { passive: false });
  el.addEventListener('mouseup',    end);
  el.addEventListener('mouseleave', end);
  el.addEventListener('touchend',   end, { passive: true });
  el.style.cursor = 'grab';
}


// ── Swipe between pages in the editor ─────────────────────────────────────────
let swipeStartX = null;
previewScroll.addEventListener('touchstart', e => {
  if (e.touches.length === 1) swipeStartX = e.touches[0].clientX;
}, { passive: true });
previewScroll.addEventListener('touchend', e => {
  if (swipeStartX === null) return;
  const dx = e.changedTouches[0].clientX - swipeStartX;
  swipeStartX = null;
  if (Math.abs(dx) < 60) return;
  if (dx < 0 && currentPage < totalPages - 1) { currentPage++;  loadPage(); }
  if (dx > 0 && currentPage > 0)              { currentPage--;  loadPage(); }
}, { passive: true });


// ── Edit Positions ────────────────────────────────────────────────────────────
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


// ── Canvas zoom — pure CSS, no DOM rebuild ────────────────────────────────────
zoomInBtn.addEventListener('click',  () => { zoom = Math.min(zoom + 0.25, 3);    applyCanvasZoom(); });
zoomOutBtn.addEventListener('click', () => { zoom = Math.max(zoom - 0.25, 0.25); applyCanvasZoom(); });


// ── Close modal ───────────────────────────────────────────────────────────────
function closeModal() { modal.classList.remove('open'); }
modalClose.addEventListener('click',  closeModal);
sheetBackdrop.addEventListener('click', closeModal);


// ── Generate PDF ──────────────────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) { showToast('Please select images first', 'err'); return; }

  generateBtn.disabled = true;
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
        const item     = selectedFiles[i + idx];
        const row      = Math.floor(idx / cols);
        const col      = idx % cols;
        const { w, h } = calcFit(img, cellW, cellH, item.scale);

        const x = item.offsetX !== null
          ? item.offsetX
          : col * cellW + (cellW - w) / 2;
        const y = item.offsetY !== null
          ? item.offsetY
          : row * cellH + (cellH - h) / 2;

        doc.addImage(img.src, 'JPEG', x, y, w, h);
      });
    }

    doc.save('images.pdf');
    showToast('✅ PDF saved!', 'ok');
  } catch (err) {
    console.error(err);
    showToast('❌ Error — check console', 'err');
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<span>⬇️</span> Generate PDF';
  }
});
