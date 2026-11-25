/*
 * DICOM Part 10 image adapter for RadVision.
 * The underlying dicom-parser library handles Part 10 element encoding and
 * transfer-syntax byte order. Pixel decoding here is intentionally limited
 * to single-frame, single-sample, uncompressed monochrome images.
 */
const DicomParser = (() => {
  const NATIVE_TRANSFER_SYNTAXES = new Set([
    "1.2.840.10008.1.2",       // Implicit VR Little Endian
    "1.2.840.10008.1.2.1",     // Explicit VR Little Endian
    "1.2.840.10008.1.2.2"      // Explicit VR Big Endian (retired)
  ]);

  function isDicomBuffer(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 132) return false;
    const bytes = new Uint8Array(arrayBuffer, 128, 4);
    return bytes[0] === 0x44 && bytes[1] === 0x49 && bytes[2] === 0x43 && bytes[3] === 0x4d;
  }

  function stringValue(dataSet, tag, fallback = "") {
    const value = dataSet.string(tag);
    return value == null ? fallback : value.trim();
  }

  function numberValue(dataSet, tag, fallback) {
    const raw = stringValue(dataSet, tag);
    const value = Number.parseFloat(raw.split("\\")[0]);
    return Number.isFinite(value) ? value : fallback;
  }

  function requiredUint16(dataSet, tag, label) {
    const value = dataSet.uint16(tag);
    if (!Number.isInteger(value)) throw new Error(`Missing or invalid DICOM ${label}.`);
    return value;
  }

  function parse(arrayBuffer) {
    if (!isDicomBuffer(arrayBuffer)) {
      throw new Error("This file is not a DICOM Part 10 file (missing DICM marker).");
    }

    let dataSet;
    try {
      dataSet = dicomParser.parseDicom(new Uint8Array(arrayBuffer));
    } catch (error) {
      throw new Error(`DICOM structure could not be parsed: ${error.message}`);
    }

    const transferSyntax = stringValue(dataSet, "x00020010");
    if (!NATIVE_TRANSFER_SYNTAXES.has(transferSyntax)) {
      throw new Error(`Transfer syntax ${transferSyntax || "unknown"} is not supported for pixel decoding. Use uncompressed Implicit VR Little Endian, Explicit VR Little Endian, or Explicit VR Big Endian.`);
    }

    const rows = requiredUint16(dataSet, "x00280010", "Rows");
    const cols = requiredUint16(dataSet, "x00280011", "Columns");
    const bitsAllocated = requiredUint16(dataSet, "x00280100", "Bits Allocated");
    const bitsStored = requiredUint16(dataSet, "x00280101", "Bits Stored");
    const highBit = requiredUint16(dataSet, "x00280102", "High Bit");
    const pixelRepresentation = requiredUint16(dataSet, "x00280103", "Pixel Representation");
    const samplesPerPixel = requiredUint16(dataSet, "x00280002", "Samples per Pixel");
    const photometric = stringValue(dataSet, "x00280004", "MONOCHROME2");
    const numberOfFrames = Number.parseInt(stringValue(dataSet, "x00280008", "1"), 10);

    if (rows <= 0 || cols <= 0) throw new Error("DICOM Rows and Columns must be positive.");
    if (![8, 16].includes(bitsAllocated) || bitsStored < 1 || bitsStored > bitsAllocated || highBit >= bitsAllocated || highBit + 1 < bitsStored) {
      throw new Error(`Unsupported pixel encoding: ${bitsStored} stored bits in ${bitsAllocated} allocated bits.`);
    }
    if (![0, 1].includes(pixelRepresentation)) throw new Error("Pixel Representation must be unsigned (0) or signed (1).");
    if (samplesPerPixel !== 1 || !["MONOCHROME1", "MONOCHROME2"].includes(photometric)) {
      throw new Error("This viewer supports monochrome single-sample images only.");
    }
    if (numberOfFrames !== 1) throw new Error("Multi-frame DICOM images are not supported by this viewer yet.");

    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement || pixelDataElement.encapsulatedPixelData) {
      throw new Error("The DICOM file has no native, uncompressed Pixel Data.");
    }
    const pixelCount = rows * cols;
    const bytesPerPixel = bitsAllocated / 8;
    if (pixelDataElement.length < pixelCount * bytesPerPixel) {
      throw new Error("DICOM Pixel Data is shorter than the declared image dimensions require.");
    }

    const shift = highBit + 1 - bitsStored;
    const valueMask = bitsStored === 16 ? 0xffff : (1 << bitsStored) - 1;
    const signBit = 1 << (bitsStored - 1);
    const rawPixels = new Float32Array(pixelCount);
    const slope = numberValue(dataSet, "x00281053", 1);
    const intercept = numberValue(dataSet, "x00281052", 0);

    for (let i = 0; i < pixelCount; i++) {
      let stored = bitsAllocated === 16 ? dataSet.uint16("x7fe00010", i) : dataSet.uint8("x7fe00010", i);
      stored = (stored >>> shift) & valueMask;
      if (pixelRepresentation === 1 && (stored & signBit)) stored -= 1 << bitsStored;
      rawPixels[i] = stored * slope + intercept;
    }

    let minPixel = Infinity;
    let maxPixel = -Infinity;
    for (let i = 0; i < rawPixels.length; i++) {
      minPixel = Math.min(minPixel, rawPixels[i]);
      maxPixel = Math.max(maxPixel, rawPixels[i]);
    }

    const windowCenter = numberValue(dataSet, "x00281050", (minPixel + maxPixel) / 2);
    const windowWidth = numberValue(dataSet, "x00281051", Math.max(1, maxPixel - minPixel));
    const spacing = stringValue(dataSet, "x00280030").split("\\").map(Number);
    const hasCalibratedSpacing = spacing.length >= 2 && spacing.every(Number.isFinite) && spacing[0] > 0 && spacing[1] > 0;
    const meta = {
      patientName: stringValue(dataSet, "x00100010", "ANONYMIZED"),
      patientID: stringValue(dataSet, "x00100020", "--"),
      studyDate: stringValue(dataSet, "x00080020", "--"),
      modality: stringValue(dataSet, "x00080060", "--"),
      bodyPart: stringValue(dataSet, "x00180015", "--"),
      kvp: stringValue(dataSet, "x00180060", "--"),
      photometric,
      rows,
      cols,
      pixelSpacing: hasCalibratedSpacing ? spacing.slice(0, 2) : [0, 0],
      hasCalibratedSpacing,
      bitsAllocated,
      bitsStored,
      pixelRepresentation,
      windowCenter,
      windowWidth,
      rescaleIntercept: intercept,
      rescaleSlope: slope,
      transferSyntax,
      minPixel: Math.round(minPixel),
      maxPixel: Math.round(maxPixel)
    };

    return { meta, rawPixels, width: cols, height: rows };
  }

  // DICOM PS3.3 C.11.2 LINEAR VOI LUT function, including its W=1 threshold case.
  function applyWindowLevel(rawPixels, windowCenter, windowWidth, invert = false) {
    const output = new Uint8Array(rawPixels.length);
    const width = Math.max(1, windowWidth);
    const center = windowCenter;
    const lower = center - 0.5 - (width - 1) / 2;
    const upper = center - 0.5 + (width - 1) / 2;
    for (let i = 0; i < rawPixels.length; i++) {
      const value = rawPixels[i];
      let mapped;
      if (width === 1) mapped = value <= center - 0.5 ? 0 : 255;
      else if (value <= lower) mapped = 0;
      else if (value > upper) mapped = 255;
      else mapped = Math.round(((value - (center - 0.5)) / (width - 1) + 0.5) * 255);
      output[i] = invert ? 255 - mapped : mapped;
    }
    return output;
  }

  return { isDicomBuffer, parse, applyWindowLevel };
})();
