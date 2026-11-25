/**
 * RadVision browser image enhancement engine
 * Operates directly on 8-bit grayscale TypedArrays (Uint8Array / Float32Array)
 * extracted from HTML5 Canvas ImageData for real-time browser processing.
 */

const MedEngine = (() => {
  /**
   * Convert RGBA ImageData to single-channel 8-bit grayscale Uint8Array
   */
  function toGrayscale(imageData) {
    const { data, width, height } = imageData;
    const gray = new Uint8Array(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      // Luminance-preserving BT.601 conversion
      gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    return { data: gray, width, height };
  }

  /**
   * Convert grayscale Uint8Array (or RGB colormap buffer) back to RGBA ImageData
   */
  function toImageData(buffer, width, height, isRGB = false) {
    const out = new ImageData(width, height);
    const dst = out.data;
    if (isRGB) {
      for (let i = 0, j = 0; i < dst.length; i += 4, j += 3) {
        dst[i] = buffer[j];
        dst[i + 1] = buffer[j + 1];
        dst[i + 2] = buffer[j + 2];
        dst[i + 3] = 255;
      }
    } else {
      for (let i = 0, j = 0; i < dst.length; i += 4, j++) {
        const v = buffer[j];
        dst[i] = v;
        dst[i + 1] = v;
        dst[i + 2] = v;
        dst[i + 3] = 255;
      }
    }
    return out;
  }

  /**
   * Separable Gaussian Blur (O(r) per pixel)
   */
  function applyGaussian(src, width, height, sigma = 1.2) {
    const radius = Math.max(1, Math.ceil(sigma * 2.5));
    const kSize = radius * 2 + 1;
    const kernel = new Float32Array(kSize);
    let sum = 0;
    const s2 = 2 * sigma * sigma;
    for (let i = -radius; i <= radius; i++) {
      const val = Math.exp(-(i * i) / s2);
      kernel[i + radius] = val;
      sum += val;
    }
    for (let i = 0; i < kSize; i++) kernel[i] /= sum;

    const temp = new Float32Array(width * height);
    const dst = new Uint8Array(width * height);

    // Horizontal pass
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) {
          const sx = Math.min(width - 1, Math.max(0, x + k));
          acc += src[rowOffset + sx] * kernel[k + radius];
        }
        temp[rowOffset + x] = acc;
      }
    }

    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) {
          const sy = Math.min(height - 1, Math.max(0, y + k));
          acc += temp[sy * width + x] * kernel[k + radius];
        }
        dst[y * width + x] = Math.min(255, Math.max(0, Math.round(acc)));
      }
    }
    return dst;
  }

  /**
   * Median Filter (3x3 or 5x5) for impulse / salt-and-pepper noise
   */
  function applyMedian(src, width, height, ksize = 3) {
    const r = Math.floor(ksize / 2);
    const dst = new Uint8Array(width * height);
    const win = new Uint8Array(ksize * ksize);
    const mid = Math.floor((ksize * ksize) / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let idx = 0;
        for (let dy = -r; dy <= r; dy++) {
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -r; dx <= r; dx++) {
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            win[idx++] = src[sy * width + sx];
          }
        }
        win.sort();
        dst[y * width + x] = win[mid];
      }
    }
    return dst;
  }

  /**
   * Edge-Preserving Bilateral Filter
   */
  function applyBilateral(src, width, height, diameter = 7, sigmaColor = 50, sigmaSpace = 50) {
    const r = Math.floor(diameter / 2);
    const dst = new Uint8Array(width * height);

    // Precompute spatial weights
    const spaceWeights = new Float32Array((2 * r + 1) * (2 * r + 1));
    const invSpace2 = -0.5 / (sigmaSpace * sigmaSpace);
    let idx = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        spaceWeights[idx++] = Math.exp((dx * dx + dy * dy) * invSpace2);
      }
    }

    // Precompute range (intensity difference) LUT for 0..255
    const colorWeights = new Float32Array(256);
    const invColor2 = -0.5 / (sigmaColor * sigmaColor);
    for (let i = 0; i < 256; i++) {
      colorWeights[i] = Math.exp((i * i) * invColor2);
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const centerVal = src[y * width + x];
        let sumVal = 0;
        let sumWeight = 0;
        let sIdx = 0;

        for (let dy = -r; dy <= r; dy++) {
          const sy = Math.min(height - 1, Math.max(0, y + dy));
          const rowOff = sy * width;
          for (let dx = -r; dx <= r; dx++) {
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            const neighborVal = src[rowOff + sx];
            const diff = Math.abs(centerVal - neighborVal);
            const w = spaceWeights[sIdx++] * colorWeights[diff];
            sumVal += neighborVal * w;
            sumWeight += w;
          }
        }
        dst[y * width + x] = Math.round(sumVal / (sumWeight || 1));
      }
    }
    return dst;
  }

  /**
   * Fast Non-Local Means (NLM) Denoising for Low-Dose Quantum Mottle
   * Optimized patch-based similarity filter for browser execution.
   */
  function applyNLM(src, width, height, h = 8.0) {
    const patchR = 1; // 3x3 patch
    const searchR = 4; // 9x9 search window
    const dst = new Uint8Array(width * height);
    const h2 = h * h * 9; // Scaled by patch size

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sumVal = 0;
        let sumW = 0;
        let maxW = 0;

        const yStart = Math.max(patchR, y - searchR);
        const yEnd = Math.min(height - 1 - patchR, y + searchR);
        const xStart = Math.max(patchR, x - searchR);
        const xEnd = Math.min(width - 1 - patchR, x + searchR);

        for (let ny = yStart; ny <= yEnd; ny++) {
          for (let nx = xStart; nx <= xEnd; nx++) {
            if (nx === x && ny === y) continue;

            // Compute 3x3 patch SSD
            let dist2 = 0;
            for (let py = -patchR; py <= patchR; py++) {
              const r1 = (Math.min(height - 1, Math.max(0, y + py))) * width;
              const r2 = (ny + py) * width;
              for (let px = -patchR; px <= patchR; px++) {
                const c1 = Math.min(width - 1, Math.max(0, x + px));
                const d = src[r1 + c1] - src[r2 + (nx + px)];
                dist2 += d * d;
              }
            }

            const w = Math.exp(-dist2 / (h2 || 1));
            if (w > maxW) maxW = w;
            sumVal += src[ny * width + nx] * w;
            sumW += w;
          }
        }

        // Center pixel gets maxW
        const centerW = maxW > 0 ? maxW : 1.0;
        sumVal += src[y * width + x] * centerW;
        sumW += centerW;

        dst[y * width + x] = Math.min(255, Math.max(0, Math.round(sumVal / sumW)));
      }
    }
    return dst;
  }

  /**
   * Global Histogram Equalization (HE)
   */
  function applyGlobalHE(src, width, height) {
    const total = width * height;
    const hist = new Uint32Array(256);
    for (let i = 0; i < total; i++) hist[src[i]]++;

    const cdf = new Uint32Array(256);
    cdf[0] = hist[0];
    for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];

    let cdfMin = 0;
    for (let i = 0; i < 256; i++) {
      if (cdf[i] > 0) {
        cdfMin = cdf[i];
        break;
      }
    }

    const lut = new Uint8Array(256);
    const denom = Math.max(1, total - cdfMin);
    for (let i = 0; i < 256; i++) {
      lut[i] = Math.round(((cdf[i] - cdfMin) / denom) * 255);
    }

    const dst = new Uint8Array(total);
    for (let i = 0; i < total; i++) dst[i] = lut[src[i]];
    return dst;
  }

  /**
   * Contrast Limited Adaptive Histogram Equalization (CLAHE)
   * Genuine tile-based histogram clipping, excess redistribution, and bilinear interpolation.
   */
  function applyCLAHE(src, width, height, clipLimit = 2.5, gridSize = 8) {
    const tilesX = gridSize;
    const tilesY = gridSize;
    const tileW = width / tilesX;
    const tileH = height / tilesY;

    // Build LUT for each tile
    const tileLUTs = new Array(tilesY);
    for (let ty = 0; ty < tilesY; ty++) {
      tileLUTs[ty] = new Array(tilesX);
      const y0 = Math.floor(ty * tileH);
      const y1 = Math.floor((ty + 1) * tileH);

      for (let tx = 0; tx < tilesX; tx++) {
        const x0 = Math.floor(tx * tileW);
        const x1 = Math.floor((tx + 1) * tileW);
        const tileArea = Math.max(1, (x1 - x0) * (y1 - y0));

        const hist = new Float32Array(256);
        for (let y = y0; y < y1; y++) {
          const row = y * width;
          for (let x = x0; x < x1; x++) {
            hist[src[row + x]]++;
          }
        }

        // Clip histogram & redistribute excess
        const actualClip = Math.max(1, (clipLimit * tileArea) / 256);
        let excess = 0;
        for (let i = 0; i < 256; i++) {
          if (hist[i] > actualClip) {
            excess += hist[i] - actualClip;
            hist[i] = actualClip;
          }
        }
        const avgInc = excess / 256;
        for (let i = 0; i < 256; i++) {
          hist[i] += avgInc;
        }

        // Compute CDF LUT
        const lut = new Uint8Array(256);
        let cdf = 0;
        for (let i = 0; i < 256; i++) {
          cdf += hist[i];
          lut[i] = Math.min(255, Math.max(0, Math.round((cdf / tileArea) * 255)));
        }
        tileLUTs[ty][tx] = lut;
      }
    }

    // Bilinear interpolation across tile centers
    const dst = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const fty = (y + 0.5) / tileH - 0.5;
      const ty1 = Math.max(0, Math.min(tilesY - 1, Math.floor(fty)));
      const ty2 = Math.max(0, Math.min(tilesY - 1, ty1 + 1));
      const wy = Math.max(0, Math.min(1, fty - ty1));

      for (let x = 0; x < width; x++) {
        const ftx = (x + 0.5) / tileW - 0.5;
        const tx1 = Math.max(0, Math.min(tilesX - 1, Math.floor(ftx)));
        const tx2 = Math.max(0, Math.min(tilesX - 1, tx1 + 1));
        const wx = Math.max(0, Math.min(1, ftx - tx1));

        const val = src[y * width + x];
        const v11 = tileLUTs[ty1][tx1][val];
        const v21 = tileLUTs[ty1][tx2][val];
        const v12 = tileLUTs[ty2][tx1][val];
        const v22 = tileLUTs[ty2][tx2][val];

        const top = v11 * (1 - wx) + v21 * wx;
        const bot = v12 * (1 - wx) + v22 * wx;
        dst[y * width + x] = Math.round(top * (1 - wy) + bot * wy);
      }
    }
    return dst;
  }

  /**
   * Gamma Correction (Power-Law Transformation)
   */
  function applyGamma(src, gamma = 1.0) {
    if (Math.abs(gamma - 1.0) < 0.01) return src;
    const invGamma = 1.0 / Math.max(0.1, gamma);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      lut[i] = Math.min(255, Math.max(0, Math.round(Math.pow(i / 255.0, invGamma) * 255.0)));
    }
    const dst = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) dst[i] = lut[src[i]];
    return dst;
  }

  /**
   * Unsharp Masking (High-Frequency Detail Boost)
   */
  function applyUnsharpMask(src, width, height, sigma = 1.2, strength = 1.2) {
    const blurred = applyGaussian(src, width, height, sigma);
    const dst = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const val = src[i] + strength * (src[i] - blurred[i]);
      dst[i] = Math.min(255, Math.max(0, Math.round(val)));
    }
    return dst;
  }

  /**
   * Laplacian 2nd-Derivative Sharpening
   */
  function applyLaplacianSharpen(src, width, height, strength = 0.5) {
    const dst = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const up = src[Math.max(0, y - 1) * width + x];
        const dn = src[Math.min(height - 1, y + 1) * width + x];
        const lt = src[y * width + Math.max(0, x - 1)];
        const rt = src[y * width + Math.min(width - 1, x + 1)];
        const c = src[y * width + x];
        const lap = up + dn + lt + rt - 4 * c;
        const val = c - strength * lap;
        dst[y * width + x] = Math.min(255, Math.max(0, Math.round(val)));
      }
    }
    return dst;
  }

  /**
   * Sobel Gradient Magnitude Edge Map
   */
  function applySobel(src, width, height) {
    const mag = new Float32Array(width * height);
    let maxVal = 1;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const tl = src[(y - 1) * width + (x - 1)];
        const tc = src[(y - 1) * width + x];
        const tr = src[(y - 1) * width + (x + 1)];
        const ml = src[y * width + (x - 1)];
        const mr = src[y * width + (x + 1)];
        const bl = src[(y + 1) * width + (x - 1)];
        const bc = src[(y + 1) * width + x];
        const br = src[(y + 1) * width + (x + 1)];

        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        const m = Math.sqrt(gx * gx + gy * gy);
        mag[y * width + x] = m;
        if (m > maxVal) maxVal = m;
      }
    }
    const dst = new Uint8Array(width * height);
    const scale = 255.0 / maxVal;
    for (let i = 0; i < mag.length; i++) {
      dst[i] = Math.min(255, Math.round(mag[i] * scale));
    }
    return dst;
  }

  /**
   * Otsu's Automatic Variance-Optimal Thresholding
   */
  function applyOtsu(src, width, height) {
    const smooth = applyGaussian(src, width, height, 1.0);
    const total = width * height;
    const hist = new Uint32Array(256);
    for (let i = 0; i < total; i++) hist[smooth[i]]++;

    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVar = 0;
    let threshold = 127;

    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;

      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varBetween > maxVar) {
        maxVar = varBetween;
        threshold = t;
      }
    }

    const dst = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      dst[i] = smooth[i] >= threshold ? 255 : 0;
    }
    return dst;
  }

  /**
   * Bone display palette LUT.
   */
  function applyColormap(src, colormapName) {
    if (!colormapName || colormapName === "monochrome") {
      return { buffer: src, isRGB: false };
    }

    const palette = [
      [0, 0, 0], [0, 20, 40], [80, 120, 140], [180, 210, 220], [255, 255, 255]
    ];
    const lut = new Uint8Array(256 * 3);
    const n = palette.length - 1;

    for (let i = 0; i < 256; i++) {
      const t = (i / 255) * n;
      const idx = Math.min(n - 1, Math.floor(t));
      const frac = t - idx;
      lut[i * 3] = Math.round(palette[idx][0] + frac * (palette[idx + 1][0] - palette[idx][0]));
      lut[i * 3 + 1] = Math.round(palette[idx][1] + frac * (palette[idx + 1][1] - palette[idx][1]));
      lut[i * 3 + 2] = Math.round(palette[idx][2] + frac * (palette[idx + 1][2] - palette[idx][2]));
    }

    const rgb = new Uint8Array(src.length * 3);
    for (let i = 0; i < src.length; i++) {
      const c = src[i] * 3;
      rgb[i * 3] = lut[c];
      rgb[i * 3 + 1] = lut[c + 1];
      rgb[i * 3 + 2] = lut[c + 2];
    }
    return { buffer: rgb, isRGB: true };
  }

  /**
   * Sequential image processing pipeline
   */
  function processPipeline(grayBuffer, width, height, params) {
    let current = new Uint8Array(grayBuffer);

    // 1. Denoising Stage
    const denoise = params.denoise_method || "none";
    if (denoise === "nlm") {
      current = applyNLM(current, width, height, params.nlm_h || 8.0);
    } else if (denoise === "bilateral") {
      current = applyBilateral(
        current,
        width,
        height,
        params.bilateral_d || 7,
        params.bilateral_sigma_color || 50,
        params.bilateral_sigma_space || 50
      );
    } else if (denoise === "median") {
      current = applyMedian(current, width, height, params.median_ksize || 3);
    } else if (denoise === "gaussian") {
      current = applyGaussian(current, width, height, params.gaussian_sigma || 1.2);
    }

    // 2. Contrast Enhancement Stage
    const contrast = params.contrast_method || "clahe";
    if (contrast === "clahe") {
      current = applyCLAHE(current, width, height, params.clahe_clip || 2.5, params.clahe_grid || 8);
    } else if (contrast === "he") {
      current = applyGlobalHE(current, width, height);
    }

    // 3. Gamma Correction
    const gamma = params.gamma !== undefined ? params.gamma : 1.0;
    if (Math.abs(gamma - 1.0) > 0.01) {
      current = applyGamma(current, gamma);
    }

    // 4. Sharpening & Feature Extraction
    const sharpen = params.sharpen_method || "none";
    if (sharpen === "unsharp") {
      current = applyUnsharpMask(current, width, height, params.unsharp_sigma || 1.2, params.unsharp_strength || 1.2);
    } else if (sharpen === "laplacian") {
      current = applyLaplacianSharpen(current, width, height, params.laplacian_strength || 0.5);
    } else if (sharpen === "sobel") {
      current = applySobel(current, width, height);
    } else if (sharpen === "otsu") {
      current = applyOtsu(current, width, height);
    }

    // Grayscale result before optional colormap (for metrics calculation)
    const enhancedGray = current;

    // 5. Optional Pseudo-Color Map
    const cmapResult = applyColormap(enhancedGray, params.colormap || "monochrome");

    return {
      enhancedGray,
      outputImageData: toImageData(cmapResult.buffer, width, height, cmapResult.isRGB)
    };
  }

  return {
    toGrayscale,
    toImageData,
    processPipeline
  };
})();
