// DOM elements
const imagesInput     = document.getElementById('images');
const generateBtn     = document.getElementById('generate');
const modeSelect      = document.getElementById('mode');
const statusEl        = document.getElementById('status');
const previewContainer= document.getElementById('preview');
const editPositionsBtn= document.getElementById('editPositions');

const modal       = document.getElementById('modal');
const pagePreview = document.getElementById('pagePreview');
const closeBtn    = document.querySelector('.close');

const zoomInBtn   = document.getElementById('zoomIn');
const zoomOutBtn  = document.getElementById('zoomOut');
const zoomLevelEl = document.getElementById('zoomLevel');

const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfoEl  = document.getElementById('pageInfo');

let selectedFiles = [];
let currentPage   = 0;
let totalPages    = 0;
let zoom          = 1;   // canvas/page-view zoom (existing)


// ─── Grid config helper ───────────────────────────────────────────────────────
// Returns { perPage, rows, cols } for the current mode.

function getGridConfig(mode) {
  switch (mode) {
    case "grid":   return { perPage: 4, rows: 2, cols: 2 };
    case "grid6":  return { perPage: 6, rows: 3, cols: 2 };
    case "grid8":  return { perPage: 8, rows: 4, cols: 2 };
    default:       return { perPage: 1, rows: 1, cols: 1 };  // "single"
  }
}


// ─── Load image from file ─────────────────────────────────────────────────────

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}


// ─── Status ───────────────────────────────────────────────────────────────────

function updateStatus(msg) {
  statusEl.textContent = msg;
}


// ─── Preview thumbnails ───────────────────────────────────────────────────────

function renderPreview() {
  previewContainer.innerHTML = "";
  selectedFiles.forEach(item => {
    const div = document.createElement("div");
    div.className = "preview-item";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(item.file);

    const sel = document.createElement("select");
    ["portrait", "landscape"].forEach(o => {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      if (item.orientation === o) opt.selected = true;
      sel.appendChild(opt);
    });

    sel.addEventListener("change", e => {
      item.orientation = e.target.value;
      item.offsetX = null;
      item.offsetY = null;
    });

    div.appendChild(img);
    div.appendChild(sel);
    previewContainer.appendChild(div);
  });
}


// ─── Image selection ──────────────────────────────────────────────────────────

imagesInput.addEventListener("change", () => {
  selectedFiles = Array.from(imagesInput.files).map(file => ({
    file,
    orientation: "portrait",
    offsetX: null,   // PDF-space px; null = auto-center
    offsetY: null,
    scale: 1         // per-image content zoom
  }));

  renderPreview();
  editPositionsBtn.disabled = selectedFiles.length === 0;
});


// ─── Drag ─────────────────────────────────────────────────────────────────────

function enableDrag(el, item) {
  let startMouseX, startMouseY, startLeft, startTop;

  function getPos(e) {
    return e.touches
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX,            y: e.clientY };
  }

  function start(e) {
    if (e.target.closest && e.target.closest('.img-scale-controls')) return;
    e.preventDefault();
    const pos = getPos(e);
    startMouseX = pos.x;
    startMouseY = pos.y;
    startLeft = parseFloat(el.style.left) || 0;
    startTop  = parseFloat(el.style.top)  || 0;
    document.addEventListener("mousemove", move);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("mouseup",   end);
    document.addEventListener("touchend",  end);
  }

  function move(e) {
    e.preventDefault();
    const pos = getPos(e);
    el.style.left = (startLeft + pos.x - startMouseX) + "px";
    el.style.top  = (startTop  + pos.y - startMouseY) + "px";
  }

  function end() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("touchmove", move);
    document.removeEventListener("mouseup",   end);
    document.removeEventListener("touchend",  end);
    item.offsetX = parseFloat(el.style.left) / zoom;
    item.offsetY = parseFloat(el.style.top)  / zoom;
  }

  el.addEventListener("mousedown",  start);
  el.addEventListener("touchstart", start, { passive: false });
  el.style.cursor = "grab";
}


// ─── Per-image scale controls ─────────────────────────────────────────────────
// Scroll wheel, pinch-to-zoom, and +/- overlay buttons.
// item.scale is in PDF-space and used by loadPage() and PDF export.

function enableImageScale(wrapper, item, onScaleChange) {
  const STEP = 0.1;
  const MIN  = 0.2;
  const MAX  = 5;

  function clamp(v) { return Math.min(MAX, Math.max(MIN, v)); }

  // Scroll wheel
  wrapper.addEventListener("wheel", e => {
    e.preventDefault();
    e.stopPropagation();
    item.scale = clamp(parseFloat((item.scale + (e.deltaY < 0 ? STEP : -STEP)).toFixed(2)));
    onScaleChange();
  }, { passive: false });

  // Pinch to zoom
  let lastPinchDist = null;
  wrapper.addEventListener("touchmove", e => {
    if (e.touches.length !== 2) { lastPinchDist = null; return; }
    e.preventDefault();
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (lastPinchDist !== null) {
      item.scale = clamp(parseFloat((item.scale + (dist - lastPinchDist) * 0.005).toFixed(2)));
      onScaleChange();
    }
    lastPinchDist = dist;
  }, { passive: false });
  wrapper.addEventListener("touchend", () => { lastPinchDist = null; });

  // +/- overlay buttons
  const controls = document.createElement("div");
  controls.className = "img-scale-controls";
  controls.style.cssText = `
    position:absolute; bottom:6px; right:6px;
    display:flex; align-items:center; gap:3px;
    background:rgba(0,0,0,0.55); border-radius:6px;
    padding:3px 5px; z-index:10;
    pointer-events:all; user-select:none;
  `;

  const btnCss = `
    width:22px; height:22px;
    background:rgba(255,255,255,0.15); color:#fff;
    border:none; border-radius:4px;
    font-size:15px; line-height:1; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
  `;

  const minusBtn = document.createElement("button");
  minusBtn.textContent = "−";
  minusBtn.style.cssText = btnCss;

  const plusBtn = document.createElement("button");
  plusBtn.textContent = "+";
  plusBtn.style.cssText = btnCss;

  const label = document.createElement("span");
  label.style.cssText = "color:#fff; font-size:11px; min-width:36px; text-align:center;";
  label.textContent = Math.round(item.scale * 100) + "%";

  minusBtn.addEventListener("click", e => {
    e.stopPropagation();
    item.scale = clamp(parseFloat((item.scale - STEP).toFixed(2)));
    onScaleChange();
  });

  plusBtn.addEventListener("click", e => {
    e.stopPropagation();
    item.scale = clamp(parseFloat((item.scale + STEP).toFixed(2)));
    onScaleChange();
  });

  controls.appendChild(minusBtn);
  controls.appendChild(label);
  controls.appendChild(plusBtn);
  wrapper.appendChild(controls);
}


// ─── Page editor ─────────────────────────────────────────────────────────────

async function loadPage() {
  const { perPage, rows, cols } = getGridConfig(modeSelect.value);

  const startIdx = currentPage * perPage;
  const slice    = selectedFiles.slice(startIdx, startIdx + perPage);
  if (slice.length === 0) return;

  const orientation = slice[0].orientation || "portrait";
  const pageWidth   = orientation === "portrait" ? 595 : 842;
  const pageHeight  = orientation === "portrait" ? 842 : 595;

  pagePreview.style.position   = "relative";
  pagePreview.style.width      = pageWidth  * zoom + "px";
  pagePreview.style.height     = pageHeight * zoom + "px";
  pagePreview.style.overflow   = "hidden";
  pagePreview.style.background = "#fff";
  pagePreview.innerHTML        = "";

  const imgs       = await Promise.all(slice.map(i => loadImage(i.file)));
  const cellWidth  = pageWidth  / cols;
  const cellHeight = pageHeight / rows;

  imgs.forEach((img, idx) => {
    const item = slice[idx];
    const row  = Math.floor(idx / cols);
    const col  = idx % cols;

    let w = img.width;
    let h = img.height;
    const ratio = Math.min(cellWidth / w, cellHeight / h);
    w *= ratio * item.scale;
    h *= ratio * item.scale;

    let x, y;
    if (item.offsetX === null || item.offsetY === null) {
      x = col * cellWidth  + (cellWidth  - w) / 2;
      y = row * cellHeight + (cellHeight - h) / 2;
      item.offsetX = x;
      item.offsetY = y;
    } else {
      x = item.offsetX;
      y = item.offsetY;
    }

    // Wrapper holds image + scale controls overlay
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      position:absolute;
      left:${x * zoom}px; top:${y * zoom}px;
      width:${w * zoom}px; height:${h * zoom}px;
      overflow:visible;
    `;

    const imgEl = document.createElement("img");
    imgEl.src = img.src;
    imgEl.draggable = false;
    imgEl.style.cssText = "width:100%; height:100%; display:block; user-select:none; pointer-events:none;";
    wrapper.appendChild(imgEl);

    // Scale controls — reset position so image re-centers after scale change
    enableImageScale(wrapper, item, async () => {
      item.offsetX = null;
      item.offsetY = null;
      await loadPage();
    });

    enableDrag(wrapper, item);
    pagePreview.appendChild(wrapper);
  });

  pageInfoEl.textContent = `Page ${currentPage + 1} of ${totalPages}`;
}


// ─── Edit button ──────────────────────────────────────────────────────────────

editPositionsBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) { updateStatus("Select images first"); return; }

  const { perPage } = getGridConfig(modeSelect.value);
  totalPages  = Math.ceil(selectedFiles.length / perPage);
  currentPage = 0;
  zoom        = 1;
  zoomLevelEl.textContent = "100%";

  await loadPage();
  modal.style.display = "block";
});


// ─── Page navigation ──────────────────────────────────────────────────────────

prevPageBtn.onclick = async () => { if (currentPage > 0)              { currentPage--; await loadPage(); } };
nextPageBtn.onclick = async () => { if (currentPage < totalPages - 1) { currentPage++; await loadPage(); } };


// ─── Canvas zoom (page-view) ──────────────────────────────────────────────────

function updateZoom() {
  zoomLevelEl.textContent = Math.round(zoom * 100) + "%";
  loadPage();
}
zoomInBtn.onclick  = () => { zoom = Math.min(zoom + 0.25, 3);    updateZoom(); };
zoomOutBtn.onclick = () => { zoom = Math.max(zoom - 0.25, 0.25); updateZoom(); };


// ─── Close modal ──────────────────────────────────────────────────────────────

closeBtn.onclick = () => modal.style.display = "none";
window.onclick   = e  => { if (e.target === modal) modal.style.display = "none"; };


// ─── Generate PDF ─────────────────────────────────────────────────────────────

generateBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) { updateStatus("Please select images"); return; }

  try {
    updateStatus("Loading images...");
    const imgs = await Promise.all(selectedFiles.map(i => loadImage(i.file)));
    const { jsPDF } = window.jspdf;

    const { perPage, rows, cols } = getGridConfig(modeSelect.value);

    let doc;

    for (let i = 0; i < imgs.length; i += perPage) {
      const orientation = selectedFiles[i].orientation;
      if (!doc) {
        doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
      } else {
        doc.addPage("a4", orientation);
      }

      const pageWidth  = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const cellWidth  = pageWidth  / cols;
      const cellHeight = pageHeight / rows;

      imgs.slice(i, i + perPage).forEach((img, idx) => {
        const item = selectedFiles[i + idx];
        const row  = Math.floor(idx / cols);
        const col  = idx % cols;

        let w = img.width;
        let h = img.height;
        const ratio = Math.min(cellWidth / w, cellHeight / h);
        w *= ratio * item.scale;   // item.scale carries the user's zoom preference
        h *= ratio * item.scale;

        const x = item.offsetX !== null ? item.offsetX : col * cellWidth  + (cellWidth  - w) / 2;
        const y = item.offsetY !== null ? item.offsetY : row * cellHeight + (cellHeight - h) / 2;

        doc.addImage(img.src, "JPEG", x, y, w, h);
      });
    }

    doc.save("images.pdf");
    updateStatus("✅ PDF Generated!");

  } catch (err) {
    console.error(err);
    updateStatus("❌ Error generating PDF");
  }
});
