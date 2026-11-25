/**
 * RadVision image statistics and project evaluation metrics.
 * Computes PSNR, SSIM, Contrast Improvement Index (CII), Shannon Entropy,
 * Dynamic Dispersion, and 256-bin Intensity Histogram Profiles.
 */

const MedMetrics = (() => {
  function computePSNR(orig, enh) {
    let mse = 0;
    const len = orig.length;
    for (let i = 0; i < len; i++) {
      const diff = orig[i] - enh[i];
      mse += diff * diff;
    }
    mse /= len;
    if (mse === 0) return 100.0;
    return Number((20 * Math.log10(255.0 / Math.sqrt(mse))).toFixed(2));
  }

  function computeSSIM(orig, enh, width, height) {
    // Patch-based SSIM (8x8 non-overlapping blocks for project experiments)
    const c1 = (0.01 * 255) ** 2;
    const c2 = (0.03 * 255) ** 2;
    const blockSize = 8;
    let ssimSum = 0;
    let blockCount = 0;

    for (let y = 0; y <= height - blockSize; y += blockSize) {
      for (let x = 0; x <= width - blockSize; x += blockSize) {
        let sumX = 0, sumY = 0;
        for (let by = 0; by < blockSize; by++) {
          const row = (y + by) * width + x;
          for (let bx = 0; bx < blockSize; bx++) {
            sumX += orig[row + bx];
            sumY += enh[row + bx];
          }
        }
        const n = blockSize * blockSize;
        const muX = sumX / n;
        const muY = sumY / n;

        let varX = 0, varY = 0, covXY = 0;
        for (let by = 0; by < blockSize; by++) {
          const row = (y + by) * width + x;
          for (let bx = 0; bx < blockSize; bx++) {
            const dx = orig[row + bx] - muX;
            const dy = enh[row + bx] - muY;
            varX += dx * dx;
            varY += dy * dy;
            covXY += dx * dy;
          }
        }
        varX /= n;
        varY /= n;
        covXY /= n;

        const num = (2 * muX * muY + c1) * (2 * covXY + c2);
        const den = (muX * muX + muY * muY + c1) * (varX + varY + c2);
        ssimSum += num / (den || 1);
        blockCount++;
      }
    }
    return Number((ssimSum / Math.max(1, blockCount)).toFixed(4));
  }

  function computeEntropy(buf) {
    const hist = new Uint32Array(256);
    const len = buf.length;
    for (let i = 0; i < len; i++) hist[buf[i]]++;

    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (hist[i] > 0) {
        const p = hist[i] / len;
        entropy -= p * Math.log2(p);
      }
    }
    return Number(entropy.toFixed(3));
  }

  function computeCII(orig, enh, width, height) {
    function avgLocalContrast(buf) {
      const block = 8;
      let sumC = 0;
      let count = 0;
      for (let y = 0; y <= height - block; y += block) {
        for (let x = 0; x <= width - block; x += block) {
          let minV = 255, maxV = 0;
          for (let by = 0; by < block; by++) {
            const row = (y + by) * width + x;
            for (let bx = 0; bx < block; bx++) {
              const v = buf[row + bx];
              if (v < minV) minV = v;
              if (v > maxV) maxV = v;
            }
          }
          const s = maxV + minV;
          if (s > 0) {
            sumC += (maxV - minV) / s;
            count++;
          }
        }
      }
      return count > 0 ? sumC / count : 1.0;
    }

    const cOrig = avgLocalContrast(orig);
    const cEnh = avgLocalContrast(enh);
    if (cOrig <= 1e-5) return 1.0;
    return Number((cEnh / cOrig).toFixed(3));
  }

  function computeStats(buf) {
    const len = buf.length;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += buf[i];
    const mean = sum / len;

    let sqDiff = 0;
    for (let i = 0; i < len; i++) {
      const d = buf[i] - mean;
      sqDiff += d * d;
    }
    const std = Math.sqrt(sqDiff / len);
    return { mean: Number(mean.toFixed(2)), std: Number(std.toFixed(2)) };
  }

  function computeHistogramProfile(buf) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < buf.length; i++) hist[buf[i]]++;
    let maxCount = 1;
    for (let i = 0; i < 256; i++) {
      if (hist[i] > maxCount) maxCount = hist[i];
    }
    const profile = new Array(256);
    for (let i = 0; i < 256; i++) {
      profile[i] = Number(((hist[i] / maxCount) * 100).toFixed(2));
    }
    return profile;
  }

  function evaluateDisplayStats(origGray, enhGray, width, height) {
    const entOrig = computeEntropy(origGray);
    const entEnh = computeEntropy(enhGray);
    return {
      cii: computeCII(origGray, enhGray, width, height),
      entropy_delta: Number((entEnh - entOrig).toFixed(3)),
      hist_original: computeHistogramProfile(origGray),
      hist_enhanced: computeHistogramProfile(enhGray)
    };
  }

  function evaluateAll(origGray, enhGray, width, height) {
    const psnr = computePSNR(origGray, enhGray);
    const ssim = computeSSIM(origGray, enhGray, width, height);
    const statsOrig = computeStats(origGray);
    const statsEnh = computeStats(enhGray);

    return {
      ...evaluateDisplayStats(origGray, enhGray, width, height),
      psnr,
      ssim,
      mean_original: statsOrig.mean,
      mean_enhanced: statsEnh.mean,
      std_original: statsOrig.std,
      std_enhanced: statsEnh.std
    };
  }

  return {
    evaluateAll,
    evaluateDisplayStats
  };
})();
