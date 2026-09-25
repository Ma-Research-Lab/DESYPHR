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

export type ThemeMode = "dark" | "light";

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
