/**
 * RadVision Explainable Radiomics & CADe Triage Heatmap Analyzer
 * Evaluates bilateral attenuation asymmetry and focal gradient discontinuities
 * to highlight regions of interest (ROI) for clinician review.
 * Note: Intended as a triage aid only, not a standalone diagnostic device.
 */

const CadeTriage = (() => {
  function analyze(grayBuffer, width, height) {
    const gridCols = 24;
    const gridRows = 24;
    const cellW = width / gridCols;
    const cellH = height / gridRows;

    const cellMean = new Float32Array(gridCols * gridRows);
    const cellGrad = new Float32Array(gridCols * gridRows);

    // 1. Compute mean attenuation and gradient energy per anatomical patch
    for (let gy = 0; gy < gridRows; gy++) {
      const y0 = Math.floor(gy * cellH);
      const y1 = Math.min(height - 1, Math.floor((gy + 1) * cellH));
      for (let gx = 0; gx < gridCols; gx++) {
        const x0 = Math.floor(gx * cellW);
        const x1 = Math.min(width - 1, Math.floor((gx + 1) * cellW));

        let sum = 0;
        let gradSum = 0;
        let count = 0;

        for (let y = y0; y < y1; y++) {
          const row = y * width;
          for (let x = x0; x < x1; x++) {
            const c = grayBuffer[row + x];
            sum += c;
            if (x > 0 && y > 0) {
              const dx = Math.abs(c - grayBuffer[row + (x - 1)]);
              const dy = Math.abs(c - grayBuffer[(y - 1) * width + x]);
              gradSum += dx + dy;
            }
            count++;
          }
        }
        const idx = gy * gridCols + gx;
        cellMean[idx] = count > 0 ? sum / count : 0;
        cellGrad[idx] = count > 0 ? gradSum / count : 0;
      }
    }

    // 2. Compute bilateral asymmetry + focal gradient outlier score per patch
    const scores = new Float32Array(gridCols * gridRows);
    let maxScore = 0;
    let totalAsym = 0;
    let asymPairs = 0;

    // Average gradient across foreground tissue
    let avgTissueGrad = 0;
    let fgCount = 0;
    for (let i = 0; i < cellMean.length; i++) {
      if (cellMean[i] > 25) {
        avgTissueGrad += cellGrad[i];
        fgCount++;
      }
    }
    avgTissueGrad = fgCount > 0 ? avgTissueGrad / fgCount : 1;

    for (let gy = 1; gy < gridRows - 1; gy++) {
      for (let gx = 1; gx < gridCols - 1; gx++) {
        const idx = gy * gridCols + gx;
        const mirrorGx = gridCols - 1 - gx;
        const mirrorIdx = gy * gridCols + mirrorGx;

        const val = cellMean[idx];
        const mirrorVal = cellMean[mirrorIdx];

        // Ignore dark air background
        if (val < 22 && mirrorVal < 22) continue;

        const asym = Math.max(0, val - mirrorVal) / 255.0;
        totalAsym += Math.abs(val - mirrorVal);
        asymPairs++;

        // High-frequency focal discontinuity relative to tissue average
        const gradRatio = Math.max(0, (cellGrad[idx] - avgTissueGrad * 1.25) / 60.0);

        const combined = Math.min(1.0, asym * 1.65 + gradRatio * 0.55);
        scores[idx] = combined;
        if (combined > maxScore) maxScore = combined;
      }
    }

    // 3. Bilinearly upsample patch scores to full-resolution transparent RGBA heatmap
    const heatmapData = new ImageData(width, height);
    const dst = heatmapData.data;

    for (let y = 0; y < height; y++) {
      const fgy = (y + 0.5) / cellH - 0.5;
      const gy1 = Math.max(0, Math.min(gridRows - 1, Math.floor(fgy)));
      const gy2 = Math.max(0, Math.min(gridRows - 1, gy1 + 1));
      const wy = Math.max(0, Math.min(1, fgy - gy1));

      for (let x = 0; x < width; x++) {
        const fgx = (x + 0.5) / cellW - 0.5;
        const gx1 = Math.max(0, Math.min(gridCols - 1, Math.floor(fgx)));
        const gx2 = Math.max(0, Math.min(gridCols - 1, gx1 + 1));
        const wx = Math.max(0, Math.min(1, fgx - gx1));

        const s11 = scores[gy1 * gridCols + gx1];
        const s21 = scores[gy1 * gridCols + gx2];
        const s12 = scores[gy2 * gridCols + gx1];
        const s22 = scores[gy2 * gridCols + gx2];

        const top = s11 * (1 - wx) + s21 * wx;
        const bot = s12 * (1 - wx) + s22 * wx;
        const score = top * (1 - wy) + bot * wy;

        const outIdx = (y * width + x) * 4;
        if (score < 0.22) {
          dst[outIdx + 3] = 0;
        } else {
          const norm = Math.min(1.0, (score - 0.22) / 0.65);
          // Amber -> Orange -> Crimson triage color ramp
          dst[outIdx] = 255;
          dst[outIdx + 1] = Math.round(180 * (1 - norm));
          dst[outIdx + 2] = Math.round(30 * (1 - norm));
          dst[outIdx + 3] = Math.round(norm * 190);
        }
      }
    }

    // Count high-suspicion clusters
    let hotspots = 0;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > 0.35) hotspots++;
    }

    const avgAsymPct = asymPairs > 0 ? ((totalAsym / asymPairs) / 255.0) * 100 : 0;

    return {
      heatmapImageData: heatmapData,
      asymmetryPercent: Number(avgAsymPct.toFixed(1)),
      hotspotCount: hotspots,
      maxSuspicion: Number((maxScore * 100).toFixed(0)),
      summary: hotspots > 0
        ? `${hotspots} focal radiodensity/gradient region(s) flagged for clinician review.`
        : "No significant bilateral asymmetry or focal discontinuity detected."
    };
  }

  return {
    analyze
  };
})();
