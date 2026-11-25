/**
 * RadVision Native 16-bit DICOM (Part 10) Parser & Windowing (WW/WL) Engine
 * Supports Explicit VR Little Endian & Implicit VR Little Endian uncompressed DICOMs.
 * Runs 100% client-side in the browser with zero external server uploads.
 */

const DicomParser = (() => {
  const EXPLICIT_LONG_VRS = new Set(["OB", "OW", "OF", "SQ", "UT", "UN", "OD"]);

  function readAscii(view, offset, length) {
    let str = "";
    for (let i = 0; i < length; i++) {
      const code = view.getUint8(offset + i);
      if (code === 0) break;
      str += String.fromCharCode(code);
    }
    return str.trim();
  }

  function isDicomBuffer(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 132) return false;
    const view = new DataView(arrayBuffer);
    return (
      view.getUint8(128) === 0x44 && // D
      view.getUint8(129) === 0x49 && // I
      view.getUint8(130) === 0x43 && // C
      view.getUint8(131) === 0x4d    // M
    );
  }

  /**
   * Parse uncompressed DICOM Part 10 ArrayBuffer into metadata + raw 16-bit/8-bit pixel array
   */
  function parse(arrayBuffer) {
    if (!isDicomBuffer(arrayBuffer)) {
      throw new Error("Invalid DICOM file: Missing 'DICM' preamble at offset 128.");
    }

    const view = new DataView(arrayBuffer);
    const len = arrayBuffer.byteLength;
    let offset = 132;
    let implicitVR = false;

    const meta = {
      patientName: "ANONYMIZED",
      patientID: "--",
      studyDate: "--",
      modality: "DX",
      bodyPart: "CHEST",
      kvp: "--",
      photometric: "MONOCHROME2",
      rows: 0,
      cols: 0,
      pixelSpacing: [0.2, 0.2], // default fallback mm/px
      hasCalibratedSpacing: false,
      bitsAllocated: 16,
      bitsStored: 12,
      pixelRepresentation: 0,
      windowCenter: null,
      windowWidth: null,
      rescaleIntercept: 0,
      rescaleSlope: 1,
      transferSyntax: "1.2.840.10008.1.2.1"
    };

    let pixelDataOffset = -1;
    let pixelDataLength = 0;

    while (offset + 8 <= len) {
      const group = view.getUint16(offset, true);
      const elem = view.getUint16(offset + 2, true);
      offset += 4;

      // Group 0x0002 (File Meta Information) is always Explicit VR Little Endian
      const useExplicit = group === 0x0002 || !implicitVR;
      let vr = "";
      let vl = 0;

      if (group === 0xfffe) {
        // Sequence delimiter / item tag
        vl = view.getUint32(offset, true);
        offset += 4;
        if (vl !== 0xffffffff && vl > 0 && offset + vl <= len) {
          offset += vl;
        }
        continue;
      }

      if (useExplicit) {
        vr = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1));
        offset += 2;
        if (EXPLICIT_LONG_VRS.has(vr)) {
          offset += 2; // reserved 2 bytes
          vl = view.getUint32(offset, true);
          offset += 4;
        } else {
          vl = view.getUint16(offset, true);
          offset += 2;
        }
      } else {
        vl = view.getUint32(offset, true);
        offset += 4;
      }

      // Undefined length sequence
      if (vl === 0xffffffff) {
        continue;
      }

      if (offset + vl > len) break;

      // Pixel Data Tag (7FE0, 0010)
      if (group === 0x7fe0 && elem === 0x0010) {
        pixelDataOffset = offset;
        pixelDataLength = vl;
        break;
      }

      // Extract relevant clinical & image tags
      if (group === 0x0002 && elem === 0x0010) {
        meta.transferSyntax = readAscii(view, offset, vl);
        if (meta.transferSyntax === "1.2.840.10008.1.2") {
          implicitVR = true;
        }
      } else if (group === 0x0008 && elem === 0x0020) {
        meta.studyDate = readAscii(view, offset, vl) || "--";
      } else if (group === 0x0008 && elem === 0x0060) {
        meta.modality = readAscii(view, offset, vl) || "DX";
      } else if (group === 0x0010 && elem === 0x0010) {
        meta.patientName = readAscii(view, offset, vl) || "ANONYMIZED";
      } else if (group === 0x0010 && elem === 0x0020) {
        meta.patientID = readAscii(view, offset, vl) || "--";
      } else if (group === 0x0018 && elem === 0x0015) {
        meta.bodyPart = readAscii(view, offset, vl) || "--";
      } else if (group === 0x0018 && elem === 0x0060) {
        meta.kvp = readAscii(view, offset, vl) || "--";
      } else if (group === 0x0028 && elem === 0x0004) {
        meta.photometric = readAscii(view, offset, vl) || "MONOCHROME2";
      } else if (group === 0x0028 && elem === 0x0010) {
        meta.rows = view.getUint16(offset, true);
      } else if (group === 0x0028 && elem === 0x0011) {
        meta.cols = view.getUint16(offset, true);
      } else if (group === 0x0028 && elem === 0x0030) {
        const sp = readAscii(view, offset, vl).split("\\");
        if (sp.length >= 2 && !isNaN(parseFloat(sp[0])) && !isNaN(parseFloat(sp[1]))) {
          meta.pixelSpacing = [parseFloat(sp[0]), parseFloat(sp[1])];
          meta.hasCalibratedSpacing = true;
        }
      } else if (group === 0x0028 && elem === 0x0100) {
        meta.bitsAllocated = view.getUint16(offset, true);
      } else if (group === 0x0028 && elem === 0x0101) {
        meta.bitsStored = view.getUint16(offset, true);
      } else if (group === 0x0028 && elem === 0x0103) {
        meta.pixelRepresentation = view.getUint16(offset, true);
      } else if (group === 0x0028 && elem === 0x1050) {
        const val = parseFloat(readAscii(view, offset, vl).split("\\")[0]);
        if (!isNaN(val)) meta.windowCenter = val;
      } else if (group === 0x0028 && elem === 0x1051) {
        const val = parseFloat(readAscii(view, offset, vl).split("\\")[0]);
        if (!isNaN(val)) meta.windowWidth = val;
      } else if (group === 0x0028 && elem === 0x1052) {
        const val = parseFloat(readAscii(view, offset, vl));
        if (!isNaN(val)) meta.rescaleIntercept = val;
      } else if (group === 0x0028 && elem === 0x1053) {
        const val = parseFloat(readAscii(view, offset, vl));
        if (!isNaN(val)) meta.rescaleSlope = val;
      }

      offset += vl;
    }

    if (pixelDataOffset < 0 || meta.rows <= 0 || meta.cols <= 0) {
      throw new Error("Could not locate uncompressed DICOM PixelData or image dimensions.");
    }

    const numPixels = meta.rows * meta.cols;
    let rawPixels;

    if (meta.bitsAllocated === 16) {
      rawPixels = new Float32Array(numPixels);
      const mask = meta.bitsStored < 16 ? (1 << meta.bitsStored) - 1 : 0xffff;
      for (let i = 0; i < numPixels; i++) {
        const byteIdx = pixelDataOffset + i * 2;
        if (byteIdx + 1 >= len) break;
        let val = meta.pixelRepresentation === 1
          ? view.getInt16(byteIdx, true)
          : (view.getUint16(byteIdx, true) & mask);
        rawPixels[i] = val * meta.rescaleSlope + meta.rescaleIntercept;
      }
    } else {
      rawPixels = new Float32Array(numPixels);
      for (let i = 0; i < numPixels; i++) {
        if (pixelDataOffset + i >= len) break;
        const val = view.getUint8(pixelDataOffset + i);
        rawPixels[i] = val * meta.rescaleSlope + meta.rescaleIntercept;
      }
    }

    // Compute min/max and default WL/WW if absent
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < rawPixels.length; i++) {
      if (rawPixels[i] < minVal) minVal = rawPixels[i];
      if (rawPixels[i] > maxVal) maxVal = rawPixels[i];
    }

    if (meta.windowWidth === null || meta.windowCenter === null) {
      meta.windowWidth = Math.max(1, Math.round(maxVal - minVal));
      meta.windowCenter = Math.round((maxVal + minVal) / 2);
    }

    meta.minPixel = Math.round(minVal);
    meta.maxPixel = Math.round(maxVal);

    return {
      meta,
      rawPixels,
      width: meta.cols,
      height: meta.rows
    };
  }

  /**
   * Apply DICOM Window Width (WW) & Window Level (WL) mapping to 8-bit grayscale buffer
   * Supports Photometric Inversion (MONOCHROME1 <-> MONOCHROME2)
   */
  function applyWindowLevel(rawPixels, windowCenter, windowWidth, invert = false) {
    const len = rawPixels.length;
    const out = new Uint8Array(len);
    const ww = Math.max(1, windowWidth);
    const low = windowCenter - ww / 2;
    const high = windowCenter + ww / 2;
    const scale = 255.0 / ww;

    for (let i = 0; i < len; i++) {
      const v = rawPixels[i];
      let mapped;
      if (v <= low) mapped = 0;
      else if (v >= high) mapped = 255;
      else mapped = Math.round((v - low) * scale);

      out[i] = invert ? 255 - mapped : mapped;
    }
    return out;
  }

  return {
    isDicomBuffer,
    parse,
    applyWindowLevel
  };
})();
