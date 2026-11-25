/**
 * RadVision Clinical Presets & Built-in Sample Reference Sets
 */

const CLINICAL_PRESETS = [
  {
    id: "radiology_standard",
    name: "Radiology Gold Standard",
    description: "Balanced clinical enhancement combining CLAHE, edge-preserving bilateral filtering, and high-frequency unsharp masking.",
    icon: "fa-user-md",
    tag: "All-Round",
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
    id: "bone_fracture",
    name: "Bone & Fracture Focus",
    description: "Optimized for orthopedic evaluation: high-clip local contrast with Laplacian edge emphasis to reveal hairline fissures and trabecular architecture.",
    icon: "fa-bone",
    tag: "Orthopedic",
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
    id: "pulmonary_chest",
    name: "Pulmonary & Lung Field",
    description: "Tuned for chest radiography: Non-Local Means noise suppression and soft gamma curve compensation to expose subtle lung nodules and vascular markings.",
    icon: "fa-lungs",
    tag: "Pulmonology",
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
    id: "low_dose_denoise",
    name: "Low-Dose Quantum Mottle Cleanup",
    description: "Non-Local Means (NLM) Poisson filter to restore degraded, noisy scans from pediatric or portable low-dose X-ray equipment.",
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
    id: "thermal_density",
    name: "False-Color Density Map",
    description: "Converts continuous attenuation radiodensity into a calibrated perceptual pseudo-color heatmap (Inferno) to spot density anomalies.",
    icon: "fa-fire-flame-curved",
    tag: "Diagnostic Colormap",
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
      colormap: "inferno"
    }
  },
  {
    id: "bone_segmentation",
    name: "Otsu Anatomical Segmentation",
    description: "Calculates variance-optimal dynamic thresholding to segment high-density cortical bone and dental enamel from soft tissues.",
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
    id: "chest_pa_real_1",
    name: "Chest Radiograph (PA View 1)",
    type: "Chest PA",
    isDicom: false,
    condition: "Pulmonary vasculature & lung fields",
    recommended_preset: "pulmonary_chest",
    url: "/static/samples/chest_pa_real_1.jpg"
  },
  {
    id: "pelvis_ap_real_1",
    name: "Pelvis & Bilateral Hips (AP 1)",
    type: "Pelvis AP",
    isDicom: false,
    condition: "Acetabulum, sacrum & femoral necks",
    recommended_preset: "radiology_standard",
    url: "/static/samples/pelvis_ap_real_1.jpg"
  },
  {
    id: "chest_pa_real_2",
    name: "Chest Radiograph (PA View 2)",
    type: "Chest PA",
    isDicom: false,
    condition: "Hilar & mediastinal evaluation",
    recommended_preset: "pulmonary_chest",
    url: "/static/samples/chest_pa_real_2.jpg"
  },
  {
    id: "pelvis_ap_real_2",
    name: "Pelvis & Hip (AP View 2)",
    type: "Pelvis AP",
    isDicom: false,
    condition: "Right femoral neck & pelvic ring",
    recommended_preset: "bone_fracture",
    url: "/static/samples/pelvis_ap_real_2.jpg"
  },
  {
    id: "chest_lateral_real",
    name: "Chest Radiograph (Lateral)",
    type: "Chest Lat",
    isDicom: false,
    condition: "Thoracic spine & retrosternal space",
    recommended_preset: "pulmonary_chest",
    url: "/static/samples/chest_lateral_real.jpg"
  },
  {
    id: "femur_fracture_real",
    name: "Pelvis & Left Femur Fracture",
    type: "Trauma AP",
    isDicom: false,
    condition: "Displaced left femoral shaft fracture",
    recommended_preset: "bone_fracture",
    url: "/static/samples/femur_fracture_real.jpg"
  },
  {
    id: "chest_pa_real_3",
    name: "Chest Radiograph (Cardiothoracic)",
    type: "Chest PA",
    isDicom: false,
    condition: "Cardiac silhouette & CTR assessment",
    recommended_preset: "pulmonary_chest",
    url: "/static/samples/chest_pa_real_3.jpg"
  }
];
