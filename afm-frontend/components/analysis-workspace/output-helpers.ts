import type {
  AnalysisResponse,
  MaskStroke,
  OutputSection,
  ResultOutput,
  UploadItem,
} from "./types";

function getCurrentClass(
  currentAnalysis: AnalysisResponse | null,
  currentItem: UploadItem | null
) {
  return currentItem?.predicted_class || currentAnalysis?.predicted_class || "";
}

function pushOutput(outputs: ResultOutput[], label: string, src: string, caption: string) {
  const safeSrc = src?.trim();
  if (!safeSrc) return;
  outputs.push({ label, src: safeSrc, caption });
}

export function buildDisplayedOutputs(
  currentAnalysis: AnalysisResponse | null,
  currentItem: UploadItem | null
) {
  const outputs: ResultOutput[] = [];
  const currentClass = getCurrentClass(currentAnalysis, currentItem);
  const isLineFlow = currentClass === "lines";
  const isMixedFlow = currentClass === "mixed";
  const isDotFlow = currentClass === "dots";

  pushOutput(
    outputs,
    "Original",
    currentAnalysis?.original_image_url || currentItem?.original_image_url || "",
    currentAnalysis?.original_filename || currentItem?.saved_filename || "sample"
  );
  pushOutput(
    outputs,
    "Final Mask",
    currentAnalysis?.final_mask_url || "",
    currentAnalysis?.final_mask_filename || "binary_mask_final.png"
  );

  if (isDotFlow) {
    for (const item of currentAnalysis?.additional_outputs || []) {
      if (/Dots Only Mask/i.test(item.label)) {
        pushOutput(outputs, item.label, item.url, item.label);
      }
    }
  }

  if (!isLineFlow) {
    pushOutput(
      outputs,
      "Domain Spacing Histogram",
      currentAnalysis?.domain_spacing_histogram_url || "",
      "spacing_histogram.png"
    );
    pushOutput(
      outputs,
      "Domain Spacing Skeleton",
      currentAnalysis?.domain_spacing_skeleton_url || "",
      "spacing_skeleton_overlay.png"
    );
  }

  pushOutput(
    outputs,
    currentAnalysis?.extra1_note || "Output 1",
    currentAnalysis?.extra1_url || "",
    currentAnalysis?.extra1_note || "output_1.png"
  );

  if (!isLineFlow && !(isMixedFlow && /Morphology Map/i.test(currentAnalysis?.extra2_note || ""))) {
    pushOutput(
      outputs,
      currentAnalysis?.extra2_note || "Output 2",
      currentAnalysis?.extra2_url || "",
      currentAnalysis?.extra2_note || "output_2.png"
    );
  }

  if (!isDotFlow) {
    pushOutput(
      outputs,
      currentAnalysis?.extra3_note || "Output 3",
      currentAnalysis?.extra3_url || "",
      currentAnalysis?.extra3_note || "output_3.png"
    );
    pushOutput(
      outputs,
      currentAnalysis?.extra4_note || "Output 4",
      currentAnalysis?.extra4_url || "",
      currentAnalysis?.extra4_note || "output_4.png"
    );
  }

  for (const item of currentAnalysis?.additional_outputs || []) {
    if (/^FFT Magnitude$/i.test(item.label)) {
      continue;
    }
    if (isDotFlow && /Dots Only Mask/i.test(item.label)) continue;
    if (isMixedFlow && (/Dots Only Mask/i.test(item.label) || /Morphology Map/i.test(item.label))) {
      continue;
    }
    if (isLineFlow && !/^Phase Cluster /i.test(item.label)) continue;
    if (!isLineFlow && !isMixedFlow && /^Phase Cluster /i.test(item.label)) continue;
    pushOutput(outputs, item.label, item.url, item.label);
  }

  return outputs;
}

export function buildLineDiagnosticsOutputs(
  currentAnalysis: AnalysisResponse | null,
  currentItem: UploadItem | null,
  showColorwheelDebug: boolean
) {
  const outputs: ResultOutput[] = [];
  const currentClass = getCurrentClass(currentAnalysis, currentItem);
  if (!["lines", "mixed"].includes(currentClass)) return outputs;
  if (!showColorwheelDebug) return outputs;

  for (const item of currentAnalysis?.additional_outputs || []) {
    if (!/^FFT Magnitude$/i.test(item.label)) {
      continue;
    }
    const safeSrc = item.url?.trim();
    if (!safeSrc) continue;
    outputs.push({ label: item.label, src: safeSrc, caption: item.label });
  }

  return outputs;
}

export function buildOutputSections(
  displayedOutputs: ResultOutput[],
  lineDiagnosticsOutputs: ResultOutput[]
) {
  const sections: Record<string, OutputSection> = {
    core: {
      title: "Core Segmentation",
      helper: "Shared inputs that every downstream analysis branch starts from.",
      items: [],
    },
    spacing: {
      title: "Domain Spacing",
      helper: "Spacing-specific visual outputs derived from the selected mask.",
      items: [],
    },
    voronoi: {
      title: "Voronoi Stream",
      helper: "Dot extraction and Voronoi morphology outputs.",
      items: [],
    },
    colorwheel: {
      title: "Line Orientation Stream",
      helper: "Phase-map, FFT, and grain-segmentation outputs for lines and mixed images.",
      items: [],
    },
    irregular: {
      title: "Irregular Stream",
      helper: "Irregular-analysis outputs and spacing overlays for irregular morphologies.",
      items: [],
    },
    other: {
      title: "Additional Outputs",
      helper: "Supporting outputs that do not fit one of the main analysis branches.",
      items: [],
    },
  };

  const dedup = new Set<string>();
  const combinedOutputs = [...displayedOutputs, ...lineDiagnosticsOutputs];

  for (const output of combinedOutputs) {
    const key = `${output.label}::${output.src}`;
    if (!output.src || dedup.has(key)) continue;
    dedup.add(key);

    if (output.label === "Original" || output.label === "Final Mask") {
      sections.core.items.push(output);
    } else if (/^Domain Spacing /i.test(output.label)) {
      sections.spacing.items.push(output);
    } else if (/Voronoi|Morphology Map|Dots Only Mask/i.test(output.label)) {
      sections.voronoi.items.push(output);
    } else if (/Phase Image|FFT Magnitude|Radial FFT Profile|Phase Cluster/i.test(output.label)) {
      sections.colorwheel.items.push(output);
    } else if (/Binarized Image|Skeleton Overlay|Spacing Histogram/i.test(output.label)) {
      sections.irregular.items.push(output);
    } else {
      sections.other.items.push(output);
    }
  }

  return Object.values(sections).filter((section) => section.items.length > 0);
}

export function getImportantMetrics(
  currentAnalysis: AnalysisResponse | null,
  currentItem: UploadItem | null
) {
  const metrics = currentAnalysis?.metrics || [];
  const currentClass = getCurrentClass(currentAnalysis, currentItem);

  if (currentClass === "dots") {
    return metrics.filter((metric) =>
      ["grain_size", "periodicity", "average_group_area_um2"].includes(metric.key)
    );
  }

  if (currentClass === "mixed") {
    return metrics.filter((metric) =>
      [
        "grain_size",
        "periodicity",
        "average_group_area_um2",
        "orientation_angle_deg",
        "domain_spacing_nm",
      ].includes(metric.key)
    );
  }

  if (currentClass === "lines") {
    return metrics.filter((metric) => ["domain_spacing_nm"].includes(metric.key));
  }

  if (currentClass === "irregular") {
    return metrics.filter((metric) =>
      ["black_pixel_percent", "mean_spacing_nm", "median_spacing_nm", "std_spacing_nm"].includes(
        metric.key
      )
    );
  }

  return [];
}

export function buildMetricValueByKey(currentAnalysis: AnalysisResponse | null) {
  const entries = (currentAnalysis?.metrics || []).map((metric) => [metric.key, metric.value]);
  return Object.fromEntries(entries) as Record<string, string>;
}

export function getIrregularMethod(
  irregularUseAdaptive: boolean,
  irregularUseNiblack: boolean
) {
  if (irregularUseAdaptive && irregularUseNiblack) return "both";
  if (irregularUseAdaptive) return "adaptive";
  if (irregularUseNiblack) return "niblack";
  return "adaptive";
}

export function getSelectedItemStrokes(
  itemId: string | undefined,
  strokeHistoryMap: Record<string, MaskStroke[]>
) {
  return itemId ? strokeHistoryMap[itemId] || [] : [];
}
