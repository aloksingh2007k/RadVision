/**
 * RadVision Clinical Medical Radiography Workstation Controller
 * Integrates: 16-bit DICOM Parser, WW/WL Windowing, Pure JS Enhancement Engine,
 * Calibrated Anatomical Measurements, CADe Triage Heatmap, & Clinical Reporting.
 */

const state = {
  currentSampleId: "chest_pa_real_1",
  currentPresetId: "pulmonary_chest",
  currentImageSource: "/static/samples/chest_pa_real_1.jpg",
  isDicom: false,
  dicomMeta: null,
  rawPixels: null, // Float32Array (from DICOM) or Uint8Array (from standard image)
  baseGray8: null, // Windowed 8-bit grayscale before enhancement
  imgWidth: 512,
  imgHeight: 512,
  windowCenter: 128,
  windowWidth: 255,
  invertPhotometric: false,
  originalImageSrc: "",
  enhancedImageSrc: "",
  triageResult: null,
  showTriage: false,
  triageOpacity: 0.55,
  viewMode: "split",
  splitPosition: 50,
  zoomLevel: 1.0,
  panX: 0,
  panY: 0,
  isDraggingPan: false,
  isDraggingSplit: false,
  isDrawingTool: false,
  metrics: null,
  batchFiles: [],
  customParams: { ...CLINICAL_PRESETS[0].pipeline }
};

const elements = {
  tabWorkstation: document.getElementById("tabWorkstation"),
  tabBatch: document.getElementById("tabBatch"),
  viewWorkstation: document.getElementById("viewWorkstation"),
  viewBatch: document.getElementById("viewBatch"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  sampleList: document.getElementById("sampleList"),
  presetContainer: document.getElementById("presetContainer"),
  viewerStage: document.getElementById("viewerStage"),
  compareContainer: document.getElementById("compareContainer"),
  compareWrap: document.getElementById("compareWrap"),
  dualContainer: document.getElementById("dualContainer"),
  imgOriginal: document.getElementById("imgOriginal"),
  imgEnhanced: document.getElementById("imgEnhanced"),
  imgDualOrig: document.getElementById("imgDualOrig"),
  imgDualEnh: document.getElementById("imgDualEnh"),
  triageHeatmapImg: document.getElementById("triageHeatmapImg"),
  annotationCanvas: document.getElementById("annotationCanvas"),
  overlayLayer: document.getElementById("overlayLayer"),
  splitHandle: document.getElementById("splitHandle"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText"),

  // HUD
  hudModality: document.getElementById("hudModality"),
  hudBodyPart: document.getElementById("hudBodyPart"),
  hudWlWw: document.getElementById("hudWlWw"),
  hudSpacing: document.getElementById("hudSpacing"),
  bitDepthBadge: document.getElementById("bitDepthBadge"),

  // View & Actions
  btnModeSplit: document.getElementById("btnModeSplit"),
  btnModeDual: document.getElementById("btnModeDual"),
  btnModeEnh: document.getElementById("btnModeEnh"),
  btnZoomIn: document.getElementById("btnZoomIn"),
  btnZoomOut: document.getElementById("btnZoomOut"),
  btnZoomReset: document.getElementById("btnZoomReset"),
  btnDownload: document.getElementById("btnDownload"),
  btnClinicalReport: document.getElementById("btnClinicalReport"),

  // Clinical Measurement Tools
  toolNone: document.getElementById("toolNone"),
  toolRuler: document.getElementById("toolRuler"),
  toolAngle: document.getElementById("toolAngle"),
  toolCtr: document.getElementById("toolCtr"),
  toolRoi: document.getElementById("toolRoi"),
  btnInvert: document.getElementById("btnInvert"),
  btnClearTools: document.getElementById("btnClearTools"),

  // Metrics & Histogram
  valPsnr: document.getElementById("valPsnr"),
  valSsim: document.getElementById("valSsim"),
  valCii: document.getElementById("valCii"),
  valEntropy: document.getElementById("valEntropy"),
  histCanvas: document.getElementById("histCanvas"),

  // WW/WL & Triage
  sliderWl: document.getElementById("sliderWl"),
  valWl: document.getElementById("valWl"),
  sliderWw: document.getElementById("sliderWw"),
  valWw: document.getElementById("valWw"),
  toggleTriage: document.getElementById("toggleTriage"),
  sliderTriageOpacity: document.getElementById("sliderTriageOpacity"),
  valTriageOpacity: document.getElementById("valTriageOpacity"),
  valTriageAsym: document.getElementById("valTriageAsym"),
  valTriageHotspots: document.getElementById("valTriageHotspots"),
  triageSummary: document.getElementById("triageSummary"),

  // Custom Studio Controls
  selectDenoise: document.getElementById("selectDenoise"),
  selectContrast: document.getElementById("selectContrast"),
  sliderClaheClip: document.getElementById("sliderClaheClip"),
  valClaheClip: document.getElementById("valClaheClip"),
  sliderGamma: document.getElementById("sliderGamma"),
  valGamma: document.getElementById("valGamma"),
  selectSharpen: document.getElementById("selectSharpen"),
  sliderSharpenStrength: document.getElementById("sliderSharpenStrength"),
  valSharpenStrength: document.getElementById("valSharpenStrength"),
  selectColormap: document.getElementById("selectColormap"),
  btnApplyCustom: document.getElementById("btnApplyCustom"),

  // Batch
  batchDropzone: document.getElementById("batchDropzone"),
  batchFileInput: document.getElementById("batchFileInput"),
  batchTableBody: document.getElementById("batchTableBody"),
  btnLoadSampleCohort: document.getElementById("btnLoadSampleCohort"),
  btnProcessBatch: document.getElementById("btnProcessBatch"),
  batchCountPill: document.getElementById("batchCountPill")
};

function loadImageToCanvas(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      const maxDim = 1024;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ imageData: ctx.getImageData(0, 0, w, h), width: w, height: h });
    };
    img.onerror = () => reject(new Error("Failed to load radiograph image."));
    img.src = src;
  });
}

function imageDataToDataURL(imageData) {
  const c = document.createElement("canvas");
  c.width = imageData.width;
  c.height = imageData.height;
  c.getContext("2d").putImageData(imageData, 0, 0);
  return c.toDataURL("image/png");
}

function imageDataToBlob(imageData) {
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = imageData.width;
    c.height = imageData.height;
    c.getContext("2d").putImageData(imageData, 0, 0);
    c.toBlob((blob) => resolve(blob), "image/png");
  });
}

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
  renderSampleList();
  renderPresetGrid();
  syncControlsFromParams(state.customParams);
  loadStandardImageAndProcess(state.currentImageSource, "DX", "CHEST");
});

function initEventListeners() {
  elements.tabWorkstation.addEventListener("click", () => switchNavTab("workstation"));
  elements.tabBatch.addEventListener("click", () => switchNavTab("batch"));

  // Single Scan Upload (supports .dcm DICOM & standard images)
  elements.dropzone.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) handleUserFileUpload(e.target.files[0]);
  });
  elements.dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    elements.dropzone.classList.add("dragover");
  });
  elements.dropzone.addEventListener("dragleave", () => elements.dropzone.classList.remove("dragover"));
  elements.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    elements.dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleUserFileUpload(e.dataTransfer.files[0]);
  });

  // Split Screen Slider
  elements.splitHandle.addEventListener("mousedown", () => {
    state.isDraggingSplit = true;
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", (e) => {
    if (!state.isDraggingSplit) return;
    const rect = elements.compareContainer.getBoundingClientRect();
    updateSplitPosition(e.clientX - rect.left, rect.width);
  });
  window.addEventListener("mouseup", () => {
    state.isDraggingSplit = false;
    document.body.style.userSelect = "";
  });

  // Touch support for split slider
  elements.splitHandle.addEventListener("touchstart", () => { state.isDraggingSplit = true; });
  window.addEventListener("touchmove", (e) => {
    if (state.isDraggingSplit && e.touches[0]) {
      const rect = elements.compareContainer.getBoundingClientRect();
      updateSplitPosition(e.touches[0].clientX - rect.left, rect.width);
    }
  });
  window.addEventListener("touchend", () => { state.isDraggingSplit = false; });

  // View Modes & Zoom
  elements.btnModeSplit.addEventListener("click", () => setViewMode("split"));
  elements.btnModeDual.addEventListener("click", () => setViewMode("dual"));
  elements.btnModeEnh.addEventListener("click", () => setViewMode("enhanced"));

  elements.btnZoomIn.addEventListener("click", () => changeZoom(0.2));
  elements.btnZoomOut.addEventListener("click", () => changeZoom(-0.2));
  elements.btnZoomReset.addEventListener("click", resetZoom);

  elements.viewerStage.addEventListener("mousedown", (e) => {
    if (AnnotationTools.getTool() === "none" && state.zoomLevel > 1.0 && e.target !== elements.splitHandle && !elements.splitHandle.contains(e.target)) {
      state.isDraggingPan = true;
      state.startX = e.clientX - state.panX;
      state.startY = e.clientY - state.panY;
      elements.viewerStage.style.cursor = "grabbing";
    }
  });
  window.addEventListener("mousemove", (e) => {
    if (state.isDraggingPan) {
      state.panX = e.clientX - state.startX;
      state.panY = e.clientY - state.startY;
      applyTransform();
    }
  });
  window.addEventListener("mouseup", () => {
    if (state.isDraggingPan) {
      state.isDraggingPan = false;
      elements.viewerStage.style.cursor = state.zoomLevel > 1.0 ? "grab" : "default";
    }
  });
  elements.viewerStage.addEventListener("wheel", (e) => {
    e.preventDefault();
    changeZoom(e.deltaY < 0 ? 0.15 : -0.15);
  }, { passive: false });

  // Clinical Measurement Tools
  elements.toolNone.addEventListener("click", () => selectClinicalTool("none"));
  elements.toolRuler.addEventListener("click", () => selectClinicalTool("ruler"));
  elements.toolAngle.addEventListener("click", () => selectClinicalTool("angle"));
  elements.toolCtr.addEventListener("click", () => selectClinicalTool("ctr"));
  elements.toolRoi.addEventListener("click", () => selectClinicalTool("roi"));
  elements.btnClearTools.addEventListener("click", () => {
    AnnotationTools.clearAll();
    redrawAnnotations();
  });
  elements.btnInvert.addEventListener("click", () => {
    state.invertPhotometric = !state.invertPhotometric;
    elements.btnInvert.classList.toggle("active", state.invertPhotometric);
    recomputeFromRawPixels();
  });

  // Annotation Canvas Pointer Events
  elements.annotationCanvas.addEventListener("mousedown", (e) => {
    if (AnnotationTools.getTool() === "none") return;
    const pt = getNormalizedPoint(e);
    state.isDrawingTool = true;
    AnnotationTools.handlePointerDown(pt, state.imgWidth, state.imgHeight);
    redrawAnnotations();
  });
  elements.annotationCanvas.addEventListener("mousemove", (e) => {
    if (!state.isDrawingTool) return;
    const pt = getNormalizedPoint(e);
    if (AnnotationTools.handlePointerMove(pt)) {
      redrawAnnotations();
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (!state.isDrawingTool) return;
    state.isDrawingTool = false;
    const pt = getNormalizedPoint(e);
    AnnotationTools.handlePointerUp(pt, state.baseGray8, state.imgWidth, state.imgHeight);
    redrawAnnotations();
  });

  // WW / WL Sliders
  elements.sliderWl.addEventListener("input", (e) => {
    state.windowCenter = parseFloat(e.target.value);
    elements.valWl.textContent = Math.round(state.windowCenter);
    updateHud();
  });
  elements.sliderWl.addEventListener("change", () => recomputeFromRawPixels());

  elements.sliderWw.addEventListener("input", (e) => {
    state.windowWidth = parseFloat(e.target.value);
    elements.valWw.textContent = Math.round(state.windowWidth);
    updateHud();
  });
  elements.sliderWw.addEventListener("change", () => recomputeFromRawPixels());

  // CADe Triage Controls
  elements.toggleTriage.addEventListener("change", (e) => {
    state.showTriage = e.target.checked;
    elements.triageHeatmapImg.style.opacity = state.showTriage ? state.triageOpacity : 0;
  });
  elements.sliderTriageOpacity.addEventListener("input", (e) => {
    const val = parseInt(e.target.value, 10);
    state.triageOpacity = val / 100;
    elements.valTriageOpacity.textContent = `${val}%`;
    if (state.showTriage) {
      elements.triageHeatmapImg.style.opacity = state.triageOpacity;
    }
  });

  // Exports
  elements.btnDownload.addEventListener("click", downloadEnhancedSnapshot);
  elements.btnClinicalReport.addEventListener("click", generateClinicalReport);

  // Studio Controls
  elements.sliderClaheClip.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    elements.valClaheClip.textContent = v.toFixed(1);
    state.customParams.clahe_clip = v;
  });
  elements.sliderGamma.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    elements.valGamma.textContent = v.toFixed(2);
    state.customParams.gamma = v;
  });
  elements.sliderSharpenStrength.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    elements.valSharpenStrength.textContent = v.toFixed(1);
    state.customParams.unsharp_strength = v;
    state.customParams.laplacian_strength = v * 0.4;
  });
  elements.selectDenoise.addEventListener("change", (e) => { state.customParams.denoise_method = e.target.value; });
  elements.selectContrast.addEventListener("change", (e) => { state.customParams.contrast_method = e.target.value; });
  elements.selectSharpen.addEventListener("change", (e) => { state.customParams.sharpen_method = e.target.value; });
  elements.selectColormap.addEventListener("change", (e) => { state.customParams.colormap = e.target.value; });

  elements.btnApplyCustom.addEventListener("click", () => {
    state.currentPresetId = "custom";
    document.querySelectorAll(".preset-card").forEach(el => el.classList.remove("active"));
    recomputeFromRawPixels();
  });

  // Batch Cohort
  elements.batchDropzone.addEventListener("click", () => elements.batchFileInput.click());
  elements.batchDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    elements.batchDropzone.classList.add("dragover");
  });
  elements.batchDropzone.addEventListener("dragleave", () => elements.batchDropzone.classList.remove("dragover"));
  elements.batchDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    elements.batchDropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) loadBatchFiles(Array.from(e.dataTransfer.files));
  });
  elements.batchFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) loadBatchFiles(Array.from(e.target.files));
  });
  if (elements.btnLoadSampleCohort) {
    elements.btnLoadSampleCohort.addEventListener("click", loadBuiltInSampleCohort);
  }
  elements.btnProcessBatch.addEventListener("click", processBatchCohort);
}

function getNormalizedPoint(e) {
  const rect = elements.annotationCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)))
  };
}

function selectClinicalTool(tool) {
  AnnotationTools.setTool(tool);
  [elements.toolNone, elements.toolRuler, elements.toolAngle, elements.toolCtr, elements.toolRoi].forEach(b => b.classList.remove("active"));
  const map = { none: elements.toolNone, ruler: elements.toolRuler, angle: elements.toolAngle, ctr: elements.toolCtr, roi: elements.toolRoi };
  if (map[tool]) map[tool].classList.add("active");

  elements.annotationCanvas.classList.toggle("interactive", tool !== "none");
}

function redrawAnnotations() {
  const canvas = elements.annotationCanvas;
  const rect = elements.compareWrap.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    AnnotationTools.render(ctx, canvas.width, canvas.height, state.imgWidth, state.imgHeight, state.baseGray8);
  }
}

function switchNavTab(tab) {
  if (tab === "workstation") {
    elements.tabWorkstation.classList.add("active");
    elements.tabBatch.classList.remove("active");
    elements.viewWorkstation.style.display = "grid";
    elements.viewBatch.classList.remove("active");
  } else {
    elements.tabBatch.classList.add("active");
    elements.tabWorkstation.classList.remove("active");
    elements.viewWorkstation.style.display = "none";
    elements.viewBatch.classList.add("active");
  }
}

function renderSampleList() {
  elements.sampleList.innerHTML = "";
  SAMPLE_XRAYS.forEach(sample => {
    const div = document.createElement("div");
    div.className = `sample-item ${sample.id === state.currentSampleId ? "active" : ""}`;
    div.innerHTML = `
      <img src="${sample.url}" alt="${sample.name}" class="sample-thumb" />
      <div class="sample-info">
        <div class="sample-name">${sample.name}</div>
        <div class="sample-desc">${sample.condition}</div>
      </div>
      <span class="badge-tag">${sample.type}</span>
    `;
    div.addEventListener("click", () => {
      document.querySelectorAll(".sample-item").forEach(s => s.classList.remove("active"));
      div.classList.add("active");
      state.currentSampleId = sample.id;
      state.currentImageSource = sample.url;
      AnnotationTools.clearAll();
      if (sample.recommended_preset) {
        selectPreset(sample.recommended_preset, false);
      }
      loadStandardImageAndProcess(sample.url, "DX", sample.type.toUpperCase());
    });
    elements.sampleList.appendChild(div);
  });
}

function renderPresetGrid() {
  elements.presetContainer.innerHTML = "";
  CLINICAL_PRESETS.forEach(p => {
    const card = document.createElement("div");
    card.className = `preset-card ${p.id === state.currentPresetId ? "active" : ""}`;
    card.id = `preset-${p.id}`;
    card.innerHTML = `
      <div class="preset-top">
        <div class="preset-label">
          <i class="fa-solid ${p.icon || 'fa-sliders'}"></i>
          <span>${p.name}</span>
        </div>
        <span class="preset-tag">${p.tag}</span>
      </div>
      <div class="preset-desc">${p.description}</div>
    `;
    card.addEventListener("click", () => selectPreset(p.id, true));
    elements.presetContainer.appendChild(card);
  });
}

function syncControlsFromParams(params) {
  elements.selectDenoise.value = params.denoise_method || "none";
  elements.selectContrast.value = params.contrast_method || "clahe";
  elements.sliderClaheClip.value = params.clahe_clip || 2.5;
  elements.valClaheClip.textContent = (params.clahe_clip || 2.5).toFixed(1);
  elements.sliderGamma.value = params.gamma || 1.0;
  elements.valGamma.textContent = (params.gamma || 1.0).toFixed(2);
  elements.selectSharpen.value = params.sharpen_method || "none";
  const strVal = params.unsharp_strength || (params.laplacian_strength ? params.laplacian_strength / 0.4 : 1.2);
  elements.sliderSharpenStrength.value = strVal;
  elements.valSharpenStrength.textContent = strVal.toFixed(1);
  elements.selectColormap.value = params.colormap || "monochrome";
}

function selectPreset(presetId, shouldRun = true) {
  state.currentPresetId = presetId;
  document.querySelectorAll(".preset-card").forEach(c => c.classList.remove("active"));
  const targetCard = document.getElementById(`preset-${presetId}`);
  if (targetCard) targetCard.classList.add("active");

  const preset = CLINICAL_PRESETS.find(p => p.id === presetId);
  if (preset) {
    state.customParams = { ...preset.pipeline };
    syncControlsFromParams(state.customParams);
  }
  if (shouldRun) recomputeFromRawPixels();
}

function handleUserFileUpload(file) {
  state.currentSampleId = null;
  AnnotationTools.clearAll();

  const hint = elements.dropzone.querySelector(".dropzone-hint");
  if (hint) hint.textContent = `Loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const buf = ev.target.result;
    if (DicomParser.isDicomBuffer(buf)) {
      loadDicomBufferAndProcess(buf, file.name);
    } else {
      const blobUrl = URL.createObjectURL(file);
      loadStandardImageAndProcess(blobUrl, "IMG", file.name.slice(0, 14).toUpperCase());
    }
  };
  reader.readAsArrayBuffer(file);
}

function loadDicomBufferAndProcess(arrayBuffer, filename) {
  setLoading(true, "Decoding 16-bit DICOM PixelData & Metadata...");
  setTimeout(() => {
    try {
      const dcm = DicomParser.parse(arrayBuffer);
      state.isDicom = true;
      state.dicomMeta = dcm.meta;
      state.rawPixels = dcm.rawPixels;
      state.imgWidth = dcm.width;
      state.imgHeight = dcm.height;
      state.invertPhotometric = dcm.meta.photometric === "MONOCHROME1";
      elements.btnInvert.classList.toggle("active", state.invertPhotometric);

      // Calibrate WW/WL sliders to full DICOM range
      const minP = dcm.meta.minPixel;
      const maxP = dcm.meta.maxPixel;
      const span = Math.max(10, maxP - minP);

      elements.sliderWl.min = minP;
      elements.sliderWl.max = maxP;
      elements.sliderWl.value = dcm.meta.windowCenter;
      state.windowCenter = dcm.meta.windowCenter;

      elements.sliderWw.min = 10;
      elements.sliderWw.max = span * 2;
      elements.sliderWw.value = dcm.meta.windowWidth;
      state.windowWidth = dcm.meta.windowWidth;

      elements.valWl.textContent = Math.round(state.windowCenter);
      elements.valWw.textContent = Math.round(state.windowWidth);
      elements.bitDepthBadge.textContent = `${dcm.meta.bitsStored}-Bit DICOM`;

      AnnotationTools.setCalibration(dcm.meta.pixelSpacing, dcm.meta.hasCalibratedSpacing);
      updateHud();
      recomputeFromRawPixels();
    } catch (err) {
      console.error("DICOM Error:", err);
      alert(`DICOM Decode Error: ${err.message}`);
      setLoading(false);
    }
  }, 30);
}

async function loadStandardImageAndProcess(src, modality = "DX", bodyPart = "CHEST") {
  setLoading(true, "Loading Radiograph into Clinical Viewport...");
  try {
    const { imageData, width, height } = await loadImageToCanvas(src);
    const grayObj = MedEngine.toGrayscale(imageData);

    state.isDicom = false;
    state.dicomMeta = {
      patientName: "REFERENCE CASE",
      patientID: state.currentSampleId || "LOCAL-SCAN",
      studyDate: new Date().toISOString().slice(0, 10),
      modality,
      bodyPart,
      pixelSpacing: [0.2, 0.2],
      hasCalibratedSpacing: false
    };
    state.rawPixels = grayObj.data;
    state.imgWidth = width;
    state.imgHeight = height;
    state.invertPhotometric = false;
    elements.btnInvert.classList.remove("active");

    elements.sliderWl.min = 0;
    elements.sliderWl.max = 255;
    elements.sliderWl.value = 128;
    state.windowCenter = 128;

    elements.sliderWw.min = 10;
    elements.sliderWw.max = 255;
    elements.sliderWw.value = 255;
    state.windowWidth = 255;

    elements.valWl.textContent = "128";
    elements.valWw.textContent = "255";
    elements.bitDepthBadge.textContent = "8-Bit";

    AnnotationTools.setCalibration([0.2, 0.2], false);
    updateHud();
    recomputeFromRawPixels();
  } catch (err) {
    console.error(err);
    alert(`Load failed: ${err.message}`);
    setLoading(false);
  }
}

function updateHud() {
  const m = state.dicomMeta;
  if (!m) return;
  elements.hudModality.textContent = m.modality || "DX";
  elements.hudBodyPart.textContent = m.bodyPart || "--";
  elements.hudWlWw.textContent = `${Math.round(state.windowCenter)} / ${Math.round(state.windowWidth)}`;
  const sp = m.pixelSpacing ? m.pixelSpacing[0].toFixed(2) : "0.20";
  elements.hudSpacing.textContent = m.hasCalibratedSpacing ? `${sp} mm/px` : `${sp} mm/px (est)`;
}

function recomputeFromRawPixels() {
  if (!state.rawPixels) return;
  setLoading(true, "Running Enhancement Pipeline & CADe Triage...");

  setTimeout(() => {
    try {
      const w = state.imgWidth;
      const h = state.imgHeight;

      // 1. Apply 16-bit/8-bit Windowing (WW/WL) + Photometric Inversion
      const base8 = DicomParser.applyWindowLevel(
        state.rawPixels,
        state.windowCenter,
        state.windowWidth,
        state.invertPhotometric
      );
      state.baseGray8 = base8;

      const origImageData = MedEngine.toImageData(base8, w, h, false);
      const origUrl = imageDataToDataURL(origImageData);

      // 2. Run Clinical Enhancement Pipeline
      const { enhancedGray, outputImageData } = MedEngine.processPipeline(base8, w, h, state.customParams);
      const enhUrl = imageDataToDataURL(outputImageData);

      // 3. Compute IQA Metrics
      const metrics = MedMetrics.evaluateAll(base8, enhancedGray, w, h);

      // 4. Compute CADe Triage Heatmap
      const triage = CadeTriage.analyze(enhancedGray, w, h);
      state.triageResult = triage;
      elements.triageHeatmapImg.src = imageDataToDataURL(triage.heatmapImageData);
      elements.triageHeatmapImg.style.opacity = state.showTriage ? state.triageOpacity : 0;
      elements.valTriageAsym.textContent = `${triage.asymmetryPercent}%`;
      elements.valTriageHotspots.textContent = `${triage.hotspotCount}`;
      elements.triageSummary.textContent = `${triage.summary} (Triage aid only, not a standalone diagnosis.)`;

      state.originalImageSrc = origUrl;
      state.enhancedImageSrc = enhUrl;
      state.metrics = metrics;

      elements.imgOriginal.src = origUrl;
      elements.imgEnhanced.src = enhUrl;
      elements.imgDualOrig.src = origUrl;
      elements.imgDualEnh.src = enhUrl;

      elements.imgOriginal.onload = () => redrawAnnotations();

      updateMetricCards(metrics);
      drawHistogram(metrics.hist_original, metrics.hist_enhanced);
    } catch (err) {
      console.error("Processing error:", err);
      alert(`Processing failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, 25);
}

function updateMetricCards(m) {
  if (!m) return;
  elements.valPsnr.textContent = `${m.psnr.toFixed(1)} dB`;
  elements.valSsim.textContent = m.ssim.toFixed(4);
  elements.valCii.textContent = `${m.cii.toFixed(2)}x`;
  const delta = m.entropy_delta;
  elements.valEntropy.textContent = `${delta >= 0 ? "+" : ""}${delta.toFixed(3)} b/p`;
  elements.valEntropy.style.color = delta >= 0 ? "var(--accent-teal)" : "var(--accent-amber)";
}

function drawHistogram(histOrig, histEnh) {
  const canvas = elements.histCanvas;
  if (!canvas || !histOrig || !histEnh) return;
  const ctx = canvas.getContext("2d");
  const w = (canvas.width = canvas.offsetWidth);
  const h = (canvas.height = canvas.offsetHeight);

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(100, 116, 139, 0.35)";
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * w;
    const y = h - ((histOrig[i] || 0) / 100) * (h - 10);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#00f0ff";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * w;
    const y = h - ((histEnh[i] || 0) / 100) * (h - 10);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(0, 240, 255, 0.25)");
  grad.addColorStop(1, "rgba(0, 240, 255, 0.0)");
  ctx.fillStyle = grad;
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
}

function updateSplitPosition(posX, totalWidth) {
  let pct = (posX / totalWidth) * 100;
  pct = Math.max(2, Math.min(98, pct));
  state.splitPosition = pct;
  elements.splitHandle.style.left = `${pct}%`;
  elements.overlayLayer.style.clipPath = `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)`;
}

function setViewMode(mode) {
  state.viewMode = mode;
  elements.btnModeSplit.classList.toggle("active", mode === "split");
  elements.btnModeDual.classList.toggle("active", mode === "dual");
  elements.btnModeEnh.classList.toggle("active", mode === "enhanced");

  if (mode === "split") {
    elements.compareContainer.style.display = "flex";
    elements.dualContainer.style.display = "none";
    elements.splitHandle.style.display = "block";
    updateSplitPosition(elements.compareContainer.offsetWidth * 0.5, elements.compareContainer.offsetWidth);
  } else if (mode === "dual") {
    elements.compareContainer.style.display = "none";
    elements.dualContainer.style.display = "grid";
  } else {
    elements.compareContainer.style.display = "flex";
    elements.dualContainer.style.display = "none";
    elements.splitHandle.style.display = "none";
    elements.overlayLayer.style.clipPath = "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
  }
}

function changeZoom(delta) {
  state.zoomLevel = Math.max(1.0, Math.min(4.0, state.zoomLevel + delta));
  if (state.zoomLevel === 1.0) {
    state.panX = 0;
    state.panY = 0;
  }
  applyTransform();
}

function resetZoom() {
  state.zoomLevel = 1.0;
  state.panX = 0;
  state.panY = 0;
  applyTransform();
}

function applyTransform() {
  const transform = `scale(${state.zoomLevel}) translate(${state.panX / state.zoomLevel}px, ${state.panY / state.zoomLevel}px)`;
  elements.imgOriginal.style.transform = transform;
  elements.imgEnhanced.style.transform = transform;
  elements.triageHeatmapImg.style.transform = transform;
  elements.annotationCanvas.style.transform = transform;
  elements.imgDualOrig.style.transform = transform;
  elements.imgDualEnh.style.transform = transform;
}

function downloadEnhancedSnapshot() {
  if (!state.enhancedImageSrc) return;
  const link = document.createElement("a");
  link.href = state.enhancedImageSrc;
  link.download = `RadVision_Enhanced_${state.currentPresetId}_${Date.now()}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate Printable Clinical Radiology Report in a new tab
 */
function generateClinicalReport() {
  if (!state.originalImageSrc || !state.enhancedImageSrc) return;
  const meta = state.dicomMeta || {};
  const m = state.metrics || {};
  const triage = state.triageResult || {};
  const measurements = AnnotationTools.getAnnotationsSummary();

  const reportHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>RadVision Clinical Enhancement Report</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 960px; margin: 30px auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
        .title { font-size: 22px; font-weight: 800; color: #0369a1; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; background: #f8fafc; }
        .box h3 { margin: 0 0 10px; font-size: 14px; text-transform: uppercase; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
        .row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
        .images { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
        .img-card { background: #000; padding: 10px; border-radius: 8px; text-align: center; color: #fff; }
        .img-card img { max-width: 100%; max-height: 360px; object-fit: contain; }
        .disclaimer { margin-top: 24px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">RADVISION CLINICAL RADIOGRAPHY REPORT</div>
          <div style="font-size: 12px; color: #475569;">Generated: ${new Date().toLocaleString()}</div>
        </div>
        <button class="no-print" onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Print / Save PDF</button>
      </div>
      <div class="grid">
        <div class="box">
          <h3>Study &amp; DICOM Metadata</h3>
          <div class="row"><span>Patient / Ref ID:</span><strong>${meta.patientName || "N/A"} (${meta.patientID || "--"})</strong></div>
          <div class="row"><span>Modality / Body Part:</span><strong>${meta.modality || "DX"} / ${meta.bodyPart || "--"}</strong></div>
          <div class="row"><span>Dimensions:</span><strong>${state.imgWidth} &times; ${state.imgHeight} px</strong></div>
          <div class="row"><span>Window Level / Width:</span><strong>${Math.round(state.windowCenter)} / ${Math.round(state.windowWidth)}</strong></div>
          <div class="row"><span>Pixel Spacing:</span><strong>${meta.pixelSpacing ? meta.pixelSpacing[0].toFixed(3) : "0.200"} mm/px</strong></div>
        </div>
        <div class="box">
          <h3>Enhancement &amp; IQA Benchmarks</h3>
          <div class="row"><span>Applied Preset:</span><strong>${state.currentPresetId}</strong></div>
          <div class="row"><span>PSNR / SSIM:</span><strong>${m.psnr} dB / ${m.ssim}</strong></div>
          <div class="row"><span>Contrast Index (CII):</span><strong>${m.cii}x</strong></div>
          <div class="row"><span>Entropy Gain:</span><strong>${m.entropy_delta >= 0 ? "+" : ""}${m.entropy_delta} bits/px</strong></div>
          <div class="row"><span>CADe Triage Asymmetry:</span><strong>${triage.asymmetryPercent ?? "--"}% (${triage.hotspotCount ?? 0} hotspots)</strong></div>
        </div>
      </div>
      <div class="box">
        <h3>Anatomical Measurements &amp; Findings</h3>
        <div style="font-size: 13px;">
          ${measurements.length > 0 ? measurements.map(item => `<div>&bull; ${item}</div>`).join("") : "<div>No manual ruler/angle/CTR measurements recorded.</div>"}
          <div style="margin-top: 8px; color: #b45309;"><strong>CADe Triage Note:</strong> ${triage.summary || "N/A"}</div>
        </div>
      </div>
      <div class="images">
        <div class="img-card">
          <img src="${state.originalImageSrc}" />
          <div style="font-size: 12px; margin-top: 6px;">Original / Windowed Radiograph</div>
        </div>
        <div class="img-card">
          <img src="${state.enhancedImageSrc}" />
          <div style="font-size: 12px; margin-top: 6px;">Enhanced Clinical Result</div>
        </div>
      </div>
      <div class="disclaimer">
        <strong>Clinical Notice:</strong> This report was generated locally in the browser using RadVision. Image enhancement and CADe triage overlays are intended as visual decision-support aids and must be interpreted alongside unaltered source radiographs by a qualified clinician.
      </div>
    </body>
    </html>
  `;

  const win = window.open("", "_blank");
  if (win) {
    win.document.open();
    win.document.write(reportHtml);
    win.document.close();
  }
}

function setLoading(isLoading, text = "Processing...") {
  if (isLoading) {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.add("active");
  } else {
    elements.loadingOverlay.classList.remove("active");
  }
}

// ==========================================================================
// Client-Side Batch Cohort Processing + JSZip Export (Supports DICOM + Images)
// ==========================================================================
function loadBatchFiles(files) {
  state.batchFiles = files;
  elements.batchCountPill.textContent = `${files.length} Scans Loaded`;
  elements.batchTableBody.innerHTML = "";
  files.forEach((f, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${idx + 1}</td>
      <td><strong>${f.name}</strong></td>
      <td>${(f.size / 1024).toFixed(1)} KB</td>
      <td><span class="badge-tag">Queued</span></td>
      <td>--</td>
      <td>--</td>
      <td>--</td>
    `;
    elements.batchTableBody.appendChild(tr);
  });
  elements.btnProcessBatch.disabled = false;
}

async function loadBuiltInSampleCohort() {
  setLoading(true, "Loading 8 Built-In Clinical Datasets into Cohort...");
  try {
    const loadedFiles = [];
    for (const s of SAMPLE_XRAYS) {
      const res = await fetch(s.url);
      const blob = await res.blob();
      const ext = s.isDicom ? "dcm" : "png";
      loadedFiles.push(new File([blob], `${s.id}.${ext}`, { type: blob.type }));
    }
    loadBatchFiles(loadedFiles);
  } catch (err) {
    alert(`Failed to load sample cohort: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

async function processBatchCohort() {
  if (!state.batchFiles || state.batchFiles.length === 0) return;

  setLoading(true, `Processing Cohort (${state.batchFiles.length} Scans) Locally...`);
  const zip = new JSZip();
  const folder = zip.folder("enhanced_scans");
  const csvRows = [
    "Filename,Modality,Width,Height,PSNR (dB),SSIM,Contrast Improvement Index (CII),Entropy Gain,CADe Hotspots"
  ];

  const rows = elements.batchTableBody.querySelectorAll("tr");

  for (let i = 0; i < state.batchFiles.length; i++) {
    const file = state.batchFiles[i];
    try {
      const arrayBuf = await file.arrayBuffer();
      let base8, width, height, modality = "IMG";

      if (DicomParser.isDicomBuffer(arrayBuf)) {
        const dcm = DicomParser.parse(arrayBuf);
        modality = dcm.meta.modality;
        width = dcm.width;
        height = dcm.height;
        base8 = DicomParser.applyWindowLevel(
          dcm.rawPixels,
          dcm.meta.windowCenter,
          dcm.meta.windowWidth,
          dcm.meta.photometric === "MONOCHROME1"
        );
      } else {
        const blobUrl = URL.createObjectURL(file);
        const loaded = await loadImageToCanvas(blobUrl);
        URL.revokeObjectURL(blobUrl);
        width = loaded.width;
        height = loaded.height;
        base8 = MedEngine.toGrayscale(loaded.imageData).data;
      }

      const { enhancedGray, outputImageData } = MedEngine.processPipeline(base8, width, height, state.customParams);
      const m = MedMetrics.evaluateAll(base8, enhancedGray, width, height);
      const triage = CadeTriage.analyze(enhancedGray, width, height);
      const blob = await imageDataToBlob(outputImageData);

      const baseName = file.name.replace(/\.[^/.]+$/, "");
      folder.file(`enhanced_${baseName}.png`, blob);

      csvRows.push(
        `"${file.name}",${modality},${width},${height},${m.psnr},${m.ssim},${m.cii},${m.entropy_delta},${triage.hotspotCount}`
      );

      if (rows[i]) {
        rows[i].children[3].innerHTML = '<span class="badge-tag" style="color: var(--accent-teal); border-color: rgba(0, 230, 168, 0.4);">Completed</span>';
        rows[i].children[4].textContent = `${m.psnr.toFixed(1)} dB`;
        rows[i].children[5].textContent = m.ssim.toFixed(4);
        rows[i].children[6].textContent = `${m.cii.toFixed(2)}x`;
      }
    } catch (err) {
      if (rows[i]) {
        rows[i].children[3].innerHTML = '<span class="badge-tag" style="color: var(--accent-rose);">Error</span>';
      }
    }
  }

  zip.file("analysis_report.csv", csvRows.join("\n"));
  const zipBlob = await zip.generateAsync({ type: "blob" });

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `RadVision_Clinical_Cohort_${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);

  setLoading(false);
}
