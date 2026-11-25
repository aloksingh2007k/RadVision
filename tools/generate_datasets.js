/**
 * Generates four synthetic demonstration images in static/samples/.
 * Run once with `node tools/generate_datasets.js` when recreating those files.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SAMPLE_DIR = path.join(__dirname, "..", "static", "samples");
if (!fs.existsSync(SAMPLE_DIR)) fs.mkdirSync(SAMPLE_DIR, { recursive: true });

// Simple CRC32 for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function saveGrayscalePNG(filePath, grayBuf, width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(0, 9); // Grayscale
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const rawRows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    rawRows[y * (width + 1)] = 0; // Filter type 0
    for (let x = 0; x < width; x++) {
      rawRows[y * (width + 1) + 1 + x] = Math.min(255, Math.max(0, Math.round(grayBuf[y * width + x])));
    }
  }
  const compressed = zlib.deflateSync(rawRows);
  const png = Buffer.concat([
    sig,
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", compressed),
    makePngChunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(filePath, png);
}

function saveDicom16(filePath, pixels16, width, height, meta) {
  const parts = [];
  const preamble = Buffer.alloc(132, 0);
  preamble.write("DICM", 128, 4, "ascii");
  parts.push(preamble);

  const pushTag = (g, e, vr, bytes) => {
    const b = Buffer.alloc(8 + bytes.length);
    b.writeUInt16LE(g, 0);
    b.writeUInt16LE(e, 2);
    b.write(vr, 4, 2, "ascii");
    b.writeUInt16LE(bytes.length, 6);
    bytes.copy(b, 8);
    parts.push(b);
  };
  const padEven = (str) => (str.length % 2 === 1 ? str + " " : str);
  const u16 = (v) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v, 0);
    return b;
  };

  pushTag(0x0002, 0x0010, "UI", Buffer.from("1.2.840.10008.1.2.1\0", "ascii"));
  pushTag(0x0008, 0x0020, "DA", Buffer.from(padEven(meta.studyDate || "20261125")));
  pushTag(0x0008, 0x0060, "CS", Buffer.from(padEven(meta.modality || "DX")));
  pushTag(0x0010, 0x0010, "PN", Buffer.from(padEven(meta.patientName || "SYNTHETIC^DEMO")));
  pushTag(0x0010, 0x0020, "LO", Buffer.from(padEven(meta.patientID || "SAMPLE-001")));
  pushTag(0x0018, 0x0015, "CS", Buffer.from(padEven(meta.bodyPart || "CHEST")));
  pushTag(0x0018, 0x0060, "DS", Buffer.from(padEven(meta.kvp || "120")));
  pushTag(0x0028, 0x0004, "CS", Buffer.from(padEven("MONOCHROME2")));
  pushTag(0x0028, 0x0010, "US", u16(height));
  pushTag(0x0028, 0x0011, "US", u16(width));
  pushTag(0x0028, 0x0030, "DS", Buffer.from(padEven(meta.pixelSpacing || "0.143\\0.143")));
  pushTag(0x0028, 0x0100, "US", u16(16));
  pushTag(0x0028, 0x0101, "US", u16(12));
  pushTag(0x0028, 0x0103, "US", u16(0));
  pushTag(0x0028, 0x1050, "DS", Buffer.from(padEven(String(meta.windowCenter || 2048))));
  pushTag(0x0028, 0x1051, "DS", Buffer.from(padEven(String(meta.windowWidth || 4096))));

  const pixHeader = Buffer.alloc(12);
  pixHeader.writeUInt16LE(0x7fe0, 0);
  pixHeader.writeUInt16LE(0x0010, 2);
  pixHeader.write("OW", 4, 2, "ascii");
  pixHeader.writeUInt32LE(width * height * 2, 8);
  parts.push(pixHeader);

  const pixBuf = Buffer.alloc(width * height * 2);
  for (let i = 0; i < width * height; i++) {
    pixBuf.writeUInt16LE(Math.min(4095, Math.max(0, Math.round(pixels16[i]))), i * 2);
  }
  parts.push(pixBuf);

  fs.writeFileSync(filePath, Buffer.concat(parts));
}

// Drawing helpers on Float32Array
function drawEllipse(buf, w, h, cx, cy, rx, ry, val, alpha = 1.0) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1.0) {
        const idx = y * w + x;
        buf[idx] = buf[idx] * (1 - alpha) + val * alpha;
      }
    }
  }
}

function addNoise(buf, sigma) {
  for (let i = 0; i < buf.length; i++) {
    // Box-Muller approximate Gaussian noise
    const u = (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
    buf[i] += u * sigma;
  }
}

// 1. Generate 16-bit DICOM: Chest Cardiomegaly & Pleural Effusion (512x512)
function makeChestCardiomegalyDicom() {
  const w = 512, h = 512;
  const buf = new Float32Array(w * h).fill(280);

  // Thoracic soft tissue & spine
  drawEllipse(buf, w, h, 256, 260, 210, 230, 950, 0.7);
  for (let y = 30; y < 480; y += 26) {
    drawEllipse(buf, w, h, 256, y, 22, 11, 2400, 0.85);
  }

  // Radiolucent lung fields
  drawEllipse(buf, w, h, 155, 235, 72, 145, 420, 0.9);
  drawEllipse(buf, w, h, 357, 235, 68, 140, 420, 0.9);

  // Enlarged cardiac silhouette (Cardiomegaly CTR > 0.55)
  drawEllipse(buf, w, h, 275, 305, 118, 78, 2250, 0.92);

  // Ribs
  for (let i = 0; i < 8; i++) {
    const ry = 95 + i * 38;
    drawEllipse(buf, w, h, 160, ry, 78, 6, 2550, 0.45);
    drawEllipse(buf, w, h, 352, ry, 78, 6, 2550, 0.45);
  }

  // Right lower-zone subtle pleural effusion / opacity
  drawEllipse(buf, w, h, 140, 345, 48, 35, 1450, 0.65);

  addNoise(buf, 55);
  saveDicom16(path.join(SAMPLE_DIR, "chest_cardiomegaly_16bit.dcm"), buf, w, h, {
    patientName: "SYNTHETIC^CHEST",
    patientID: "SAMPLE-CHEST-512",
    modality: "DX",
    bodyPart: "CHEST",
    kvp: "120",
    pixelSpacing: "0.143\\0.143",
    windowCenter: 1550,
    windowWidth: 2600
  });
}

// 2. Generate 16-bit DICOM: Spine Scoliosis AP (512x512)
function makeSpineScoliosisDicom() {
  const w = 512, h = 512;
  const buf = new Float32Array(w * h).fill(220);

  // Trunk soft tissue
  drawEllipse(buf, w, h, 256, 256, 175, 250, 780, 0.85);

  // Curved scoliotic thoracic/lumbar spine (S-curve)
  for (let i = 0; i < 14; i++) {
    const y = 55 + i * 31;
    const xOffset = Math.sin(i * 0.42) * 34;
    const cx = 256 + xOffset;
    // Vertebral body
    drawEllipse(buf, w, h, cx, y, 28, 12, 2750, 0.95);
    // Spinous process
    drawEllipse(buf, w, h, cx, y + 2, 6, 10, 3200, 0.9);
    // Transverse processes
    drawEllipse(buf, w, h, cx - 32, y, 10, 5, 2400, 0.8);
    drawEllipse(buf, w, h, cx + 32, y, 10, 5, 2400, 0.8);
  }

  addNoise(buf, 48);
  saveDicom16(path.join(SAMPLE_DIR, "spine_scoliosis_16bit.dcm"), buf, w, h, {
    patientName: "SYNTHETIC^SPINE",
    patientID: "SAMPLE-SPINE-512",
    modality: "CR",
    bodyPart: "THORACIC SPINE",
    kvp: "85",
    pixelSpacing: "0.175\\0.175",
    windowCenter: 1650,
    windowWidth: 2800
  });
}

// 3. Generate Pelvis & Hip AP PNG (512x512)
function makePelvisHipPng() {
  const w = 512, h = 512;
  const buf = new Float32Array(w * h).fill(24);

  // Pelvic soft tissue
  drawEllipse(buf, w, h, 256, 256, 225, 210, 52, 0.8);
  // Sacrum
  drawEllipse(buf, w, h, 256, 185, 36, 75, 165, 0.9);
  // Iliac wings
  drawEllipse(buf, w, h, 145, 175, 68, 82, 155, 0.85);
  drawEllipse(buf, w, h, 367, 175, 68, 82, 155, 0.85);
  // Pelvic ring cavity (dark air/soft tissue)
  drawEllipse(buf, w, h, 256, 265, 74, 52, 42, 0.9);
  // Femoral heads & necks
  drawEllipse(buf, w, h, 138, 325, 26, 26, 205, 0.95);
  drawEllipse(buf, w, h, 374, 325, 26, 26, 205, 0.95);
  // Femur shafts
  drawEllipse(buf, w, h, 112, 420, 22, 95, 185, 0.95);
  drawEllipse(buf, w, h, 400, 420, 22, 95, 185, 0.95);

  addNoise(buf, 8);
  saveGrayscalePNG(path.join(SAMPLE_DIR, "pelvis_hip_ap.png"), buf, w, h);
}

// 4. Generate Foot & Ankle Lateral PNG (512x512)
function makeAnkleFootPng() {
  const w = 512, h = 512;
  const buf = new Float32Array(w * h).fill(20);

  // Tibia & Fibula distal
  drawEllipse(buf, w, h, 180, 120, 24, 125, 180, 0.95);
  drawEllipse(buf, w, h, 198, 125, 12, 120, 165, 0.9);
  // Talus
  drawEllipse(buf, w, h, 195, 275, 34, 24, 190, 0.95);
  // Calcaneus (heel)
  drawEllipse(buf, w, h, 155, 330, 52, 30, 185, 0.95);
  // Tarsals & Metatarsals
  drawEllipse(buf, w, h, 265, 315, 48, 22, 175, 0.95);
  drawEllipse(buf, w, h, 345, 340, 55, 14, 170, 0.95);
  // Phalanges
  drawEllipse(buf, w, h, 425, 352, 30, 10, 155, 0.9);

  addNoise(buf, 7);
  saveGrayscalePNG(path.join(SAMPLE_DIR, "foot_ankle_lateral.png"), buf, w, h);
}

console.log("Generating synthetic DICOM and PNG demonstration images...");
makeChestCardiomegalyDicom();
makeSpineScoliosisDicom();
makePelvisHipPng();
makeAnkleFootPng();
console.log("Generated demonstration images in static/samples/");
