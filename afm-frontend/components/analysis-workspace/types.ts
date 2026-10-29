export type UploadItem = {
  item_id: string;
  item_index: number;
  item_dir: string;
  saved_path: string;
  saved_filename: string;
  original_filename: string;
  mask_path: string;
  mask_filename: string;
  predicted_class: string;
  confidence: number;
  probabilities: Record<string, number>;
  cnn_model_name: string;
  unet_model_name: string;
  original_image_url: string;
  mask_image_url: string;
  preprocessed_image_url?: string;
  confidence_image_url?: string;
  avg_confidence?: number;
  min_confidence?: number;
  max_confidence?: number;
  mask_shape?: number[];
  // Share of feature (white) pixels in a binarized irregular mask.
  black_pixel_percent?: number | null;
  // Class the current mask was segmented for (an override can change it).
  segmented_class?: string;
  preprocessing?: {
    denoise: number;
    sharpen: number;
    grayscale: boolean;
    invert: boolean;
  };
  postprocessing?: {
    threshold: number;
    morphology: number;
    invert_mask: boolean;
  };
  job_id?: string;
  job_dir?: string;
};

export type UploadBatchResponse = {
  message: string;
  client_session_id: string;
  job_id: string;
  job_dir: string;
  batch_count: number;
  cnn_model_name: string;
  unet_model_name: string;
  items: UploadItem[];
};

export type MetricRow = {
  key: string;
  label: string;
  value: string;
};

export type StrokePoint = {
  x: number;
  y: number;
};

export const MASK_LAYER_ID = "__mask__";

export type MaskStroke = {
  id: string;
  tool: "draw" | "erase";
  brushSize: number;
  opacity: number;
  points: StrokePoint[];
  layerEdits?: Array<{
    tool: "draw" | "erase";
    brushSize: number;
    points: StrokePoint[];
  }>;
};

export type EditorSnapshot = {
  strokes: MaskStroke[];
  maskBase?: string;
  editedMask?: string;
  selectedLayerId: string;
};

export type ThemeMode = "light" | "dark" | "retro";

export type WorkspaceStep = "upload" | "review" | "results" | "export";

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Default" },
  { value: "dark", label: "Dark" },
  { value: "retro", label: "Retro 8-bit" },
];

export type DomainSpacing = {
  mean_spacing_nm: number;
  median_spacing_nm: number;
  std_spacing_nm: number;
  min_spacing_nm: number;
  max_spacing_nm: number;
  num_measurements: number;
  error?: string;
};

export type AnalysisResponse = {
  message: string;
  summary: string;
  job_id: string;
  job_dir: string;
  item_id: string;
  cnn_model_name: string;
  unet_model_name: string;
  predicted_class: string;
  confidence: number;
  probabilities: Record<string, number>;
  final_mask_path: string;
  final_mask_filename: string;
  original_filename: string;
  original_image_url: string;
  final_mask_url: string;
  extra1_url: string;
  extra2_url: string;
  extra3_url: string;
  extra4_url: string;
  extra1_note: string;
  extra2_note: string;
  extra3_note: string;
  extra4_note: string;
  domain_spacing?: DomainSpacing | null;
  domain_spacing_histogram_url?: string;
  domain_spacing_skeleton_url?: string;
  dot_extraction?: {
    total_components: number;
    kept_dots: number;
    rejected: number;
    dots_mask_url?: string;
  } | null;
  group_pixel_counts_text?: string;
  metrics: MetricRow[];
  raw_metrics?: MetricRow[];
  details: string;
  additional_outputs?: { label: string; url: string }[];
};

export type ViewerImage = {
  src: string;
  caption: string;
  label: string;
};

export type ResultOutput = {
  label: string;
  src: string;
  caption: string;
};

export type ModelListItem = {
  filename: string;
  is_active?: boolean;
  in_channels?: number;
  val_loss?: number | null;
  epoch?: number | null;
  size_mb?: number | null;
  use_attention_gates?: boolean;
  use_cbam?: boolean;
  self_attn_locations?: string[];
};

export type OutputSection = {
  title: string;
  helper: string;
  items: ResultOutput[];
};

export type ImageParams = {
  threshold: number;
  denoise: number;
  sharpen: number;
  morphology: number;
  grayscale: boolean;
  invertPixels: boolean;
  invertMask: boolean;
  // Binarization of irregular images (replaces the U-Net mask).
  binarizeAdaptive: boolean;
  binarizeNiblack: boolean;
  binarizeCombineMode: "OR" | "AND" | "adaptive" | "niblack" | "weighted";
  binarizeAlpha: number;
  binarizeK: number;
  binarizeNiblackWindow: number;
  binarizeAdaptiveMethod: "gaussian" | "mean";
  binarizeBlockSize: number;
  binarizeC: number;
  binarizeBlur: "none" | "gaussian" | "median" | "bilateral";
  binarizeBlurKsize: number;
  binarizeEqualize: boolean;
  binarizeClahe: boolean;
};

export const DEFAULT_IMAGE_PARAMS: ImageParams = {
  threshold: 0.5,
  denoise: 0,
  sharpen: 0,
  morphology: 0,
  grayscale: false,
  invertPixels: false,
  invertMask: false,
  binarizeAdaptive: true,
  binarizeNiblack: true,
  binarizeCombineMode: "OR",
  binarizeAlpha: 0.5,
  binarizeK: 0.1,
  binarizeNiblackWindow: 25,
  binarizeAdaptiveMethod: "gaussian",
  binarizeBlockSize: 11,
  binarizeC: 2,
  binarizeBlur: "none",
  binarizeBlurKsize: 5,
  binarizeEqualize: false,
  binarizeClahe: false,
};

export type AnalysisParams = {
  imageSizeUm: number;
  colorwheelClusters: number;
  showColorwheelDebug: boolean;
  voronoiThresholdEdge: number;
  voronoiMaxSize: number;
  voronoiPackingEdges: 4 | 6;
  voronoiExtractDots: boolean;
  minCircularity: number;
  maxAspectRatio: number;
  minArea: number;
  maxArea: number;
  irregularInvertSpacing: boolean;
};

export const DEFAULT_ANALYSIS_PARAMS: AnalysisParams = {
  imageSizeUm: 1.0,
  colorwheelClusters: 4,
  showColorwheelDebug: false,
  voronoiThresholdEdge: 0.25,
  voronoiMaxSize: 1024,
  voronoiPackingEdges: 6,
  voronoiExtractDots: true,
  minCircularity: 0.6,
  maxAspectRatio: 1.8,
  minArea: 0,
  maxArea: 1200,
  irregularInvertSpacing: false,
};
