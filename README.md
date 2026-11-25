# RadVision: Medical Image Preprocessing & Enhancement Workstation

> **Minor Project on Medical Digital Radiography & Image Enhancement**  
> Built with **HTML5 Canvas**, **Progressive CSS3**, **Pure JavaScript (ES6+ TypedArrays)**, and **Node.js**.

---

## 📌 1. Project Overview

In clinical radiography (X-rays), raw detector scans frequently suffer from low contrast, quantum mottle noise, and obscured fine anatomical details. **RadVision** is a progressive, client-side medical image workstation that accepts **any X-ray set** (single scans or multi-file cohorts), executes clinical enhancement algorithms directly in the browser using HTML5 Canvas and `Uint8Array` / `Float32Array` buffers, and displays quantitative Image Quality Assessment (IQA) metrics in real time.

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
