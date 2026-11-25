/**
 * RadVision Calibrated Anatomical Measurement & Annotation Engine
 * Supports: Ruler (mm), Angle / Cobb Angle (deg), Cardiothoracic Ratio (CTR), and ROI Probe
 */

const AnnotationTools = (() => {
  let activeTool = "none"; // "none", "ruler", "angle", "ctr", "roi"
  let annotations = [];
  let draft = null;
  let pixelSpacing = [0.2, 0.2]; // [rowSpacingMm, colSpacingMm]
  let hasCalibratedSpacing = false;

  function setTool(tool) {
    activeTool = tool;
    draft = null;
  }

  function getTool() {
    return activeTool;
  }

  function setCalibration(spacingArr, isCalibrated) {
    pixelSpacing = spacingArr || [0.2, 0.2];
    hasCalibratedSpacing = !!isCalibrated;
  }

  function clearAll() {
    annotations = [];
    draft = null;
  }

  function getAnnotationsSummary() {
    return annotations.map(a => a.label);
  }

  function distMm(p1, p2, imgW, imgH) {
    const dxPx = (p2.x - p1.x) * imgW;
    const dyPx = (p2.y - p1.y) * imgH;
    const dxMm = dxPx * pixelSpacing[1];
    const dyMm = dyPx * pixelSpacing[0];
    const mm = Math.sqrt(dxMm * dxMm + dyMm * dyMm);
    const px = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
    return { mm, px };
  }

  function computeAngleDeg(p1, vertex, p3, imgW, imgH) {
    const v1x = (p1.x - vertex.x) * imgW;
    const v1y = (p1.y - vertex.y) * imgH;
    const v2x = (p3.x - vertex.x) * imgW;
    const v2y = (p3.y - vertex.y) * imgH;
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (mag1 === 0 || mag2 === 0) return 0;
    const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return (Math.acos(cosTheta) * 180) / Math.PI;
  }

  function computeRoiStats(p1, p2, grayBuffer, imgW, imgH) {
    if (!grayBuffer || imgW <= 0 || imgH <= 0) return null;
    const x0 = Math.max(0, Math.min(imgW - 1, Math.round(Math.min(p1.x, p2.x) * imgW)));
    const x1 = Math.max(0, Math.min(imgW - 1, Math.round(Math.max(p1.x, p2.x) * imgW)));
    const y0 = Math.max(0, Math.min(imgH - 1, Math.round(Math.min(p1.y, p2.y) * imgH)));
    const y1 = Math.max(0, Math.min(imgH - 1, Math.round(Math.max(p1.y, p2.y) * imgH)));

    let sum = 0, count = 0, minV = 255, maxV = 0;
    for (let y = y0; y <= y1; y++) {
      const row = y * imgW;
      for (let x = x0; x <= x1; x++) {
        const v = grayBuffer[row + x];
        sum += v;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
        count++;
      }
    }
    if (count === 0) return null;
    const mean = sum / count;
    let sq = 0;
    for (let y = y0; y <= y1; y++) {
      const row = y * imgW;
      for (let x = x0; x <= x1; x++) {
        const d = grayBuffer[row + x] - mean;
        sq += d * d;
      }
    }
    const std = Math.sqrt(sq / count);
    const snr = std > 0.01 ? mean / std : 0;
    return {
      mean: mean.toFixed(1),
      std: std.toFixed(1),
      min: minV,
      max: maxV,
      snr: snr.toFixed(2),
      pixels: count
    };
  }

  function handlePointerDown(normPt, imgW, imgH) {
    if (activeTool === "none") return false;

    if (activeTool === "ruler" || activeTool === "roi") {
      draft = { type: activeTool, p1: normPt, p2: normPt };
      return true;
    }

    if (activeTool === "angle") {
      if (!draft) {
        draft = { type: "angle", points: [normPt] };
      } else {
        draft.points.push(normPt);
        if (draft.points.length === 3) {
          const deg = computeAngleDeg(draft.points[0], draft.points[1], draft.points[2], imgW, imgH);
          draft.label = `Angle: ${deg.toFixed(1)}°`;
          annotations.push(draft);
          draft = null;
        }
      }
      return true;
    }

    if (activeTool === "ctr") {
      if (!draft) {
        draft = { type: "ctr", step: 1, c1: normPt, c2: normPt, t1: null, t2: null };
      } else if (draft.step === 2) {
        draft.step = 3;
        draft.t1 = normPt;
        draft.t2 = normPt;
      }
      return true;
    }

    return false;
  }

  function handlePointerMove(normPt) {
    if (!draft) return false;
    if (draft.type === "ruler" || draft.type === "roi") {
      draft.p2 = normPt;
      return true;
    }
    if (draft.type === "ctr") {
      if (draft.step === 1) draft.c2 = normPt;
      else if (draft.step === 3) draft.t2 = normPt;
      return true;
    }
    return false;
  }

  function handlePointerUp(normPt, grayBuffer, imgW, imgH) {
    if (!draft) return false;

    if (draft.type === "ruler") {
      draft.p2 = normPt;
      const { mm, px } = distMm(draft.p1, draft.p2, imgW, imgH);
      if (px > 4) {
        draft.label = hasCalibratedSpacing ? `${mm.toFixed(1)} mm` : `${mm.toFixed(1)} mm (est.) / ${Math.round(px)} px`;
        annotations.push(draft);
      }
      draft = null;
      return true;
    }

    if (draft.type === "roi") {
      draft.p2 = normPt;
      const stats = computeRoiStats(draft.p1, draft.p2, grayBuffer, imgW, imgH);
      if (stats && stats.pixels > 9) {
        draft.stats = stats;
        draft.label = `ROI μ:${stats.mean} σ:${stats.std} SNR:${stats.snr}`;
        annotations.push(draft);
      }
      draft = null;
      return true;
    }

    if (draft.type === "ctr") {
      if (draft.step === 1) {
        draft.c2 = normPt;
        draft.step = 2; // Waiting for Thoracic width drag
      } else if (draft.step === 3) {
        draft.t2 = normPt;
        const cDist = distMm(draft.c1, draft.c2, imgW, imgH).mm;
        const tDist = distMm(draft.t1, draft.t2, imgW, imgH).mm;
        const ratio = tDist > 0 ? cDist / tDist : 0;
        const flag = ratio > 0.50 ? "Cardiomegaly (>0.50)" : "Normal (≤0.50)";
        draft.ratio = ratio;
        draft.label = `CTR: ${ratio.toFixed(2)} [${flag}]`;
        annotations.push(draft);
        draft = null;
      }
      return true;
    }

    return false;
  }

  function render(ctx, canvasW, canvasH, imgW, imgH, grayBuffer) {
    ctx.clearRect(0, 0, canvasW, canvasH);
    const items = draft ? [...annotations, draft] : annotations;

    items.forEach((item) => {
      ctx.save();
      if (item.type === "ruler") {
        const x1 = item.p1.x * canvasW, y1 = item.p1.y * canvasH;
        const x2 = item.p2.x * canvasW, y2 = item.p2.y * canvasH;
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        drawEndpoint(ctx, x1, y1, "#00f0ff");
        drawEndpoint(ctx, x2, y2, "#00f0ff");

        const { mm, px } = distMm(item.p1, item.p2, imgW, imgH);
        const lbl = item.label || (hasCalibratedSpacing ? `${mm.toFixed(1)} mm` : `${mm.toFixed(1)} mm (${Math.round(px)}px)`);
        drawLabel(ctx, (x1 + x2) / 2, (y1 + y2) / 2 - 12, lbl, "#00f0ff");
      } else if (item.type === "angle") {
        const pts = item.points;
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        pts.forEach((p, idx) => {
          const px = p.x * canvasW, py = p.y * canvasH;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        pts.forEach(p => drawEndpoint(ctx, p.x * canvasW, p.y * canvasH, "#f59e0b"));
        if (pts.length === 3) {
          const deg = computeAngleDeg(pts[0], pts[1], pts[2], imgW, imgH);
          drawLabel(ctx, pts[1].x * canvasW + 12, pts[1].y * canvasH - 12, `${deg.toFixed(1)}°`, "#f59e0b");
        }
      } else if (item.type === "roi") {
        const x1 = item.p1.x * canvasW, y1 = item.p1.y * canvasH;
        const x2 = item.p2.x * canvasW, y2 = item.p2.y * canvasH;
        ctx.strokeStyle = "#00e6a8";
        ctx.fillStyle = "rgba(0, 230, 168, 0.12)";
        ctx.lineWidth = 1.8;
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);
        const stats = item.stats || computeRoiStats(item.p1, item.p2, grayBuffer, imgW, imgH);
        if (stats) {
          drawLabel(ctx, rx, ry - 8, `μ:${stats.mean} σ:${stats.std} SNR:${stats.snr}`, "#00e6a8");
        }
      } else if (item.type === "ctr") {
        // Cardiac line
        const cx1 = item.c1.x * canvasW, cy1 = item.c1.y * canvasH;
        const cx2 = item.c2.x * canvasW, cy2 = item.c2.y * canvasH;
        ctx.strokeStyle = "#f43f5e";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx1, cy1);
        ctx.lineTo(cx2, cy2);
        ctx.stroke();
        drawLabel(ctx, (cx1 + cx2) / 2, cy1 - 10, "Cardiac Width", "#f43f5e");

        if (item.t1 && item.t2) {
          const tx1 = item.t1.x * canvasW, ty1 = item.t1.y * canvasH;
          const tx2 = item.t2.x * canvasW, ty2 = item.t2.y * canvasH;
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(tx1, ty1);
          ctx.lineTo(tx2, ty2);
          ctx.stroke();
          drawLabel(ctx, (tx1 + tx2) / 2, ty1 + 18, item.label || "Thoracic Width", "#3b82f6");
        }
      }
      ctx.restore();
    });
  }

  function drawEndpoint(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLabel(ctx, x, y, text, color) {
    ctx.font = "600 11px 'JetBrains Mono', monospace";
    const metrics = ctx.measureText(text);
    const padX = 6, padY = 4;
    const boxW = metrics.width + padX * 2;
    const boxH = 18;
    const bx = Math.max(4, Math.min(ctx.canvas.width - boxW - 4, x - boxW / 2));
    const by = Math.max(4, Math.min(ctx.canvas.height - boxH - 4, y - boxH / 2));

    ctx.fillStyle = "rgba(6, 9, 17, 0.88)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeRect(bx, by, boxW, boxH);

    ctx.fillStyle = "#f8fafc";
    ctx.fillText(text, bx + padX, by + 13);
  }

  return {
    setTool,
    getTool,
    setCalibration,
    clearAll,
    getAnnotationsSummary,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    render
  };
})();
