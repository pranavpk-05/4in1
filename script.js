// DOM elements
const imagesInput = document.getElementById('images');
const generateBtn = document.getElementById('generate');
const modeSelect = document.getElementById('mode');
const statusEl = document.getElementById('status');
const previewContainer = document.getElementById('preview');
const editPositionsBtn = document.getElementById('editPositions');

const modal = document.getElementById('modal');
const pagePreview = document.getElementById('pagePreview');
const closeBtn = document.querySelector('.close');

const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const zoomLevelEl = document.getElementById('zoomLevel');

const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfoEl = document.getElementById('pageInfo');

let selectedFiles = [];
let currentPage = 0;
let totalPages = 0;
let zoom = 1;


// Load image from file
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


// Status
function updateStatus(msg) {
  statusEl.textContent = msg;
}


// Preview thumbnails
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
      // Reset offsets when orientation changes so image re-centers
      item.offsetX = null;
      item.offsetY = null;
    });

    div.appendChild(img);
    div.appendChild(sel);
    previewContainer.appendChild(div);
  });
}


// Image selection
imagesInput.addEventListener("change", () => {
  selectedFiles = Array.from(imagesInput.files).map(file => ({
    file: file,
    orientation: "portrait",
    // null = auto-center; set to px values in PDF-space after dragging
    offsetX: null,
    offsetY: null,
    scale: 1
  }));

  renderPreview();
  editPositionsBtn.disabled = selectedFiles.length === 0;
});


// ─── Drag system ────────────────────────────────────────────────────────────
// offsetX / offsetY on item are stored in PDF-space pixels (unzoomed).
// null means "centered in cell".

function enableDrag(el, item, cellWidth, cellHeight, imgW, imgH) {
  let startMouseX, startMouseY, startLeft, startTop;

  function getPos(e) {
    return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                     : { x: e.clientX, y: e.clientY };
  }

  function start(e) {
    e.preventDefault();
    const pos = getPos(e);
    startMouseX = pos.x;
    startMouseY = pos.y;
    startLeft = parseFloat(el.style.left) || 0;
    startTop  = parseFloat(el.style.top)  || 0;

    document.addEventListener("mousemove", move);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("mouseup", end);
    document.addEventListener("touchend", end);
  }

  function move(e) {
    e.preventDefault();
    const pos = getPos(e);
    const dx = pos.x - startMouseX;
    const dy = pos.y - startMouseY;

    let newLeft = startLeft + dx;
    let newTop  = startTop  + dy;

    el.style.left = newLeft + "px";
    el.style.top  = newTop  + "px";
  }

  function end() {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("touchmove", move);
    document.removeEventListener("mouseup", end);
    document.removeEventListener("touchend", end);

    // Convert screen-space pixels back to PDF-space pixels
    item.offsetX = parseFloat(el.style.left) / zoom;
    item.offsetY = parseFloat(el.style.top)  / zoom;
  }

  el.addEventListener("mousedown", start);
  el.addEventListener("touchstart", start, { passive: false });
  el.style.cursor = "grab";
}


// ─── Page editor ─────────────────────────────────────────────────────────────

async function loadPage() {
  const mode = modeSelect.value;
  const perPage = mode === "grid" ? 4 : 1;
  const rows    = mode === "grid" ? 2 : 1;
  const cols    = mode === "grid" ? 2 : 1;

  const startIdx = currentPage * perPage;
  const slice    = selectedFiles.slice(startIdx, startIdx + perPage);

  if (slice.length === 0) return;

  const orientation = slice[0].orientation || "portrait";
  const pageWidth   = orientation === "portrait" ? 595 : 842;
  const pageHeight  = orientation === "portrait" ? 842 : 595;

  pagePreview.style.position = "relative";
  pagePreview.style.width    = pageWidth  * zoom + "px";
  pagePreview.style.height   = pageHeight * zoom + "px";
  pagePreview.style.overflow = "hidden";
  pagePreview.style.background = "#fff";
  pagePreview.innerHTML = "";

  const imgs = await Promise.all(slice.map(i => loadImage(i.file)));

  const cellWidth  = pageWidth  / cols;
  const cellHeight = pageHeight / rows;

  imgs.forEach((img, idx) => {
    const item = slice[idx];
    const row  = Math.floor(idx / cols);
    const col  = idx % cols;

    let w = img.width;
    let h = img.height;

    // Fit image inside cell
    const ratio = Math.min(cellWidth / w, cellHeight / h);
    w *= ratio * item.scale;
    h *= ratio * item.scale;

    // Use saved offset (PDF-space px) or default to centered
    const cellOriginX = col * cellWidth;
    const cellOriginY = row * cellHeight;

    let x, y;
    if (item.offsetX === null || item.offsetY === null) {
      // Center in cell
      x = cellOriginX + (cellWidth  - w) / 2;
      y = cellOriginY + (cellHeight - h) / 2;
      // Save so drag end has a starting reference
      item.offsetX = x;
      item.offsetY = y;
    } else {
      x = item.offsetX;
      y = item.offsetY;
    }

    const imgEl = document.createElement("img");
    imgEl.src = img.src;
    imgEl.draggable = false; // prevent browser native drag
    imgEl.style.position = "absolute";
    imgEl.style.left     = x * zoom + "px";
    imgEl.style.top      = y * zoom + "px";
    imgEl.style.width    = w * zoom + "px";
    imgEl.style.height   = h * zoom + "px";
    imgEl.style.userSelect = "none";

    enableDrag(imgEl, item, cellWidth, cellHeight, w, h);

    pagePreview.appendChild(imgEl);
  });

  pageInfoEl.textContent = `Page ${currentPage + 1} of ${totalPages}`;
}


// ─── Edit button ──────────────────────────────────────────────────────────────

editPositionsBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) {
    updateStatus("Select images first");
    return;
  }

  const mode    = modeSelect.value;
  const perPage = mode === "grid" ? 4 : 1;

  totalPages  = Math.ceil(selectedFiles.length / perPage);
  currentPage = 0;
  zoom        = 1;
  zoomLevelEl.textContent = "100%";

  await loadPage();
  modal.style.display = "block";
});


// ─── Page navigation ──────────────────────────────────────────────────────────

prevPageBtn.onclick = async () => {
  if (currentPage > 0) {
    currentPage--;
    await loadPage();
  }
};

nextPageBtn.onclick = async () => {
  if (currentPage < totalPages - 1) {
    currentPage++;
    await loadPage();
  }
};


// ─── Zoom ─────────────────────────────────────────────────────────────────────

function updateZoom() {
  zoomLevelEl.textContent = Math.round(zoom * 100) + "%";
  loadPage();
}

zoomInBtn.onclick = () => {
  zoom = Math.min(zoom + 0.25, 3);
  updateZoom();
};

zoomOutBtn.onclick = () => {
  zoom = Math.max(zoom - 0.25, 0.25);
  updateZoom();
};


// ─── Close modal ──────────────────────────────────────────────────────────────

closeBtn.onclick = () => modal.style.display = "none";

window.onclick = e => {
  if (e.target === modal) modal.style.display = "none";
};


// ─── Generate PDF ─────────────────────────────────────────────────────────────

generateBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) {
    updateStatus("Please select images");
    return;
  }

  try {
    updateStatus("Loading images...");

    const imgs = await Promise.all(selectedFiles.map(i => loadImage(i.file)));

    const { jsPDF } = window.jspdf;

    const mode    = modeSelect.value;
    const perPage = mode === "grid" ? 4 : 1;
    const rows    = mode === "grid" ? 2 : 1;
    const cols    = mode === "grid" ? 2 : 1;

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

      const slice = imgs.slice(i, i + perPage);

      slice.forEach((img, idx) => {
        const item = selectedFiles[i + idx];
        const row  = Math.floor(idx / cols);
        const col  = idx % cols;

        let w = img.width;
        let h = img.height;

        const ratio = Math.min(cellWidth / w, cellHeight / h);
        w *= ratio * item.scale;
        h *= ratio * item.scale;

        let x, y;
        if (item.offsetX === null || item.offsetY === null) {
          // Center in cell (fallback — should be set by loadPage already)
          x = col * cellWidth  + (cellWidth  - w) / 2;
          y = row * cellHeight + (cellHeight - h) / 2;
        } else {
          // Use the position the user dragged to
          x = item.offsetX;
          y = item.offsetY;
        }

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
