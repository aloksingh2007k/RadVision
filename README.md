# RadVision: Medical Image Preprocessing & Enhancement Workstation

> **Minor Project on Medical Digital Radiography & Image Enhancement**  
> Built with **HTML5 Canvas**, **Progressive CSS3**, **Pure JavaScript (ES6+ TypedArrays)**, and **Node.js**.

---

## 📌 1. Project Overview

In clinical radiography (X-rays), raw detector scans frequently suffer from low contrast, quantum mottle noise, and obscured fine anatomical details. **RadVision** is a client-side image processing demo that accepts common raster images and a limited DICOM image subset, executes enhancement algorithms in the browser, and displays quantitative Image Quality Assessment (IQA) metrics.

### DICOM compatibility

RadVision uses `dicom-parser` to read DICOM Part 10 file structure. Pixel rendering supports single-frame, single-sample monochrome images encoded with uncompressed Implicit VR Little Endian, Explicit VR Little Endian, or Explicit VR Big Endian transfer syntaxes. It interprets stored-bit alignment, signed pixels, rescale slope/intercept, pixel spacing, MONOCHROME1 inversion, and the DICOM LINEAR window function.

Compressed transfer syntaxes (including JPEG, JPEG-LS, JPEG 2000, RLE, and deflate), color images, multi-frame objects, raw datasets without a Part 10 wrapper, DICOMDIR, writing DICOM objects, and DICOM network / DICOMweb services are not supported. Batch processing exports enhanced PNG images and a CSV report; it does not write modified DICOM instances. This project does not claim complete DICOM conformance or clinical/PACS interoperability.

---

## 🔬 2. Pure JavaScript Algorithmic Engine (`static/js/engine.js`)

- **CLAHE (Contrast Limited Adaptive Histogram Equalization)**: Tile-based local histogram equalization with clip limiting and bilinear interpolation.
- **Global Histogram Equalization (HE)**: Full CDF-based dynamic range expansion.
- **Non-Linear Gamma Correction ($s = c \cdot r^{\gamma}$)**: Lookup-table luminance tuning for soft tissue vs dense bone.
- **Non-Local Means (NLM) Denoising**: Patch-based similarity filter for low-dose quantum mottle noise.
- **Edge-Preserving Bilateral Filter**: Spatial + photometric range Gaussian smoothing.
- **Median & Separable Gaussian Filters**: Impulse noise and speckle reduction.
- **Unsharp Masking & Laplacian Sharpening**: High-frequency boost for hairline fractures and trabecular detail.
- **Sobel Gradient Edge Map & Otsu Automatic Segmentation**: Structural edge extraction and variance-optimal bone thresholding.
- **False-Color Diagnostic Colormaps**: Calibrated LUTs for **Bone**, **Inferno**, **Jet**, **Viridis**, and **Ocean**.

---

## 📊 3. Quantitative IQA Metrics (`static/js/metrics.js`)

- **PSNR (dB)**: Peak Signal-to-Noise Ratio
- **SSIM**: Structural Similarity Index
- **CII**: Contrast Improvement Index ($C_{\text{enhanced}} / C_{\text{original}}$)
- **Shannon Entropy**: Information richness in bits/pixel
- **256-Bin Histogram**: Live comparative attenuation distribution rendered on HTML5 Canvas

---

## 📂 4. Project Structure

```
AAR Proj/
├── server.js                  # Zero-dependency Node.js static server
├── package.json               # Project metadata & npm start script
├── start.bat                  # One-click Windows launcher
├── README.md                  # Project documentation
└── static/
    ├── index.html             # Progressive Dark Medical Workstation UI
    ├── css/
    │   └── style.css          # Glassmorphism & responsive clinical styling
    ├── js/
    │   ├── engine.js          # Pure JS Medical Image Enhancement Engine
    │   ├── metrics.js         # Pure JS PSNR, SSIM, CII, Entropy & Histograms
    │   ├── presets.js         # Clinical Presets & Sample Reference Sets
    │   └── app.js             # Workstation UI, Split Slider, Zoom & Batch ZIP
    └── samples/
        ├── chest_pneumonia.png
        ├── hand_fracture.png
        ├── knee_joint.png
        └── dental_panoramic.png
```

---

## 🚀 5. How to Run

Double-click `start.bat` or run in terminal:
```bash
node server.js
```
Then open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.
