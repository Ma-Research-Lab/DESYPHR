"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BACKEND_URL,
  CANVAS_SIZE,
  createLocalPreviewUrl,
  createStrokeId,
  downloadBlob,
  getInitialThemeMode,
  getOrCreateClientSessionId,
  isBackendReachable,
} from "./analysis-workspace/helpers";
import {
  WorkspaceHeader,
  WorkspaceStageTabs,
  WorkspaceStepper,
} from "./analysis-workspace/header";
import {
  buildDisplayedOutputs,
  buildLineDiagnosticsOutputs,
  buildMetricValueByKey,
  buildOutputSections,
  getImportantMetrics,
  getIrregularMethod,
  getSelectedItemStrokes,
} from "./analysis-workspace/output-helpers";
import {
  GlobalWorkspaceStyles,
  ImageViewerModal,
  WorkspaceFooter,
} from "./analysis-workspace/layout";
import {
  ExportStage,
  ResultsStage,
  UploadStage,
} from "./analysis-workspace/stages";
import type {
  AnalysisResponse,
  EditorSnapshot,
  MaskStroke,
  ModelListItem,
  OutputSection,
  ResultOutput,
  StrokePoint,
  ThemeMode,
  UploadBatchResponse,
  UploadItem,
  ViewerImage,
} from "./analysis-workspace/types";
import { MASK_LAYER_ID } from "./analysis-workspace/types";

export default function AnalysisWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);
  const currentStrokeRef = useRef<MaskStroke | null>(null);
  const segmentationUpdateKeyRef = useRef("");
  const analysisUpdateKeyRef = useRef("");
  const selectedLayerIdRef = useRef(MASK_LAYER_ID);
  const flashLayerIdRef = useRef("");

  const [clientSessionId, setClientSessionId] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFilePreviewUrls, setSelectedFilePreviewUrls] = useState<string[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [batchData, setBatchData] = useState<UploadBatchResponse | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [analysisMap, setAnalysisMap] = useState<Record<string, AnalysisResponse>>(
    {}
  );
  const [editedMaskMap, setEditedMaskMap] = useState<Record<string, string>>({});
  const [maskBaseMap, setMaskBaseMap] = useState<Record<string, string>>({});

  const [status, setStatus] = useState(
    "Ready. Upload one or more AFM images to begin."
  );
  const [activeTab, setActiveTab] = useState<"upload" | "results" | "export">("upload");
  const [toolMode, setToolMode] = useState<"draw" | "erase">("draw");
  const [brushSize, setBrushSize] = useState(10);
  const [maskOverlayOpacity, setMaskOverlayOpacity] = useState(0.6);
  const [maskMode, setMaskMode] = useState<"use" | "edit">("edit");
  const [imageSizeUm, setImageSizeUm] = useState(1.0);
  const [threshold, setThreshold] = useState(0.5);
  const [denoise, setDenoise] = useState(0);
  const [sharpen, setSharpen] = useState(0);
  const [morphology, setMorphology] = useState(0);
  const [grayscale, setGrayscale] = useState(false);
  const [invertPixels, setInvertPixels] = useState(false);
  const [invertMask, setInvertMask] = useState(false);
  const [showAdvancedImageOptions, setShowAdvancedImageOptions] = useState(false);
  const [colorwheelClusters, setColorwheelClusters] = useState(5);
  const [showColorwheelDebug, setShowColorwheelDebug] = useState(false);
  const [voronoiThresholdEdge, setVoronoiThresholdEdge] = useState(0.25);
  const [voronoiMaxSize, setVoronoiMaxSize] = useState(1024);
  const [voronoiPackingEdges, setVoronoiPackingEdges] = useState<4 | 6>(6);
  const [voronoiExtractDots, setVoronoiExtractDots] = useState(true);
  const [minCircularity, setMinCircularity] = useState(0.6);
  const [maxAspectRatio, setMaxAspectRatio] = useState(1.8);
  const [minArea, setMinArea] = useState(15);
  const [maxArea, setMaxArea] = useState(1200);
  const [showAdvancedAnalysisOptions, setShowAdvancedAnalysisOptions] = useState(false);
  const [irregularUseAdaptive, setIrregularUseAdaptive] = useState(true);
  const [irregularUseNiblack, setIrregularUseNiblack] = useState(true);
  const [irregularCombineMode, setIrregularCombineMode] = useState<"OR" | "AND" | "adaptive" | "niblack" | "weighted">("OR");
  const [irregularAlpha, setIrregularAlpha] = useState(0.5);
  const [irregularKValue, setIrregularKValue] = useState(0.1);
  const [irregularNiblackWindow, setIrregularNiblackWindow] = useState(25);
  const [irregularAdaptiveMethod, setIrregularAdaptiveMethod] = useState<"gaussian" | "mean">("gaussian");
  const [irregularAdaptiveBlockSize, setIrregularAdaptiveBlockSize] = useState(11);
  const [irregularCValue, setIrregularCValue] = useState(2);
  const [irregularBlur, setIrregularBlur] = useState<"none" | "gaussian" | "median" | "bilateral">("none");
  const [irregularBlurKsize, setIrregularBlurKsize] = useState(5);
  const [irregularEqualize, setIrregularEqualize] = useState(false);
  const [irregularClahe, setIrregularClahe] = useState(false);
  const [irregularInvertSpacing, setIrregularInvertSpacing] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [strokeHistoryMap, setStrokeHistoryMap] = useState<Record<string, MaskStroke[]>>({});
  const [editorHistoryMap, setEditorHistoryMap] = useState<Record<string, EditorSnapshot[]>>({});
  const [editorFutureMap, setEditorFutureMap] = useState<Record<string, EditorSnapshot[]>>({});
  const [selectedLayerId, setSelectedLayerId] = useState<string>(MASK_LAYER_ID);
  const [flashLayerId, setFlashLayerId] = useState<string>("");
  const [viewerImage, setViewerImage] = useState<ViewerImage | null>(null);
  const [models, setModels] = useState<ModelListItem[]>([]);
  const [activeModel, setActiveModel] = useState<string>("");
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [classificationOverrides, setClassificationOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    setClientSessionId(getOrCreateClientSessionId());
    setThemeMode(getInitialThemeMode());
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/models`);
      if (!res.ok) return;
      const data = await res.json();
      setModels(Array.isArray(data.models) ? data.models : []);
      setActiveModel(data.active_model || "");
    } catch (error) {
      console.warn("Failed to fetch model list", error);
    }
  }, []);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("afm_theme_mode", themeMode);
    document.documentElement.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    let disposed = false;
    let previewUrls: string[] = [];

    const loadPreviewUrls = async () => {
      const nextUrls = await Promise.all(
        selectedFiles.map((file) => createLocalPreviewUrl(file))
      );

      if (disposed) {
        nextUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      previewUrls = nextUrls;
      setSelectedFilePreviewUrls(nextUrls);
    };

    void loadPreviewUrls();

    return () => {
      disposed = true;
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedFiles]);

  const setFilesFromInput = (files: File[], append = true) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/tiff"]);
    const filtered = files.filter(
      (file) =>
        allowed.has(file.type) ||
        /\.(jpe?g|png|tiff?)$/i.test(file.name)
    );
    setSelectedFiles((prev) => {
      const next = append ? [...prev, ...filtered] : filtered;
      const dedup = new Map<string, File>();
      for (const f of next) {
        dedup.set(`${f.name}__${f.size}__${f.lastModified}`, f);
      }
      return Array.from(dedup.values());
    });
  };

  const displayBatchData = useMemo(() => {
    if (!batchData) return null;
    return {
      ...batchData,
      items: batchData.items.map((item) => ({
        ...item,
        predicted_class: classificationOverrides[item.item_id] ?? item.predicted_class,
      })),
    };
  }, [batchData, classificationOverrides]);

  const currentItem = useMemo(() => {
    if (!displayBatchData?.items?.length) return null;
    return displayBatchData.items.find((item) => item.item_id === selectedItemId) || displayBatchData.items[0];
  }, [displayBatchData, selectedItemId]);

  const classifierClass = useMemo(() => {
    if (!batchData || !currentItem) return "";
    return batchData.items.find((item) => item.item_id === currentItem.item_id)?.predicted_class || "";
  }, [batchData, currentItem]);

  const handleClassificationOverride = useCallback((itemId: string, predictedClass: string) => {
    const classifierPrediction = batchData?.items.find((item) => item.item_id === itemId)?.predicted_class;
    setClassificationOverrides((previous) => {
      const next = { ...previous };
      if (!classifierPrediction || predictedClass === classifierPrediction) {
        delete next[itemId];
      } else {
        next[itemId] = predictedClass;
      }
      return next;
    });
    setAnalysisMap((previous) => {
      const next = { ...previous };
      delete next[itemId];
      return next;
    });
    setStatus("Classification override saved. Run analysis to apply it.");
  }, [batchData]);

  useEffect(() => {
    setShowAdvancedAnalysisOptions(false);
  }, [activeTab, currentItem?.item_id]);

  const currentAnalysis = useMemo(() => {
    if (!currentItem) return null;
    return analysisMap[currentItem.item_id] || null;
  }, [analysisMap, currentItem]);

  const activeModelItem = useMemo(
    () => models.find((model) => model.filename === activeModel) || null,
    [activeModel, models]
  );

  const displayedOutputs = useMemo<ResultOutput[]>(
    () => buildDisplayedOutputs(currentAnalysis, currentItem),
    [currentAnalysis, currentItem]
  );

  const lineDiagnosticsOutputs = useMemo<ResultOutput[]>(
    () => buildLineDiagnosticsOutputs(currentAnalysis, currentItem, showColorwheelDebug),
    [currentAnalysis, currentItem, showColorwheelDebug]
  );

  const outputSections = useMemo<OutputSection[]>(
    () => buildOutputSections(displayedOutputs, lineDiagnosticsOutputs),
    [displayedOutputs, lineDiagnosticsOutputs]
  );

  const importantMetrics = useMemo(
    () => getImportantMetrics(currentAnalysis, currentItem),
    [currentAnalysis, currentItem]
  );

  const metricValueByKey = useMemo(
    () => buildMetricValueByKey(currentAnalysis),
    [currentAnalysis]
  );

  const irregularMethod = useMemo(
    () => getIrregularMethod(irregularUseAdaptive, irregularUseNiblack),
    [irregularUseAdaptive, irregularUseNiblack]
  );

  const selectedItemStrokes = useMemo(
    () => getSelectedItemStrokes(currentItem?.item_id, strokeHistoryMap),
    [currentItem?.item_id, strokeHistoryMap]
  );

  const currentStep =
    activeTab === "export" ? 4 : Object.keys(analysisMap).length > 0 ? 3 : currentItem ? 2 : 1;

  const getCanvasContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  };

  const getCanvasDataUrl = () => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    return canvas.toDataURL("image/png");
  };

  const drawStrokeToContext = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: MaskStroke) => {
      if (!stroke.points.length) return;

      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = CANVAS_SIZE;
      layerCanvas.height = CANVAS_SIZE;
      const layerCtx = layerCanvas.getContext("2d");
      if (!layerCtx) return;

      const paintPath = (
        targetCtx: CanvasRenderingContext2D,
        points: StrokePoint[],
        size: number,
        color: string
      ) => {
        targetCtx.save();
        targetCtx.strokeStyle = color;
        targetCtx.fillStyle = color;
        targetCtx.lineWidth = size;
        targetCtx.lineCap = "round";
        targetCtx.lineJoin = "round";

        if (points.length === 1) {
          const point = points[0];
          targetCtx.beginPath();
          targetCtx.arc(point.x, point.y, Math.max(size / 2, 1), 0, Math.PI * 2);
          targetCtx.fill();
        } else {
          targetCtx.beginPath();
          targetCtx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i += 1) {
            targetCtx.lineTo(points[i].x, points[i].y);
          }
          targetCtx.stroke();
        }
        targetCtx.restore();
      };

      const paintHighlight = (
        targetCtx: CanvasRenderingContext2D,
        points: StrokePoint[],
        size: number,
        color: string
      ) => {
        if (!points.length) return;
        targetCtx.save();
        targetCtx.strokeStyle = color;
        targetCtx.fillStyle = color;
        targetCtx.lineWidth = size + 6;
        targetCtx.lineCap = "round";
        targetCtx.lineJoin = "round";
        targetCtx.shadowColor = color;
        targetCtx.shadowBlur = 12;
        targetCtx.globalAlpha = 0.95;

        if (points.length === 1) {
          const point = points[0];
          targetCtx.beginPath();
          targetCtx.arc(point.x, point.y, Math.max((size + 6) / 2, 3), 0, Math.PI * 2);
          targetCtx.stroke();
        } else {
          targetCtx.beginPath();
          targetCtx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i += 1) {
            targetCtx.lineTo(points[i].x, points[i].y);
          }
          targetCtx.stroke();
        }
        targetCtx.restore();
      };

      paintPath(layerCtx, stroke.points, stroke.brushSize, stroke.tool === "draw" ? "black" : "white");

      for (const edit of stroke.layerEdits || []) {
        if (!edit.points.length) continue;
        if (edit.tool === "erase") {
          layerCtx.save();
          layerCtx.globalCompositeOperation = "destination-out";
          paintPath(layerCtx, edit.points, edit.brushSize, "rgba(0,0,0,1)");
          layerCtx.restore();
        } else {
          paintPath(layerCtx, edit.points, edit.brushSize, "black");
        }
      }

      ctx.save();
      ctx.globalAlpha = stroke.opacity;
      ctx.drawImage(layerCanvas, 0, 0);
      ctx.restore();

      const isHighlighted = stroke.id === flashLayerIdRef.current;
      if (isHighlighted) {
        paintHighlight(ctx, stroke.points, stroke.brushSize, "rgba(0,212,255,0.95)");
      }
    },
    []
  );

  const cloneStroke = useCallback(
    (stroke: MaskStroke): MaskStroke => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
      layerEdits: (stroke.layerEdits || []).map((edit) => ({
        ...edit,
        points: edit.points.map((point) => ({ ...point })),
      })),
    }),
    []
  );

  const isStrokeLayerEmpty = useCallback(
    (stroke: MaskStroke) => {
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = CANVAS_SIZE;
      layerCanvas.height = CANVAS_SIZE;
      const layerCtx = layerCanvas.getContext("2d", { willReadFrequently: true });
      if (!layerCtx) return false;

      drawStrokeToContext(layerCtx, stroke);
      const alphaData = layerCtx.getImageData(0, 0, layerCanvas.width, layerCanvas.height).data;
      for (let i = 3; i < alphaData.length; i += 4) {
        if (alphaData[i] > 0) return false;
      }
      return true;
    },
    [drawStrokeToContext]
  );

  const pushEditorSnapshot = useCallback(
    (itemId: string, override?: Partial<EditorSnapshot>) => {
      setEditorHistoryMap((prev) => {
        const snapshot: EditorSnapshot = {
          strokes: (strokeHistoryMap[itemId] || []).map(cloneStroke),
          maskBase: maskBaseMap[itemId],
          editedMask: editedMaskMap[itemId],
          selectedLayerId,
          ...override,
        };
        return {
          ...prev,
          [itemId]: [...(prev[itemId] || []), snapshot],
        };
      });
      setEditorFutureMap((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    },
    [cloneStroke, editedMaskMap, maskBaseMap, selectedLayerId, strokeHistoryMap]
  );

  const getCurrentEditorSnapshot = useCallback(
    (itemId: string, override?: Partial<EditorSnapshot>): EditorSnapshot => ({
      strokes: (strokeHistoryMap[itemId] || []).map(cloneStroke),
      maskBase: maskBaseMap[itemId],
      editedMask: editedMaskMap[itemId],
      selectedLayerId,
      ...override,
    }),
    [cloneStroke, editedMaskMap, maskBaseMap, selectedLayerId, strokeHistoryMap]
  );

  const loadMaskToCanvas = useCallback((src: string, strokes: MaskStroke[] = [], itemId?: string, persist = true) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      strokes.forEach((stroke) => drawStrokeToContext(ctx, stroke));

      if (itemId && persist) {
        const dataUrl = canvas.toDataURL("image/png");
        setEditedMaskMap((prev) => ({
          ...prev,
          [itemId]: dataUrl,
        }));
      }
    };
    img.src = src;
  }, [drawStrokeToContext]);

  const saveCurrentCanvasForItem = (itemId?: string) => {
    if (!itemId || !canvasRef.current) return;
    if (maskMode !== "edit") return;

    const dataUrl = getCanvasDataUrl();
    if (!dataUrl) return;

    setEditedMaskMap((prev) => ({
      ...prev,
      [itemId]: dataUrl,
    }));
  };

  useEffect(() => {
    if (!currentItem?.item_id) return;

    const strokes = strokeHistoryMap[currentItem.item_id] || [];
    const sourceImage = maskBaseMap[currentItem.item_id] || currentItem.mask_image_url;
    if (sourceImage) {
      loadMaskToCanvas(sourceImage, strokes, currentItem.item_id);
    }

    setStrokeCount(strokes.length);
    setMaskMode("edit");
  }, [currentItem?.item_id, currentItem?.mask_image_url, loadMaskToCanvas, maskBaseMap, strokeHistoryMap]);

  useEffect(() => {
    if (!currentItem?.item_id) return;
    setSelectedLayerId(MASK_LAYER_ID);
  }, [currentItem?.item_id]);

  useEffect(() => {
    if (activeTab !== "upload" || !currentItem?.item_id) return;
    const strokes = strokeHistoryMap[currentItem.item_id] || [];
    const sourceImage = maskBaseMap[currentItem.item_id] || currentItem.mask_image_url;
    if (!sourceImage) return;

    const raf = window.requestAnimationFrame(() => {
      loadMaskToCanvas(sourceImage, strokes, currentItem.item_id);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeTab, currentItem?.item_id, currentItem?.mask_image_url, loadMaskToCanvas, maskBaseMap, strokeHistoryMap]);

  useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId;
    flashLayerIdRef.current = flashLayerId;

    if (activeTab !== "upload" || !currentItem?.item_id || !currentItem.mask_image_url) return;
    const strokes = strokeHistoryMap[currentItem.item_id] || [];
    loadMaskToCanvas(maskBaseMap[currentItem.item_id] || currentItem.mask_image_url, strokes, undefined, false);
  }, [
    activeTab,
    currentItem?.item_id,
    currentItem?.mask_image_url,
    flashLayerId,
    loadMaskToCanvas,
    maskBaseMap,
    selectedLayerId,
    strokeHistoryMap,
  ]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (maskMode !== "edit") return;
    isDrawingRef.current = true;
    const point = getCanvasPoint(e);
    const ctx = getCanvasContext();
    if (!point || !ctx) return;

    if (toolMode === "erase" && selectedLayerId && selectedLayerId !== MASK_LAYER_ID) {
      currentStrokeRef.current = {
        id: selectedLayerId,
        tool: "erase",
        brushSize,
        opacity: 1,
        points: [point],
      };
      const baseImage = maskBaseMap[currentItem?.item_id || ""] || currentItem?.mask_image_url || "";
      const existingStrokes = strokeHistoryMap[currentItem?.item_id || ""] || [];
      const previewStrokes = existingStrokes.map((layer) =>
        layer.id === selectedLayerId
          ? {
              ...layer,
              layerEdits: [
                ...(layer.layerEdits || []),
                {
                  tool: "erase" as const,
                  brushSize,
                  points: [point],
                },
              ],
            }
          : layer
      );
      if (baseImage) {
        loadMaskToCanvas(baseImage, previewStrokes, undefined, false);
      }
      return;
    }

    if (toolMode === "erase") {
      const baseImage = maskBaseMap[currentItem?.item_id || ""] || currentItem?.mask_image_url || "";
      if (baseImage) {
        currentStrokeRef.current = {
          id: MASK_LAYER_ID,
          tool: "erase",
          brushSize,
          opacity: 1,
          points: [point],
        };
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "white";
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(brushSize / 2, 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      return;
    }

    const stroke: MaskStroke = {
      id: createStrokeId(),
      tool: "draw",
      brushSize,
      opacity: 1,
      points: [point],
      layerEdits: [],
    };

    currentStrokeRef.current = stroke;
    drawStrokeToContext(ctx, stroke);
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    if (currentItem?.item_id && maskMode === "edit") {
      const finishedStroke = currentStrokeRef.current;
      currentStrokeRef.current = null;

      if (finishedStroke?.points.length) {
        pushEditorSnapshot(currentItem.item_id);
        if (finishedStroke.id === MASK_LAYER_ID) {
          const dataUrl = getCanvasDataUrl();
          if (dataUrl) {
            setMaskBaseMap((prev) => ({
              ...prev,
              [currentItem.item_id]: dataUrl,
            }));
          }
        } else if (finishedStroke.id === selectedLayerId && finishedStroke.tool === "erase") {
          setStrokeHistoryMap((prev) => {
            const nextStrokes = (prev[currentItem.item_id] || [])
              .map((stroke) =>
                stroke.id === selectedLayerId
                  ? {
                      ...stroke,
                      layerEdits: [
                        ...(stroke.layerEdits || []),
                        {
                          tool: finishedStroke.tool,
                          brushSize: finishedStroke.brushSize,
                          points: finishedStroke.points,
                        },
                      ],
                    }
                  : stroke
              )
              .filter((stroke) => !isStrokeLayerEmpty(stroke));
            setStrokeCount(nextStrokes.length);
            return {
              ...prev,
              [currentItem.item_id]: nextStrokes,
            };
          });
          setSelectedLayerId((prev) => {
            const selectedStroke = (strokeHistoryMap[currentItem.item_id] || []).find((stroke) => stroke.id === prev);
            if (!selectedStroke) return MASK_LAYER_ID;
            const updatedStroke: MaskStroke = {
              ...selectedStroke,
              layerEdits: [
                ...(selectedStroke.layerEdits || []),
                {
                  tool: finishedStroke.tool,
                  brushSize: finishedStroke.brushSize,
                  points: finishedStroke.points,
                },
              ],
            };
            return isStrokeLayerEmpty(updatedStroke) ? MASK_LAYER_ID : prev;
          });
        } else {
          setStrokeHistoryMap((prev) => {
            const nextStrokes = [...(prev[currentItem.item_id] || []), finishedStroke];
            setStrokeCount(nextStrokes.length);
            return {
              ...prev,
              [currentItem.item_id]: nextStrokes,
            };
          });
        }
      }

      const dataUrl = getCanvasDataUrl();
      if (dataUrl) {
        setEditedMaskMap((prev) => ({
          ...prev,
          [currentItem.item_id]: dataUrl,
        }));
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || maskMode !== "edit") return;

    const ctx = getCanvasContext();
    const point = getCanvasPoint(e);

    if (!ctx || !point || !currentStrokeRef.current) return;

    const stroke = currentStrokeRef.current;
    const previousPoint = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);

    if (stroke.id === selectedLayerId && stroke.tool === "erase" && selectedLayerId !== MASK_LAYER_ID) {
      const baseImage = maskBaseMap[currentItem?.item_id || ""] || currentItem?.mask_image_url || "";
      const existingStrokes = strokeHistoryMap[currentItem?.item_id || ""] || [];
      const previewStrokes = existingStrokes.map((layer) =>
        layer.id === selectedLayerId
          ? {
              ...layer,
              layerEdits: [
                ...(layer.layerEdits || []),
                {
                  tool: stroke.tool,
                  brushSize: stroke.brushSize,
                  points: stroke.points,
                },
              ],
            }
          : layer
      );
      if (baseImage) {
        loadMaskToCanvas(baseImage, previewStrokes, undefined, false);
      }
      return;
    }

    if (stroke.id === MASK_LAYER_ID) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.lineWidth = stroke.brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "white";
      ctx.beginPath();
      ctx.moveTo(previousPoint.x, previousPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalAlpha = stroke.opacity;
    ctx.lineWidth = stroke.brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "black";
    ctx.beginPath();
    ctx.moveTo(previousPoint.x, previousPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.restore();
  };

  const resetMask = () => {
    if (currentItem?.mask_image_url) {
      pushEditorSnapshot(currentItem.item_id);
      loadMaskToCanvas(currentItem.mask_image_url, [], currentItem.item_id);
      setMaskBaseMap((prev) => {
        const next = { ...prev };
        delete next[currentItem.item_id];
        return next;
      });
      setStrokeHistoryMap((prev) => {
        const next = { ...prev };
        delete next[currentItem.item_id];
        return next;
      });
      setEditedMaskMap((prev) => {
        const next = { ...prev };
        delete next[currentItem.item_id];
        return next;
      });
      setSelectedLayerId(MASK_LAYER_ID);
      setStrokeCount(0);
      setStatus("Mask reset to the original prediction.");
    }
  };

  const undoLastStroke = () => {
    if (!currentItem?.item_id || !currentItem.mask_image_url) return;
    const history = editorHistoryMap[currentItem.item_id] || [];
    if (!history.length) {
      setStatus("No edit operations to undo.");
      return;
    }

    const snapshot = history[history.length - 1];
    const nextHistory = history.slice(0, -1);
    const currentSnapshot = getCurrentEditorSnapshot(currentItem.item_id);

    setEditorHistoryMap((prev) => ({
      ...prev,
      [currentItem.item_id]: nextHistory,
    }));
    setEditorFutureMap((prev) => ({
      ...prev,
      [currentItem.item_id]: [...(prev[currentItem.item_id] || []), currentSnapshot],
    }));
    setStrokeHistoryMap((prev) => ({
      ...prev,
      [currentItem.item_id]: snapshot.strokes.map(cloneStroke),
    }));
    setMaskBaseMap((prev) => {
      const next = { ...prev };
      if (snapshot.maskBase) {
        next[currentItem.item_id] = snapshot.maskBase;
      } else {
        delete next[currentItem.item_id];
      }
      return next;
    });
    setEditedMaskMap((prev) => {
      const next = { ...prev };
      if (snapshot.editedMask) {
        next[currentItem.item_id] = snapshot.editedMask;
      } else {
        delete next[currentItem.item_id];
      }
      return next;
    });
    setSelectedLayerId(snapshot.selectedLayerId || MASK_LAYER_ID);
    setStrokeCount(snapshot.strokes.length);

    loadMaskToCanvas(
      snapshot.maskBase || currentItem.mask_image_url,
      snapshot.strokes.map(cloneStroke),
      currentItem.item_id
    );
    setStatus("Last edit operation undone.");
  };

  const redoLastStroke = () => {
    if (!currentItem?.item_id || !currentItem.mask_image_url) return;
    const future = editorFutureMap[currentItem.item_id] || [];
    if (!future.length) {
      setStatus("No edit operations to redo.");
      return;
    }

    const snapshot = future[future.length - 1];
    const nextFuture = future.slice(0, -1);
    const currentSnapshot = getCurrentEditorSnapshot(currentItem.item_id);

    setEditorFutureMap((prev) => ({
      ...prev,
      [currentItem.item_id]: nextFuture,
    }));
    setEditorHistoryMap((prev) => ({
      ...prev,
      [currentItem.item_id]: [...(prev[currentItem.item_id] || []), currentSnapshot],
    }));
    setStrokeHistoryMap((prev) => ({
      ...prev,
      [currentItem.item_id]: snapshot.strokes.map(cloneStroke),
    }));
    setMaskBaseMap((prev) => {
      const next = { ...prev };
      if (snapshot.maskBase) {
        next[currentItem.item_id] = snapshot.maskBase;
      } else {
        delete next[currentItem.item_id];
      }
      return next;
    });
    setEditedMaskMap((prev) => {
      const next = { ...prev };
      if (snapshot.editedMask) {
        next[currentItem.item_id] = snapshot.editedMask;
      } else {
        delete next[currentItem.item_id];
      }
      return next;
    });
    setSelectedLayerId(snapshot.selectedLayerId || MASK_LAYER_ID);
    setStrokeCount(snapshot.strokes.length);

    loadMaskToCanvas(
      snapshot.maskBase || currentItem.mask_image_url,
      snapshot.strokes.map(cloneStroke),
      currentItem.item_id
    );
    setStatus("Last edit operation redone.");
  };

  const removeStrokeById = (strokeId: string) => {
    if (!currentItem?.item_id || !currentItem.mask_image_url) return;
    pushEditorSnapshot(currentItem.item_id);
    const strokes = strokeHistoryMap[currentItem.item_id] || [];
    const nextStrokes = strokes.filter((stroke) => stroke.id !== strokeId);
    if (nextStrokes.length === strokes.length) return;

    setStrokeHistoryMap((prev) => ({
      ...prev,
      [currentItem.item_id]: nextStrokes,
    }));
    setStrokeCount(nextStrokes.length);

    if (nextStrokes.length === 0) {
      setEditedMaskMap((prev) => {
        const next = { ...prev };
        delete next[currentItem.item_id];
        return next;
      });
    }

    loadMaskToCanvas(maskBaseMap[currentItem.item_id] || currentItem.mask_image_url, nextStrokes, currentItem.item_id);
    if (selectedLayerId === strokeId) {
      setSelectedLayerId(MASK_LAYER_ID);
    }
    setStatus("Selected stroke layer removed.");
  };

  const selectLayer = (strokeId: string) => {
    setSelectedLayerId(strokeId);
    setFlashLayerId(strokeId);
    window.setTimeout(() => {
      setFlashLayerId((prev) => (prev === strokeId ? "" : prev));
    }, 2000);
  };

  const handleNewJob = () => {
    setSelectedFiles([]);
    setBatchData(null);
    setSelectedItemId("");
    setAnalysisMap({});
    setEditedMaskMap({});
    setStatus("Ready. Upload one or more AFM images to begin.");
    setToolMode("draw");
    setBrushSize(10);
    setMaskOverlayOpacity(0.6);
    setMaskMode("edit");
    setThreshold(0.5);
    setDenoise(0);
    setSharpen(0);
    setMorphology(0);
    setGrayscale(false);
    setInvertPixels(false);
    setInvertMask(false);
    segmentationUpdateKeyRef.current = "";
    analysisUpdateKeyRef.current = "";
    setStrokeCount(0);
    setEditorHistoryMap({});
    setEditorFutureMap({});
    setMaskBaseMap({});
    setStrokeHistoryMap({});
    setSelectedLayerId(MASK_LAYER_ID);
    setActiveTab("upload");
    const ctx = getCanvasContext();
    ctx?.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (hiddenFileInputRef.current) hiddenFileInputRef.current.value = "";
  };

  const handleUpload = useCallback(async (options?: { preserveSelection?: boolean; silent?: boolean }) => {
    if (!selectedFiles.length) {
      setStatus("Please choose one or more files first.");
      return;
    }

    const reachable = await isBackendReachable(BACKEND_URL);
    if (!reachable) {
      setStatus(`Backend not reachable at ${BACKEND_URL}. Start afm-backend first.`);
      return;
    }

    setAnalysisMap({});
    setEditedMaskMap({});
    setIsUploading(true);
    if (!options?.silent) {
      setStatus("Uploading batch and running CNN + U-Net on each image...");
    }

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append("files", file));
    formData.append("client_session_id", clientSessionId);
    formData.append("threshold", String(threshold));
    formData.append("denoise", String(denoise));
    formData.append("sharpen", String(sharpen));
    formData.append("morphology", String(morphology));
    formData.append("grayscale", String(grayscale));
    formData.append("invert", String(invertPixels));
    formData.append("invertMask", String(invertMask));

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Upload failed.");
        return;
      }

      const previousSelectedId = selectedItemId;
      setBatchData(data);
      if (data.items?.length) {
        const preservedItem =
          options?.preserveSelection &&
          previousSelectedId &&
          data.items.find((item: UploadItem) => item.original_filename === currentItem?.original_filename);
        setSelectedItemId(preservedItem?.item_id || data.items[0].item_id);
      }

      if (!options?.silent) {
        setStatus(
          `Upload complete. ${data.batch_count} image${data.batch_count === 1 ? "" : "s"} loaded.`
        );
      }
      setActiveTab("upload");
    } catch (error) {
      setStatus(`Cannot reach backend at ${BACKEND_URL}. Start backend server first.`);
      console.warn("Upload request failed", error);
    } finally {
      setIsUploading(false);
    }
  }, [
    clientSessionId,
    currentItem?.original_filename,
    denoise,
    grayscale,
    invertMask,
    invertPixels,
    morphology,
    selectedFiles,
    selectedItemId,
    sharpen,
    threshold,
  ]);

  const handleRunAnalysis = useCallback(async (options?: { silent?: boolean; preserveTab?: boolean }) => {
    if (!batchData?.items?.length) {
      setStatus("Upload a batch first.");
      return;
    }

    const reachable = await isBackendReachable(BACKEND_URL);
    if (!reachable) {
      setStatus(`Backend not reachable at ${BACKEND_URL}. Start afm-backend first.`);
      return;
    }

    const editedMasksSnapshot = { ...editedMaskMap };

    if (currentItem?.item_id && maskMode === "edit" && canvasRef.current) {
      const dataUrl = getCanvasDataUrl();
      if (dataUrl) {
        editedMasksSnapshot[currentItem.item_id] = dataUrl;
        setEditedMaskMap(editedMasksSnapshot);
      }
    }

    setIsRunning(true);
    if (!options?.silent) {
      setStatus(
        `Running analysis for all ${batchData.items.length} image${batchData.items.length === 1 ? "" : "s"}...`
      );
    }

    try {
      const payload = {
        job_id: batchData.job_id,
        job_dir: batchData.job_dir,
        items: batchData.items.map((item) => {
          const predictedClass = classificationOverrides[item.item_id] ?? item.predicted_class;
          return {
          ...item,
          predicted_class: predictedClass,
          image_size_um: imageSizeUm,
          ...(predictedClass === "dots" || predictedClass === "mixed"
            ? {
                threshold_edge: voronoiThresholdEdge,
                max_size: voronoiMaxSize,
                packing_edges: voronoiPackingEdges,
                extract_dots: voronoiExtractDots,
                min_circularity: minCircularity,
                max_aspect_ratio: maxAspectRatio,
                min_area: minArea,
                max_area: maxArea,
              }
            : {}),
          ...(predictedClass === "lines" || predictedClass === "mixed"
            ? {
                num_clusters: colorwheelClusters,
                domain_spacing_debug: showColorwheelDebug,
              }
            : {}),
          ...(predictedClass === "irregular"
            ? {
                dan_method: irregularMethod,
                dan_adaptive_method: irregularAdaptiveMethod,
                dan_block_size: irregularAdaptiveBlockSize,
                dan_c: irregularCValue,
                dan_niblack_window: irregularNiblackWindow,
                dan_k: irregularKValue,
                dan_blur: irregularBlur,
                dan_blur_ksize: irregularBlurKsize,
                dan_equalize: irregularEqualize,
                dan_clahe: irregularClahe,
                dan_combine_mode: irregularCombineMode,
                dan_alpha: irregularAlpha,
                spacing_invert: irregularInvertSpacing,
              }
            : {}),
          };
        }),
        edited_masks_by_item_id: editedMasksSnapshot,
      };

      const res = await fetch(`${BACKEND_URL}/api/run-analysis-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Batch analysis failed.");
        return;
      }

      const nextMap: Record<string, AnalysisResponse> = {};
      for (const result of data.results || []) {
        nextMap[result.item_id] = result;
      }

      setAnalysisMap(nextMap);
      if (!options?.preserveTab) {
        setActiveTab("results");
      }
      if (!options?.silent) {
        setStatus(
          `Analysis complete for ${data.result_count || 0} image${
            data.result_count === 1 ? "" : "s"
          }.`
        );
      }
    } catch (error) {
      setStatus(`Cannot reach backend at ${BACKEND_URL}. Start backend server first.`);
      console.warn("Batch analysis request failed", error);
    } finally {
      setIsRunning(false);
    }
  }, [
    batchData,
    classificationOverrides,
    currentItem?.item_id,
    editedMaskMap,
    imageSizeUm,
    irregularAdaptiveBlockSize,
    irregularAdaptiveMethod,
    irregularAlpha,
    irregularBlur,
    irregularBlurKsize,
    irregularCValue,
    irregularClahe,
    irregularCombineMode,
    irregularEqualize,
    irregularInvertSpacing,
    irregularKValue,
    irregularMethod,
    irregularNiblackWindow,
    maskMode,
    maxArea,
    maxAspectRatio,
    minArea,
    minCircularity,
    showColorwheelDebug,
    voronoiExtractDots,
    voronoiMaxSize,
    voronoiPackingEdges,
    voronoiThresholdEdge,
    colorwheelClusters,
  ]);

  const handleSwitchModel = useCallback(async (filename: string) => {
    if (!filename || filename === activeModel) return;
    setIsSwitchingModel(true);
    setStatus(`Switching U-Net model to ${filename}...`);
    try {
      const res = await fetch(`${BACKEND_URL}/models/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStatus(data.error || "Model switch failed.");
        return;
      }
      setActiveModel(data.active_model || filename);
      await fetchModels();
      if (selectedFiles.length) {
        await handleUpload({ preserveSelection: true, silent: true });
      }
      setStatus(`Model switched to ${data.active_model || filename}.`);
    } catch (error) {
      console.warn("Model switch failed", error);
      setStatus("Failed to switch model.");
    } finally {
      setIsSwitchingModel(false);
    }
  }, [activeModel, fetchModels, handleUpload, selectedFiles.length]);

  const handleExportCurrentPdf = async () => {
    if (!batchData || !currentItem || !currentAnalysis) {
      setStatus("No analyzed item available to export.");
      return;
    }

    setIsExporting(true);
    setStatus("Building PDF for selected image...");

    try {
      const res = await fetch(`${BACKEND_URL}/api/export-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batch_data: batchData,
          current_item: currentItem,
          current_analysis: currentAnalysis,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(data.error || "PDF export failed.");
        return;
      }

      const blob = await res.blob();
      const filename =
        `${(currentAnalysis.original_filename || "afm_result").replace(/\.[^.]+$/, "")}_analysis.pdf`;

      downloadBlob(blob, filename);
      setStatus("Selected result PDF downloaded.");
    } catch (error) {
      console.warn("Single PDF export failed", error);
      setStatus("Failed to export selected PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportBatchPdf = async () => {
    if (!batchData?.items?.length) {
      setStatus("No batch available to export.");
      return;
    }

    const analysisResults = Object.values(analysisMap);
    if (!analysisResults.length) {
      setStatus("Run analysis before exporting batch PDF.");
      return;
    }

    setIsExporting(true);
    setStatus("Building batch PDF...");

    try {
      const res = await fetch(`${BACKEND_URL}/api/export-pdf-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batch_data: batchData,
          items: batchData.items,
          analysis_results: analysisResults,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(data.error || "Batch PDF export failed.");
        return;
      }

      const blob = await res.blob();
      const filename = `afm_batch_${batchData.job_id}.pdf`;

      downloadBlob(blob, filename);
      setStatus("Batch PDF downloaded.");
    } catch (error) {
      console.warn("Batch PDF export failed", error);
      setStatus("Failed to export batch PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!selectedFiles.length || !batchData || isUploading || isSwitchingModel) return;
    const key = JSON.stringify({
      threshold,
      denoise,
      sharpen,
      morphology,
      grayscale,
      invertPixels,
      invertMask,
      activeModel,
    });
    if (!segmentationUpdateKeyRef.current) {
      segmentationUpdateKeyRef.current = key;
      return;
    }
    if (segmentationUpdateKeyRef.current === key) return;
    segmentationUpdateKeyRef.current = key;

    const timeoutId = window.setTimeout(() => {
      void handleUpload({ preserveSelection: true, silent: true });
    }, 450);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeModel,
    batchData,
    denoise,
    grayscale,
    handleUpload,
    invertMask,
    invertPixels,
    isSwitchingModel,
    isUploading,
    morphology,
    selectedFiles.length,
    sharpen,
    threshold,
  ]);

  useEffect(() => {
    if (!batchData?.items?.length || !Object.keys(analysisMap).length || isRunning) return;
    const key = JSON.stringify({
      imageSizeUm,
      colorwheelClusters,
      showColorwheelDebug,
      voronoiThresholdEdge,
      voronoiMaxSize,
      voronoiPackingEdges,
      voronoiExtractDots,
      minCircularity,
      maxAspectRatio,
      minArea,
      maxArea,
      irregularMethod,
      irregularAdaptiveMethod,
      irregularAdaptiveBlockSize,
      irregularCValue,
      irregularNiblackWindow,
      irregularKValue,
      irregularBlur,
      irregularBlurKsize,
      irregularEqualize,
      irregularClahe,
      irregularCombineMode,
      irregularAlpha,
      irregularInvertSpacing,
      classificationOverrides,
    });
    if (!analysisUpdateKeyRef.current) {
      analysisUpdateKeyRef.current = key;
      return;
    }
    if (analysisUpdateKeyRef.current === key) return;
    analysisUpdateKeyRef.current = key;

    const timeoutId = window.setTimeout(() => {
      void handleRunAnalysis({ silent: true, preserveTab: true });
    }, 450);
    return () => window.clearTimeout(timeoutId);
  }, [
    analysisMap,
    batchData,
    classificationOverrides,
    colorwheelClusters,
    handleRunAnalysis,
    imageSizeUm,
    isRunning,
    maxArea,
    maxAspectRatio,
    minArea,
    minCircularity,
    showColorwheelDebug,
    irregularAdaptiveBlockSize,
    irregularAdaptiveMethod,
    irregularAlpha,
    irregularBlur,
    irregularBlurKsize,
    irregularCValue,
    irregularClahe,
    irregularCombineMode,
    irregularEqualize,
    irregularInvertSpacing,
    irregularKValue,
    irregularMethod,
    irregularNiblackWindow,
    voronoiExtractDots,
    voronoiMaxSize,
    voronoiPackingEdges,
    voronoiThresholdEdge,
  ]);

  const badgeClass = (name?: string) => String(name || "unknown").toUpperCase();

  return (
    <>
      <GlobalWorkspaceStyles />

      <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
        <WorkspaceHeader
          activeModel={activeModel}
          activeModelItem={activeModelItem}
          handleNewJob={handleNewJob}
          handleSwitchModel={handleSwitchModel}
          isSwitchingModel={isSwitchingModel}
          models={models}
          setThemeMode={setThemeMode}
          themeMode={themeMode}
        />

        <WorkspaceStepper currentStep={currentStep} />

        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 28px" }}>
          <WorkspaceStageTabs activeTab={activeTab} setActiveTab={setActiveTab} />

          {activeTab === "upload" && (
            <UploadStage
              hiddenFileInputRef={hiddenFileInputRef}
              isDragActive={isDragActive}
              setIsDragActive={setIsDragActive}
              setFilesFromInput={setFilesFromInput}
              selectedFiles={selectedFiles}
              selectedFilePreviewUrls={selectedFilePreviewUrls}
              setSelectedFiles={setSelectedFiles}
              handleUpload={() => void handleUpload()}
              isUploading={isUploading}
              batchData={displayBatchData}
              analysisMap={analysisMap}
              editedMaskMap={editedMaskMap}
              currentItem={currentItem}
              classifierClass={classifierClass}
              onClassificationOverride={handleClassificationOverride}
              saveCurrentCanvasForItem={saveCurrentCanvasForItem}
              setSelectedItemId={setSelectedItemId}
              setActiveTab={setActiveTab}
              badgeClass={badgeClass}
              showAdvancedImageOptions={showAdvancedImageOptions}
              setShowAdvancedImageOptions={setShowAdvancedImageOptions}
              denoise={denoise}
              setDenoise={setDenoise}
              sharpen={sharpen}
              setSharpen={setSharpen}
              grayscale={grayscale}
              setGrayscale={setGrayscale}
              invertPixels={invertPixels}
              setInvertPixels={setInvertPixels}
              threshold={threshold}
              setThreshold={setThreshold}
              morphology={morphology}
              setMorphology={setMorphology}
              invertMask={invertMask}
              setInvertMask={setInvertMask}
              maskMode={maskMode}
              setMaskMode={setMaskMode}
              toolMode={toolMode}
              setToolMode={setToolMode}
              resetMask={resetMask}
              undoLastStroke={undoLastStroke}
              redoLastStroke={redoLastStroke}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              maskOverlayOpacity={maskOverlayOpacity}
              setMaskOverlayOpacity={setMaskOverlayOpacity}
              canvasRef={canvasRef}
              startDrawing={startDrawing}
              stopDrawing={stopDrawing}
              draw={draw}
              strokeCount={strokeCount}
              selectedItemStrokes={selectedItemStrokes}
              selectLayer={selectLayer}
              flashLayerId={flashLayerId}
              selectedLayerId={selectedLayerId}
              removeStrokeById={removeStrokeById}
              status={status}
              handleRunAnalysis={() => void handleRunAnalysis()}
              isRunning={isRunning}
              maskLayerId={MASK_LAYER_ID}
              canvasSize={CANVAS_SIZE}
            />
          )}

          {activeTab === "results" && (
            <ResultsStage
              batchData={displayBatchData}
              currentItem={currentItem}
              currentAnalysis={currentAnalysis}
              analysisMap={analysisMap}
              setSelectedItemId={setSelectedItemId}
              badgeClass={badgeClass}
              showAdvancedAnalysisOptions={showAdvancedAnalysisOptions}
              setShowAdvancedAnalysisOptions={setShowAdvancedAnalysisOptions}
              imageSizeUm={imageSizeUm}
              setImageSizeUm={setImageSizeUm}
              colorwheelClusters={colorwheelClusters}
              setColorwheelClusters={setColorwheelClusters}
              showColorwheelDebug={showColorwheelDebug}
              setShowColorwheelDebug={setShowColorwheelDebug}
              voronoiThresholdEdge={voronoiThresholdEdge}
              setVoronoiThresholdEdge={setVoronoiThresholdEdge}
              voronoiMaxSize={voronoiMaxSize}
              setVoronoiMaxSize={setVoronoiMaxSize}
              voronoiPackingEdges={voronoiPackingEdges}
              setVoronoiPackingEdges={setVoronoiPackingEdges}
              voronoiExtractDots={voronoiExtractDots}
              setVoronoiExtractDots={setVoronoiExtractDots}
              minCircularity={minCircularity}
              setMinCircularity={setMinCircularity}
              maxAspectRatio={maxAspectRatio}
              setMaxAspectRatio={setMaxAspectRatio}
              minArea={minArea}
              setMinArea={setMinArea}
              maxArea={maxArea}
              setMaxArea={setMaxArea}
              irregularUseAdaptive={irregularUseAdaptive}
              setIrregularUseAdaptive={setIrregularUseAdaptive}
              irregularUseNiblack={irregularUseNiblack}
              setIrregularUseNiblack={setIrregularUseNiblack}
              irregularCombineMode={irregularCombineMode}
              setIrregularCombineMode={setIrregularCombineMode}
              irregularAlpha={irregularAlpha}
              setIrregularAlpha={setIrregularAlpha}
              irregularAdaptiveMethod={irregularAdaptiveMethod}
              setIrregularAdaptiveMethod={setIrregularAdaptiveMethod}
              irregularAdaptiveBlockSize={irregularAdaptiveBlockSize}
              setIrregularAdaptiveBlockSize={setIrregularAdaptiveBlockSize}
              irregularCValue={irregularCValue}
              setIrregularCValue={setIrregularCValue}
              irregularKValue={irregularKValue}
              setIrregularKValue={setIrregularKValue}
              irregularNiblackWindow={irregularNiblackWindow}
              setIrregularNiblackWindow={setIrregularNiblackWindow}
              irregularBlur={irregularBlur}
              setIrregularBlur={setIrregularBlur}
              irregularBlurKsize={irregularBlurKsize}
              setIrregularBlurKsize={setIrregularBlurKsize}
              irregularEqualize={irregularEqualize}
              setIrregularEqualize={setIrregularEqualize}
              irregularClahe={irregularClahe}
              setIrregularClahe={setIrregularClahe}
              irregularInvertSpacing={irregularInvertSpacing}
              setIrregularInvertSpacing={setIrregularInvertSpacing}
              outputSections={outputSections}
              setViewerImage={setViewerImage}
              importantMetrics={importantMetrics}
              metricValueByKey={metricValueByKey}
            />
          )}

          {activeTab === "export" && (
            <ExportStage
              handleNewJob={handleNewJob}
              handleExportCurrentPdf={() => void handleExportCurrentPdf()}
              currentAnalysis={currentAnalysis}
              isExporting={isExporting}
              handleExportBatchPdf={() => void handleExportBatchPdf()}
              analysisMap={analysisMap}
            />
          )}
        </div>

        <WorkspaceFooter />

        <ImageViewerModal viewerImage={viewerImage} onClose={() => setViewerImage(null)} />
      </main>
    </>
  );
}
