/**
 * RadVision enhancement presets and generated sample images
 */

const IMAGE_PRESETS = [
  {
    id: "balanced",
    name: "Balanced Enhancement",
    description: "Combines local contrast adjustment, edge-preserving smoothing, and mild sharpening.",
    icon: "fa-sliders",
    tag: "General",
    pipeline: {
      denoise_method: "bilateral",
      bilateral_d: 7,
      bilateral_sigma_color: 50,
      bilateral_sigma_space: 50,
      contrast_method: "clahe",
      clahe_clip: 2.5,
      clahe_grid: 8,
      gamma: 1.0,
      sharpen_method: "unsharp",
      unsharp_strength: 1.2,
      unsharp_sigma: 1.2,
      colormap: "monochrome"
    }
  },
  {
    id: "edge_detail",
    name: "Edge Detail",
    description: "Applies stronger local contrast and edge emphasis for visual comparison.",
    icon: "fa-border-all",
    tag: "Detail",
    pipeline: {
      denoise_method: "median",
      median_ksize: 3,
      contrast_method: "clahe",
      clahe_clip: 3.6,
      clahe_grid: 4,
      gamma: 1.15,
      sharpen_method: "laplacian",
      laplacian_strength: 0.55,
      colormap: "monochrome"
    }
  },
  {
    id: "noise_contrast",
    name: "Noise & Contrast",
    description: "Applies non-local means smoothing, local contrast, and a mild tone adjustment.",
    icon: "fa-wave-square",
    tag: "Smoothing",
    pipeline: {
      denoise_method: "nlm",
      nlm_h: 7.0,
      contrast_method: "clahe",
      clahe_clip: 2.0,
      clahe_grid: 12,
      gamma: 0.88,
      sharpen_method: "unsharp",
      unsharp_strength: 0.95,
      unsharp_sigma: 1.5,
      colormap: "monochrome"
    }
  },
  {
    id: "noise_reduction",
    name: "Noise Reduction",
    description: "Applies non-local means smoothing with local contrast adjustment.",
    icon: "fa-shield-halved",
    tag: "Noise Reduction",
    pipeline: {
      denoise_method: "nlm",
      nlm_h: 12.0,
      contrast_method: "clahe",
      clahe_clip: 1.8,
      clahe_grid: 8,
      gamma: 1.0,
      sharpen_method: "none",
      colormap: "monochrome"
    }
  },
  {
    id: "bone_tone_map",
    name: "Bone Tone Map",
    description: "Applies the Bone display palette with local contrast adjustment.",
    icon: "fa-palette",
    tag: "Display",
    pipeline: {
      denoise_method: "bilateral",
      bilateral_d: 5,
      bilateral_sigma_color: 40,
      bilateral_sigma_space: 40,
      contrast_method: "clahe",
      clahe_clip: 2.8,
      clahe_grid: 8,
      gamma: 1.0,
      sharpen_method: "unsharp",
      unsharp_strength: 1.0,
      unsharp_sigma: 1.2,
      colormap: "bone"
    }
  },
  {
    id: "threshold_preview",
    name: "Threshold Preview",
    description: "Shows a simple global thresholding result for algorithm demonstrations.",
    icon: "fa-circle-half-stroke",
    tag: "Segmentation",
    pipeline: {
      denoise_method: "gaussian",
      gaussian_sigma: 1.2,
      contrast_method: "clahe",
      clahe_clip: 2.0,
      clahe_grid: 8,
      gamma: 1.0,
      sharpen_method: "otsu",
      colormap: "monochrome"
    }
  }
];

const SAMPLE_XRAYS = [
  {
    id: "chest_cardiomegaly_16bit",
    name: "Synthetic chest pattern (16-bit)",
    type: "Synthetic DICOM",
    isDicom: true,
    condition: "Generated locally by the sample generator",
    recommended_preset: "balanced",
    url: "/static/samples/chest_cardiomegaly_16bit.dcm"
  },
  {
    id: "spine_scoliosis_16bit",
    name: "Synthetic spine pattern (16-bit)",
    type: "Synthetic DICOM",
    isDicom: true,
    condition: "Generated locally by the sample generator",
    recommended_preset: "edge_detail",
    url: "/static/samples/spine_scoliosis_16bit.dcm"
  },
  {
    id: "pelvis_hip_ap",
    name: "Synthetic pelvis pattern",
    type: "Synthetic PNG",
    isDicom: false,
    condition: "Generated locally by the sample generator",
    recommended_preset: "balanced",
    url: "/static/samples/pelvis_hip_ap.png"
  },
  {
    id: "foot_ankle_lateral",
    name: "Synthetic foot pattern",
    type: "Synthetic PNG",
    isDicom: false,
    condition: "Generated locally by the sample generator",
    recommended_preset: "edge_detail",
    url: "/static/samples/foot_ankle_lateral.png"
  }
];
