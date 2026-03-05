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

// Global state
let selectedFiles = []; // {file, orientation, offsetX, offsetY, scale}
let currentPage = 0;
let totalPages = 0;
let zoom = 1;
let imageData = [];

async function loadImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function updateStatus(msg) {
    statusEl.textContent = msg;
}

function renderPreview() {
    previewContainer.innerHTML = '';
    selectedFiles.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.draggable = true;
        div.fileItem = item; // keep reference for reordering

        const imgEl = document.createElement('img');
        imgEl.src = URL.createObjectURL(item.file);
        imgEl.onload = () => URL.revokeObjectURL(imgEl.src);
        imgEl.style.left = (item.offsetX * 100) + '%';
        imgEl.style.top = (item.offsetY * 100) + '%';
        imgEl.style.transform = 'translate(-50%, -50%)';

        // Drag logic for reordering
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        imgEl.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseFloat(imgEl.style.left);
            startTop = parseFloat(imgEl.style.top);
            imgEl.style.transform = 'none'; // remove transform during drag
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const rect = div.getBoundingClientRect();
            let newLeft = startLeft + (dx / rect.width) * 100;
            let newTop = startTop + (dy / rect.height) * 100;
            newLeft = Math.max(0, Math.min(100, newLeft));
            newTop = Math.max(0, Math.min(100, newTop));
            imgEl.style.left = newLeft + '%';
            imgEl.style.top = newTop + '%';
            item.offsetX = newLeft / 100;
            item.offsetY = newTop / 100;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        const sel = document.createElement('select');
        ['portrait', 'landscape'].forEach(o => {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o.charAt(0).toUpperCase() + o.slice(1);
            if (item.orientation === o) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', e => {
            item.orientation = e.target.value;
        });

        div.appendChild(imgEl);
        div.appendChild(sel);
        previewContainer.appendChild(div);
    });
}

function syncOrderFromDOM() {
    selectedFiles = Array.from(previewContainer.children).map(el => el.fileItem);
}

// drag & drop helpers
let dragEl = null;

previewContainer.addEventListener('dragstart', e => {
    if (e.target.classList.contains('preview-item')) {
        dragEl = e.target;
        e.target.classList.add('dragging');
    }
});

previewContainer.addEventListener('dragend', e => {
    if (dragEl) {
        dragEl.classList.remove('dragging');
        dragEl = null;
        syncOrderFromDOM();
    }
});

previewContainer.addEventListener('dragover', e => {
    e.preventDefault();
    const afterEl = getDragAfterElement(previewContainer, e.clientY);
    if (!dragEl) return;
    if (afterEl == null) {
        previewContainer.appendChild(dragEl);
    } else {
        previewContainer.insertBefore(dragEl, afterEl);
    }
});

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.preview-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function loadPage() {
    const mode = modeSelect.value;
    let perPage, rows, cols;
    if (mode === 'normal') {
        perPage = 1;
        rows = 1;
        cols = 1;
    } else {
        perPage = 4;
        rows = 2;
        cols = 2;
    }

    const startIdx = currentPage * perPage;
    const slice = selectedFiles.slice(startIdx, startIdx + perPage);

    const orientation = slice[0] ? slice[0].orientation : 'portrait';
    const pageWidth = orientation === 'portrait' ? 595 : 842;
    const pageHeight = orientation === 'portrait' ? 842 : 595;

    pagePreview.style.width = (pageWidth * zoom) + 'px';
    pagePreview.style.height = (pageHeight * zoom) + 'px';
    pagePreview.innerHTML = '';

    const imgs = await Promise.all(slice.map(item => loadImage(item.file)));

    const cellWidth = pageWidth / cols;
    const cellHeight = pageHeight / rows;

    imageData = []; // reset for this page

    const updateImageSize = (imgEl, item, fittedW, fittedH, zoom, cellWidth, cellHeight) => {
        const scaledW = fittedW * (item.scale || 1);
        const scaledH = fittedH * (item.scale || 1);
        const col = parseInt(imgEl.dataset.col);
        const row = parseInt(imgEl.dataset.row);
        const x = col * cellWidth + item.offsetX * (cellWidth - scaledW);
        const y = row * cellHeight + item.offsetY * (cellHeight - scaledH);
        imgEl.style.left = (x * zoom) + 'px';
        imgEl.style.top = (y * zoom) + 'px';
        imgEl.style.width = (scaledW * zoom) + 'px';
        imgEl.style.height = (scaledH * zoom) + 'px';
        imgEl.dataset.w = scaledW;
        imgEl.dataset.h = scaledH;
    };

    imgs.forEach((img, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;

        let fittedW = img.width;
        let fittedH = img.height;
        const ratio = Math.min(cellWidth / fittedW, cellHeight / fittedH);
        fittedW *= ratio;
        fittedH *= ratio;

        const item = slice[idx];
        const scaledW = fittedW * (item.scale || 1);
        const scaledH = fittedH * (item.scale || 1);

        const x = col * cellWidth + item.offsetX * (cellWidth - scaledW);
        const y = row * cellHeight + item.offsetY * (cellHeight - scaledH);

        const imgEl = document.createElement('img');
        imgEl.src = img.src;
        imgEl.style.width = (scaledW * zoom) + 'px';
        imgEl.style.height = (scaledH * zoom) + 'px';
        imgEl.style.left = (x * zoom) + 'px';
        imgEl.style.top = (y * zoom) + 'px';
        imgEl.style.position = 'absolute';
        imgEl.dataset.w = scaledW;
        imgEl.dataset.h = scaledH;
        imgEl.dataset.col = col;
        imgEl.dataset.row = row;

        const zoomInBtn = document.createElement('button');
        zoomInBtn.textContent = '+';
        zoomInBtn.style.position = 'absolute';
        zoomInBtn.style.top = '5px';
        zoomInBtn.style.right = '5px';
        zoomInBtn.style.width = '20px';
        zoomInBtn.style.height = '20px';
        zoomInBtn.style.fontSize = '12px';
        zoomInBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            item.scale = Math.min((item.scale || 1) + 0.1, 2);
            updateImageSize(imgEl, item, fittedW, fittedH, zoom, cellWidth, cellHeight);
        });

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.textContent = '-';
        zoomOutBtn.style.position = 'absolute';
        zoomOutBtn.style.top = '5px';
        zoomOutBtn.style.right = '30px';
        zoomOutBtn.style.width = '20px';
        zoomOutBtn.style.height = '20px';
        zoomOutBtn.style.fontSize = '12px';
        zoomOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            item.scale = Math.max((item.scale || 1) - 0.1, 0.5);
            updateImageSize(imgEl, item, fittedW, fittedH, zoom, cellWidth, cellHeight);
        });

        imgEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                item.scale = Math.min((item.scale || 1) + 0.1, 2);
            } else {
                item.scale = Math.max((item.scale || 1) - 0.1, 0.5);
            }
            updateImageSize(imgEl, item, fittedW, fittedH, zoom, cellWidth, cellHeight);
        });

        imgEl.appendChild(zoomOutBtn);
        imgEl.appendChild(zoomInBtn);

        // drag logic
        let isDragging = false;
        let startX, startY;

        imgEl.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.clientX - parseFloat(imgEl.style.left);
            startY = e.clientY - parseFloat(imgEl.style.top);
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            let newX = e.clientX - startX;
            let newY = e.clientY - startY;
            const w = parseFloat(imgEl.dataset.w);
            const h = parseFloat(imgEl.dataset.h);
            const col = parseInt(imgEl.dataset.col);
            const row = parseInt(imgEl.dataset.row);
            const minX = col * cellWidth * zoom;
            const maxX = (col * cellWidth + cellWidth - w) * zoom;
            const minY = row * cellHeight * zoom;
            const maxY = (row * cellHeight + cellHeight - h) * zoom;
            newX = Math.max(minX, Math.min(maxX, newX));
            newY = Math.max(minY, Math.min(maxY, newY));
            imgEl.style.left = newX + 'px';
            imgEl.style.top = newY + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                const finalX = parseFloat(imgEl.style.left);
                const finalY = parseFloat(imgEl.style.top);
                const w = parseFloat(imgEl.dataset.w);
                const h = parseFloat(imgEl.dataset.h);
                const col = parseInt(imgEl.dataset.col);
                const row = parseInt(imgEl.dataset.row);
                const item = slice[idx];
                item.offsetX = (finalX / zoom - col * cellWidth) / (cellWidth - w);
                item.offsetY = (finalY / zoom - row * cellHeight) / (cellHeight - h);
                isDragging = false;
            }
        });

        pagePreview.appendChild(imgEl);
        imageData.push({fittedW, fittedH, col, row});
    });

    pageInfoEl.textContent = `Page ${currentPage + 1} of ${totalPages}`;
}

const updateZoom = () => {
    zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
    loadPage();
};

prevPageBtn.addEventListener('click', async () => {
    if (currentPage > 0) {
        currentPage--;
        await loadPage();
    }
});

nextPageBtn.addEventListener('click', async () => {
    if (currentPage < totalPages - 1) {
        currentPage++;
        await loadPage();
    }
});

zoomInBtn.addEventListener('click', () => {
    zoom = Math.min(zoom + 0.25, 3);
    updateZoom();
});

zoomOutBtn.addEventListener('click', () => {
    zoom = Math.max(zoom - 0.25, 0.5);
    updateZoom();
});

closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', e => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

imagesInput.addEventListener('change', () => {
    selectedFiles = Array.from(imagesInput.files).map(f => ({ file: f, orientation: 'portrait', offsetX: 0.5, offsetY: 0.5, scale: 1 }));
    renderPreview();
    editPositionsBtn.disabled = selectedFiles.length === 0;
});

editPositionsBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
        updateStatus('Please select at least one image.');
        return;
    }

    const mode = modeSelect.value;
    let perPage;
    if (mode === 'normal') {
        perPage = 1;
    } else {
        perPage = 4;
    }

    totalPages = Math.ceil(selectedFiles.length / perPage);
    currentPage = 0;
    zoom = 1;

    await loadPage();
    updateZoom(); // initial zoom level display
    modal.style.display = 'block';
});

generateBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
        updateStatus('Please select at least one image.');
        return;
    }

    const mode = modeSelect.value;
    let perPage, rows, cols;
    if (mode === 'normal') {
        perPage = 1;
        rows = 1;
        cols = 1;
    } else {
        perPage = 4;
        rows = 2;
        cols = 2;
    }

    updateStatus('Loading images...');

    try {
        const imgs = await Promise.all(selectedFiles.map(item => loadImage(item.file)));
        updateStatus('Generating PDF...');

        const { jsPDF } = window.jspdf;
        let doc = null;

        for (let i = 0; i < imgs.length; i += perPage) {
            const pageOrientation = selectedFiles[i].orientation;
            if (i === 0) {
                doc = new jsPDF({ orientation: pageOrientation });
            } else {
                doc.addPage({ orientation: pageOrientation });
            }

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            const slice = imgs.slice(i, i + perPage);
            const cellWidth = pageWidth / cols;
            const cellHeight = pageHeight / rows;

            slice.forEach((img, idx) => {
                const row = Math.floor(idx / cols);
                const col = idx % cols;

                let w = img.width;
                let h = img.height;
                const ratio = Math.min(cellWidth / w, cellHeight / h);
                w *= ratio;
                h *= ratio;

                const item = selectedFiles[i + idx];
                w *= (item.scale || 1);
                h *= (item.scale || 1);

                if (cellWidth - w === 0) item.offsetX = 0;
                if (cellHeight - h === 0) item.offsetY = 0;
                const x = col * cellWidth + item.offsetX * (cellWidth - w);
                const y = row * cellHeight + item.offsetY * (cellHeight - h);

                const format = img.src.split(';')[0].split('/')[1].toUpperCase();
                doc.addImage(img.src, format, x, y, w, h);
            });
        }

        doc.save('images.pdf');
        updateStatus('Download ready.');
    } catch (err) {
        console.error(err);
        updateStatus('Error generating PDF. See console for details.');
    }
});
