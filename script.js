const imagesInput = document.getElementById("images");
const generateBtn = document.getElementById("generate");
const modeSelect = document.getElementById("mode");
const statusEl = document.getElementById("status");
const previewContainer = document.getElementById("preview");
const editPositionsBtn = document.getElementById("editPositions");

let selectedFiles = [];

function updateStatus(msg) {
  statusEl.textContent = msg;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = function () {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

function renderPreview() {
  previewContainer.innerHTML = "";

  selectedFiles.forEach((item, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";

    const img = document.createElement("img");
    img.src = URL.createObjectURL(item.file);

    const orientation = document.createElement("select");

    ["portrait", "landscape"].forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;

      if (o === item.orientation) opt.selected = true;

      orientation.appendChild(opt);
    });

    orientation.addEventListener("change", (e) => {
      item.orientation = e.target.value;
    });

    wrapper.appendChild(img);
    wrapper.appendChild(orientation);

    previewContainer.appendChild(wrapper);
  });
}

imagesInput.addEventListener("change", () => {
  selectedFiles = Array.from(imagesInput.files).map((file) => ({
    file,
    orientation: "portrait",
    offsetX: 0.5,
    offsetY: 0.5,
    scale: 1,
  }));

  renderPreview();

  editPositionsBtn.disabled = selectedFiles.length === 0;
});

generateBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) {
    updateStatus("Please select images.");
    return;
  }

  updateStatus("Loading images...");

  try {
    const imgs = await Promise.all(selectedFiles.map((i) => loadImage(i.file)));

    const { jsPDF } = window.jspdf;

    const mode = modeSelect.value;

    let perPage = mode === "grid" ? 4 : 1;
    let rows = mode === "grid" ? 2 : 1;
    let cols = mode === "grid" ? 2 : 1;

    let doc;

    for (let i = 0; i < imgs.length; i += perPage) {
      const orientation = selectedFiles[i].orientation;

      if (!doc) {
        doc = new jsPDF({
          orientation: orientation,
          unit: "pt",
          format: "a4",
        });
      } else {
        doc.addPage("a4", orientation);
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const cellWidth = pageWidth / cols;
      const cellHeight = pageHeight / rows;

      const slice = imgs.slice(i, i + perPage);

      slice.forEach((img, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;

        let w = img.width;
        let h = img.height;

        const ratio = Math.min(cellWidth / w, cellHeight / h);

        w *= ratio;
        h *= ratio;

        const item = selectedFiles[i + idx];

        w *= item.scale;
        h *= item.scale;

        const x = col * cellWidth + item.offsetX * (cellWidth - w);
        const y = row * cellHeight + item.offsetY * (cellHeight - h);

        doc.addImage(img.src, "JPEG", x, y, w, h);
      });
    }

    updateStatus("Saving PDF...");

    doc.save("images.pdf");

    updateStatus("PDF Generated Successfully");

  } catch (err) {
    console.error(err);
    updateStatus("PDF generation failed. Check console.");
  }
});
