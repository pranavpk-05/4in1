```javascript
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
function loadImage(file){
return new Promise((resolve,reject)=>{
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
function updateStatus(msg){
statusEl.textContent = msg;
}


// Preview thumbnails
function renderPreview(){

previewContainer.innerHTML="";

selectedFiles.forEach(item=>{

const div=document.createElement("div");
div.className="preview-item";

const img=document.createElement("img");
img.src=URL.createObjectURL(item.file);

const sel=document.createElement("select");

["portrait","landscape"].forEach(o=>{
const opt=document.createElement("option");
opt.value=o;
opt.textContent=o;

if(item.orientation===o) opt.selected=true;

sel.appendChild(opt);
});

sel.addEventListener("change",e=>{
item.orientation=e.target.value;
});

div.appendChild(img);
div.appendChild(sel);

previewContainer.appendChild(div);

});
}


// Image selection
imagesInput.addEventListener("change",()=>{

selectedFiles = Array.from(imagesInput.files).map(file=>({
file:file,
orientation:"portrait",
offsetX:0.5,
offsetY:0.5,
scale:1
}));

renderPreview();

editPositionsBtn.disabled = selectedFiles.length===0;

});


// Drag system
function enableDrag(el,item,cellWidth,cellHeight){

let startX,startY;

function start(e){

const evt = e.touches ? e.touches[0] : e;

startX = evt.clientX - parseFloat(el.style.left);
startY = evt.clientY - parseFloat(el.style.top);

document.addEventListener("mousemove",move);
document.addEventListener("touchmove",move);

document.addEventListener("mouseup",end);
document.addEventListener("touchend",end);

}

function move(e){

const evt = e.touches ? e.touches[0] : e;

let x = evt.clientX - startX;
let y = evt.clientY - startY;

el.style.left = x + "px";
el.style.top = y + "px";

}

function end(){

document.removeEventListener("mousemove",move);
document.removeEventListener("touchmove",move);

document.removeEventListener("mouseup",end);
document.removeEventListener("touchend",end);

const finalX=parseFloat(el.style.left);
const finalY=parseFloat(el.style.top);

item.offsetX = finalX / cellWidth;
item.offsetY = finalY / cellHeight;

}

el.addEventListener("mousedown",start);
el.addEventListener("touchstart",start);

}


// Load page editor
async function loadPage(){

const mode = modeSelect.value;

let perPage = mode==="grid"?4:1;
let rows = mode==="grid"?2:1;
let cols = mode==="grid"?2:1;

const startIdx=currentPage*perPage;
const slice = selectedFiles.slice(startIdx,startIdx+perPage);

const orientation = slice[0]?.orientation || "portrait";

const pageWidth = orientation==="portrait"?595:842;
const pageHeight = orientation==="portrait"?842:595;

pagePreview.style.width = pageWidth*zoom+"px";
pagePreview.style.height = pageHeight*zoom+"px";

pagePreview.innerHTML="";

const imgs = await Promise.all(slice.map(i=>loadImage(i.file)));

const cellWidth = pageWidth/cols;
const cellHeight = pageHeight/rows;

imgs.forEach((img,idx)=>{

const row=Math.floor(idx/cols);
const col=idx%cols;

let w=img.width;
let h=img.height;

const ratio=Math.min(cellWidth/w,cellHeight/h);

w*=ratio;
h*=ratio;

const item=slice[idx];

w*=item.scale;
h*=item.scale;

const x = col*cellWidth + item.offsetX*(cellWidth-w);
const y = row*cellHeight + item.offsetY*(cellHeight-h);

const imgEl=document.createElement("img");

imgEl.src=img.src;

imgEl.style.position="absolute";
imgEl.style.left=x*zoom+"px";
imgEl.style.top=y*zoom+"px";

imgEl.style.width=w*zoom+"px";
imgEl.style.height=h*zoom+"px";

enableDrag(imgEl,item,cellWidth,cellHeight);

pagePreview.appendChild(imgEl);

});

pageInfoEl.textContent=`Page ${currentPage+1} of ${totalPages}`;

}


// Edit button
editPositionsBtn.addEventListener("click",async()=>{

if(selectedFiles.length===0){
updateStatus("Select images first");
return;
}

const mode=modeSelect.value;
const perPage = mode==="grid"?4:1;

totalPages = Math.ceil(selectedFiles.length/perPage);

currentPage=0;
zoom=1;

await loadPage();

modal.style.display="block";

});


// Page navigation
prevPageBtn.onclick=async()=>{

if(currentPage>0){
currentPage--;
await loadPage();
}

};

nextPageBtn.onclick=async()=>{

if(currentPage<totalPages-1){
currentPage++;
await loadPage();
}

};


// Zoom
function updateZoom(){

zoomLevelEl.textContent=Math.round(zoom*100)+"%";

loadPage();

}

zoomInBtn.onclick=()=>{

zoom=Math.min(zoom+0.25,3);

updateZoom();

};

zoomOutBtn.onclick=()=>{

zoom=Math.max(zoom-0.25,0.5);

updateZoom();

};


// Close modal
closeBtn.onclick=()=>modal.style.display="none";

window.onclick=e=>{
if(e.target===modal){
modal.style.display="none";
}
};


// Generate PDF
generateBtn.addEventListener("click",async()=>{

if(selectedFiles.length===0){
updateStatus("Please select images");
return;
}

try{

updateStatus("Loading images...");

const imgs = await Promise.all(selectedFiles.map(i=>loadImage(i.file)));

const {jsPDF}=window.jspdf;

const mode = modeSelect.value;

let perPage = mode==="grid"?4:1;
let rows = mode==="grid"?2:1;
let cols = mode==="grid"?2:1;

let doc;

for(let i=0;i<imgs.length;i+=perPage){

const orientation = selectedFiles[i].orientation;

if(!doc){

doc = new jsPDF({
orientation:orientation,
unit:"pt",
format:"a4"
});

}else{

doc.addPage("a4",orientation);

}

const pageWidth=doc.internal.pageSize.getWidth();
const pageHeight=doc.internal.pageSize.getHeight();

const cellWidth=pageWidth/cols;
const cellHeight=pageHeight/rows;

const slice=imgs.slice(i,i+perPage);

slice.forEach((img,idx)=>{

const row=Math.floor(idx/cols);
const col=idx%cols;

let w=img.width;
let h=img.height;

const ratio=Math.min(cellWidth/w,cellHeight/h);

w*=ratio;
h*=ratio;

const item=selectedFiles[i+idx];

w*=item.scale;
h*=item.scale;

const x=col*cellWidth + item.offsetX*(cellWidth-w);
const y=row*cellHeight + item.offsetY*(cellHeight-h);

doc.addImage(img.src,"JPEG",x,y,w,h);

});

}

doc.save("images.pdf");

updateStatus("PDF Generated");

}catch(err){

console.error(err);

updateStatus("Error generating PDF");

}

});
```
