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
  runButtonStyle,
} from "./analysis-workspace/helpers";
import {
  buildDisplayedOutputs,
  buildLineDiagnosticsOutputs,
  buildOutputSections,
  buildResultsCsv,
  getImportantMetrics,
  getSelectedItemStrokes,
} from "./analysis-workspace/output-helpers";
import {
  GlobalWorkspaceStyles,
  ImageViewerModal,
} from "./analysis-workspace/layout";
import {
  ExportStage,
  ResultsStage,
  ReviewStage,
  UploadStage,
} from "./analysis-workspace/stages";
import { WIZARD_STEPS, WizardBar, WizardHead, WizardSidebar, WizardStyles } from "./analysis-workspace/wizard";
import type { WizardTabState } from "./analysis-workspace/wizard";
import type {
  AnalysisParams,
  AnalysisResponse,
  EditorSnapshot,
  ImageParams,
  MaskStroke,
  OutputSection,
  ResultOutput,
  StrokePoint,
  ThemeMode,
  UploadBatchResponse,
  UploadItem,
  ViewerImage,
  WorkspaceStep,
} from "./analysis-workspace/types";
import { DEFAULT_ANALYSIS_PARAMS, DEFAULT_IMAGE_PARAMS, MASK_LAYER_ID } from "./analysis-workspace/types";

export default function AnalysisWorkspace() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);
  const currentStrokeRef = useRef<MaskStroke | null>(null);
  const resegmentTimersRef = useRef<Record<string, number>>({});
  const resegmentSeqRef = useRef<Record<string, number>>({});
  const selectedLayerIdRef = useRef(MASK_LAYER_ID);
  const flashLayerIdRef = useRef("");

  const [clientSessionId, setClientSessionId] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
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
  const [activeTab, setActiveTab] = useState<WorkspaceStep>("upload");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [toolMode, setToolMode] = useState<"draw" | "erase">("draw");
  const [brushSize, setBrushSize] = useState(10);
  const [maskOverlayOpacity, setMaskOverlayOpacity] = useState(0.6);
  const [maskMode, setMaskMode] = useState<"use" | "edit">("edit");
  const [imageParamsMap, setImageParamsMap] = useState<Record<string, ImageParams>>({});
  const [resegmentingIds, setResegmentingIds] = useState<Record<string, boolean>>({});
  const [showAdvancedImageOptions, setShowAdvancedImageOptions] = useState(false);
  const [analysisParamsMap, setAnalysisParamsMap] = useState<Record<string, AnalysisParams>>({});
  // Settings each item's current result was computed with, to flag stale results.
  const [analysisParamsUsedMap, setAnalysisParamsUsedMap] = useState<Record<string, AnalysisParams>>({});
  const [showAdvancedAnalysisOptions, setShowAdvancedAnalysisOptions] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  // Which PDF is being built, so only that button shows "Exporting...".
  const [exportTarget, setExportTarget] = useState<"current" | "batch" | null>(null);
  const isExporting = exportTarget !== null;
  const [strokeHistoryMap, setStrokeHistoryMap] = useState<Record<string, MaskStroke[]>>({});
  const [editorHistoryMap, setEditorHistoryMap] = useState<Record<string, EditorSnapshot[]>>({});
  const [editorFutureMap, setEditorFutureMap] = useState<Record<string, EditorSnapshot[]>>({});
  const [selectedLayerId, setSelectedLayerId] = useState<string>(MASK_LAYER_ID);
  const [flashLayerId, setFlashLayerId] = useState<string>("");
  const [viewerImage, setViewerImage] = useState<ViewerImage | null>(null);
  const [classificationOverrides, setClassificationOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    setClientSessionId(getOrCreateClientSessionId());
    setThemeMode(getInitialThemeMode());
  }, []);

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

  const currentImageParams = useMemo<ImageParams>(
    () => (currentItem && imageParamsMap[currentItem.item_id]) || DEFAULT_IMAGE_PARAMS,
    [currentItem, imageParamsMap]
  );

  const currentAnalysisParams = useMemo<AnalysisParams>(
    () => (currentItem && analysisParamsMap[currentItem.item_id]) || DEFAULT_ANALYSIS_PARAMS,
    [analysisParamsMap, currentItem]
  );

  const currentAnalysis = useMemo(() => {
    if (!currentItem) return null;
    return analysisMap[currentItem.item_id] || null;
  }, [analysisMap, currentItem]);

  const displayedOutputs = useMemo<ResultOutput[]>(
    () => buildDisplayedOutputs(currentAnalysis, currentItem),
    [currentAnalysis, currentItem]
  );

  const lineDiagnosticsOutputs = useMemo<ResultOutput[]>(
    () => buildLineDiagnosticsOutputs(currentAnalysis, currentItem, currentAnalysisParams.showColorwheelDebug),
    [currentAnalysis, currentItem, currentAnalysisParams.showColorwheelDebug]
  );

  const outputSections = useMemo<OutputSection[]>(
    () => buildOutputSections(displayedOutputs, lineDiagnosticsOutputs),
    [displayedOutputs, lineDiagnosticsOutputs]
  );

  const importantMetrics = useMemo(
    () => getImportantMetrics(currentAnalysis, currentItem),
    [currentAnalysis, currentItem]
  );

  // The current result was computed with different settings than the ones shown.
  const isCurrentAnalysisStale = useMemo(() => {
    if (!currentItem || !currentAnalysis) return false;
    const used = analysisParamsUsedMap[currentItem.item_id];
    return !!used && JSON.stringify(used) !== JSON.stringify(currentAnalysisParams);
  }, [analysisParamsUsedMap, currentAnalysis, currentAnalysisParams, currentItem]);

  const selectedItemStrokes = useMemo(
    () => getSelectedItemStrokes(currentItem?.item_id, strokeHistoryMap),
    [currentItem?.item_id, strokeHistoryMap]
  );


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
    if (activeTab !== "review" || !currentItem?.item_id) return;
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

    if (activeTab !== "review" || !currentItem?.item_id || !currentItem.mask_image_url) return;
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
    Object.values(resegmentTimersRef.current).forEach((id) => window.clearTimeout(id));
    resegmentTimersRef.current = {};
    setImageParamsMap({});
    setAnalysisParamsMap({});
    setAnalysisParamsUsedMap({});
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
      // A fresh upload creates new item ids, so per-image settings start over.
      Object.values(resegmentTimersRef.current).forEach((id) => window.clearTimeout(id));
      resegmentTimersRef.current = {};
      setImageParamsMap({});
      setAnalysisParamsMap({});
      setAnalysisParamsUsedMap({});
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
      setActiveTab("review");
    } catch (error) {
      setStatus(`Cannot reach backend at ${BACKEND_URL}. Start backend server first.`);
      console.warn("Upload request failed", error);
    } finally {
      setIsUploading(false);
    }
  }, [
    clientSessionId,
    currentItem?.original_filename,
    selectedFiles,
    selectedItemId,
  ]);

  const clearItemEditorState = useCallback((itemId: string) => {
    const dropItem = <T,>(prev: Record<string, T>) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    };
    setAnalysisMap(dropItem);
    setEditedMaskMap(dropItem);
    setMaskBaseMap(dropItem);
    setStrokeHistoryMap(dropItem);
    setEditorHistoryMap(dropItem);
    setEditorFutureMap(dropItem);
  }, []);

  // Re-run preprocessing + U-Net for a single item with its own parameters.
  // The item keeps its id, so other images' edits and overrides are untouched.
  // predictedClass is the effective class: irregular images are binarized
  // instead of going through the U-Net.
  const resegmentItem = useCallback(async (item: UploadItem, params: ImageParams, predictedClass: string) => {
    const seq = (resegmentSeqRef.current[item.item_id] || 0) + 1;
    resegmentSeqRef.current[item.item_id] = seq;
    setResegmentingIds((prev) => ({ ...prev, [item.item_id]: true }));

    try {
      const res = await fetch(`${BACKEND_URL}/api/resegment-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: {
            item_id: item.item_id,
            item_dir: item.item_dir,
            saved_path: item.saved_path,
            predicted_class: predictedClass,
          },
          params: {
            threshold: params.threshold,
            denoise: params.denoise,
            sharpen: params.sharpen,
            morphology: params.morphology,
            grayscale: params.grayscale,
            invert: params.invertPixels,
            invertMask: params.invertMask,
            binarizeAdaptive: params.binarizeAdaptive,
            binarizeNiblack: params.binarizeNiblack,
            binarizeCombineMode: params.binarizeCombineMode,
            binarizeAlpha: params.binarizeAlpha,
            binarizeK: params.binarizeK,
            binarizeNiblackWindow: params.binarizeNiblackWindow,
            binarizeAdaptiveMethod: params.binarizeAdaptiveMethod,
            binarizeBlockSize: params.binarizeBlockSize,
            binarizeC: params.binarizeC,
            binarizeBlur: params.binarizeBlur,
            binarizeBlurKsize: params.binarizeBlurKsize,
            binarizeEqualize: params.binarizeEqualize,
            binarizeClahe: params.binarizeClahe,
          },
        }),
      });
      const data = await res.json();
      // A newer request for this item superseded this one.
      if (resegmentSeqRef.current[item.item_id] !== seq) return;

      if (!res.ok) {
        setStatus(data.error || `Re-segmentation failed for ${item.original_filename}.`);
        return;
      }

      // The old mask edits were drawn against the previous mask.
      clearItemEditorState(item.item_id);
      setBatchData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((existing) =>
                existing.item_id === item.item_id ? { ...existing, ...data } : existing
              ),
            }
          : prev
      );
    } catch (error) {
      setStatus(`Cannot reach backend at ${BACKEND_URL}. Start backend server first.`);
      console.warn("Re-segmentation request failed", error);
    } finally {
      if (resegmentSeqRef.current[item.item_id] === seq) {
        setResegmentingIds((prev) => {
          const next = { ...prev };
          delete next[item.item_id];
          return next;
        });
      }
    }
  }, [clearItemEditorState]);

  const scheduleResegment = useCallback((item: UploadItem, params: ImageParams, predictedClass: string) => {
    window.clearTimeout(resegmentTimersRef.current[item.item_id]);
    setResegmentingIds((prev) => ({ ...prev, [item.item_id]: true }));
    resegmentTimersRef.current[item.item_id] = window.setTimeout(() => {
      delete resegmentTimersRef.current[item.item_id];
      void resegmentItem(item, params, predictedClass);
    }, 300);
  }, [resegmentItem]);

  const effectiveClass = useCallback(
    (item: UploadItem) => classificationOverrides[item.item_id] ?? item.predicted_class,
    [classificationOverrides]
  );

  const updateCurrentImageParams = useCallback((patch: Partial<ImageParams>) => {
    if (!batchData || !currentItem) return;
    const item = batchData.items.find((existing) => existing.item_id === currentItem.item_id);
    if (!item) return;
    const nextParams = { ...(imageParamsMap[item.item_id] || DEFAULT_IMAGE_PARAMS), ...patch };
    setImageParamsMap((prev) => ({ ...prev, [item.item_id]: nextParams }));
    scheduleResegment(item, nextParams, effectiveClass(item));
  }, [batchData, currentItem, effectiveClass, imageParamsMap, scheduleResegment]);

  // An override that switches between the U-Net and binarization needs a new mask.
  const handleClassificationChange = useCallback((itemId: string, predictedClass: string) => {
    handleClassificationOverride(itemId, predictedClass);
    const item = batchData?.items.find((existing) => existing.item_id === itemId);
    if (!item) return;
    const segmentedClass = item.segmented_class ?? item.predicted_class;
    if ((predictedClass === "irregular") !== (segmentedClass === "irregular")) {
      window.clearTimeout(resegmentTimersRef.current[itemId]);
      void resegmentItem(item, imageParamsMap[itemId] || DEFAULT_IMAGE_PARAMS, predictedClass);
    }
  }, [batchData, handleClassificationOverride, imageParamsMap, resegmentItem]);

  const applyImageParamsToAll = useCallback(() => {
    if (!batchData?.items?.length) return;
    const params = currentImageParams;
    const nextMap: Record<string, ImageParams> = {};
    for (const item of batchData.items) {
      nextMap[item.item_id] = params;
      const current = imageParamsMap[item.item_id] || DEFAULT_IMAGE_PARAMS;
      if (JSON.stringify(current) !== JSON.stringify(params)) {
        scheduleResegment(item, params, effectiveClass(item));
      }
    }
    setImageParamsMap(nextMap);
    setStatus(`Applied current image settings to all ${batchData.items.length} images.`);
  }, [batchData, currentImageParams, effectiveClass, imageParamsMap, scheduleResegment]);

  const buildAnalysisItemPayload = useCallback((item: UploadItem, params: AnalysisParams) => {
    const predictedClass = classificationOverrides[item.item_id] ?? item.predicted_class;
    return {
      ...item,
      predicted_class: predictedClass,
      image_size_um: params.imageSizeUm,
      ...(predictedClass === "dots" || predictedClass === "mixed"
        ? {
            threshold_edge: params.voronoiThresholdEdge,
            max_size: params.voronoiMaxSize,
            packing_edges: params.voronoiPackingEdges,
            extract_dots: params.voronoiExtractDots,
            min_circularity: params.minCircularity,
            max_aspect_ratio: params.maxAspectRatio,
            min_area: params.minArea,
            max_area: params.maxArea,
          }
        : {}),
      ...(predictedClass === "lines" || predictedClass === "mixed"
        ? {
            num_clusters: params.colorwheelClusters,
            domain_spacing_debug: params.showColorwheelDebug,
          }
        : {}),
      ...(predictedClass === "irregular"
        ? {
            spacing_invert: params.irregularInvertSpacing,
          }
        : {}),
    };
  }, [classificationOverrides]);

  // Runs analysis for the given items (default: the whole batch), each with its
  // own settings. Results are merged so other items keep theirs.
  const handleRunAnalysis = useCallback(async (options?: {
    itemIds?: string[];
    paramsOverride?: Record<string, AnalysisParams>;
    preserveTab?: boolean;
  }) => {
    if (!batchData?.items?.length) {
      setStatus("Upload a batch first.");
      return;
    }

    const targetItems = options?.itemIds
      ? batchData.items.filter((item) => options.itemIds?.includes(item.item_id))
      : batchData.items;
    if (!targetItems.length) return;

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

    const paramsByItem: Record<string, AnalysisParams> = {};
    for (const item of targetItems) {
      paramsByItem[item.item_id] =
        options?.paramsOverride?.[item.item_id] || analysisParamsMap[item.item_id] || DEFAULT_ANALYSIS_PARAMS;
    }

    const label =
      targetItems.length === 1
        ? targetItems[0].original_filename
        : `all ${targetItems.length} images`;
    setIsRunning(true);
    setStatus(`Running analysis for ${label}...`);

    try {
      const payload = {
        job_id: batchData.job_id,
        job_dir: batchData.job_dir,
        items: targetItems.map((item) => buildAnalysisItemPayload(item, paramsByItem[item.item_id])),
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
        setStatus(data.error || "Analysis failed.");
        return;
      }

      const nextMap: Record<string, AnalysisResponse> = {};
      for (const result of data.results || []) {
        nextMap[result.item_id] = result;
      }

      setAnalysisMap((prev) => ({ ...prev, ...nextMap }));
      setAnalysisParamsUsedMap((prev) => {
        const next = { ...prev };
        for (const itemId of Object.keys(nextMap)) {
          if (paramsByItem[itemId]) next[itemId] = paramsByItem[itemId];
        }
        return next;
      });
      if (!options?.preserveTab) {
        setActiveTab("results");
      }
      setStatus(`Analysis complete for ${label}.`);
    } catch (error) {
      setStatus(`Cannot reach backend at ${BACKEND_URL}. Start backend server first.`);
      console.warn("Batch analysis request failed", error);
    } finally {
      setIsRunning(false);
    }
  }, [
    analysisParamsMap,
    batchData,
    buildAnalysisItemPayload,
    currentItem?.item_id,
    editedMaskMap,
    maskMode,
  ]);

  const updateCurrentAnalysisParams = useCallback((patch: Partial<AnalysisParams>) => {
    if (!currentItem) return;
    setAnalysisParamsMap((prev) => ({
      ...prev,
      [currentItem.item_id]: { ...(prev[currentItem.item_id] || DEFAULT_ANALYSIS_PARAMS), ...patch },
    }));
  }, [currentItem]);

  const rerunCurrentAnalysis = useCallback(() => {
    if (!currentItem) return;
    void handleRunAnalysis({ itemIds: [currentItem.item_id], preserveTab: true });
  }, [currentItem, handleRunAnalysis]);

  const applyAnalysisParamsToAllAndRerun = useCallback(() => {
    if (!batchData?.items?.length) return;
    const nextMap: Record<string, AnalysisParams> = {};
    for (const item of batchData.items) {
      nextMap[item.item_id] = currentAnalysisParams;
    }
    setAnalysisParamsMap(nextMap);
    void handleRunAnalysis({ paramsOverride: nextMap, preserveTab: true });
  }, [batchData, currentAnalysisParams, handleRunAnalysis]);

  const handleExportCurrentPdf = async () => {
    if (!batchData || !currentItem || !currentAnalysis) {
      setStatus("No analyzed item available to export.");
      return;
    }

    setExportTarget("current");
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
      setExportTarget(null);
    }
  };

  const handleExportCsv = () => {
    if (!batchData?.items?.length || !Object.keys(analysisMap).length) {
      setStatus("Run analysis before exporting CSV.");
      return;
    }

    const csv = buildResultsCsv(batchData.items, analysisMap);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `afm_results_${batchData.job_id}.csv`);
    setStatus("Results CSV downloaded.");
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

    setExportTarget("batch");
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
      setExportTarget(null);
    }
  };

  const badgeClass = (name?: string) => String(name || "unknown").toUpperCase();

  // ---- Step navigation: one step at a time, later steps unlock as the job progresses.
  const analyzedCount = Object.keys(analysisMap).length;
  const batchCount = batchData?.items?.length ?? 0;
  const activeIndex = WIZARD_STEPS.findIndex((step) => step.id === activeTab);
  const activeStepInfo = WIZARD_STEPS[activeIndex];
  const isBusy = isUploading || isRunning || isExporting;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

  const canOpenStep = (step: WorkspaceStep) => {
    if (step === "upload") return true;
    if (step === "review") return batchCount > 0;
    return analyzedCount > 0;
  };

  // Furthest step reached in this job, so steps the user came back from show as done.
  const [maxVisitedIndex, setMaxVisitedIndex] = useState(0);
  if (activeIndex > maxVisitedIndex) setMaxVisitedIndex(activeIndex);
  if (!batchData && maxVisitedIndex !== 0) setMaxVisitedIndex(0);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  const stepStateOf = (index: number): WizardTabState => {
    if (index === activeIndex) return "active";
    if (!canOpenStep(WIZARD_STEPS[index].id)) return "locked";
    return index < activeIndex || index < maxVisitedIndex ? "done" : "ready";
  };

  const stepDetailOf = (step: WorkspaceStep, state: WizardTabState) => {
    if (state === "locked") return step === "review" ? "After upload" : "After analysis";
    if (step === "upload") return batchCount ? `${plural(batchCount, "image")} uploaded` : "Add AFM images";
    if (step === "review") {
      const counts: Record<string, number> = {};
      (displayBatchData?.items || []).forEach((item) => {
        counts[item.predicted_class] = (counts[item.predicted_class] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([name, count]) => `${count} ${name}`)
        .join(" · ");
    }
    if (step === "results") return `${analyzedCount} of ${plural(batchCount, "image")} analyzed`;
    return state === "done" ? "Visited" : "PDF and CSV";
  };

  const goToStep = (target: WorkspaceStep) => {
    if (target === activeTab || !canOpenStep(target)) return;
    if (activeTab === "review") saveCurrentCanvasForItem(currentItem?.item_id);
    setActiveTab(target);
  };

  const primaryAction = () => {
    if (activeTab === "upload") {
      const disabled = !selectedFiles.length || isUploading;
      return (
        <button type="button" onClick={() => void handleUpload()} disabled={disabled} style={runButtonStyle}>
          {isUploading ? "Detecting..." : "Upload & detect →"}
        </button>
      );
    }
    if (activeTab === "review") {
      const disabled = isRunning || !batchCount;
      return (
        <button type="button" onClick={() => void handleRunAnalysis()} disabled={disabled} style={runButtonStyle}>
          {isRunning ? "Analyzing..." : `Analyze ${plural(batchCount, "image")} →`}
        </button>
      );
    }
    if (activeTab === "results") {
      return (
        <button type="button" onClick={() => goToStep("export")} style={runButtonStyle}>
          Next: Export →
        </button>
      );
    }
    return (
      <button type="button" onClick={handleNewJob} style={runButtonStyle}>
        ⟲ Start a new job
      </button>
    );
  };

  return (
    <>
      <GlobalWorkspaceStyles />
      <WizardStyles />

      <main className="wiz-root" style={{ background: "var(--bg)", color: "var(--text)" }}>
        <WizardSidebar
          activeStep={activeTab}
          stateOf={stepStateOf}
          detailOf={stepDetailOf}
          onSelect={goToStep}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          handleNewJob={handleNewJob}
        />

        <section className="wiz-main">
          <WizardHead
            index={activeIndex}
            total={WIZARD_STEPS.length}
            title={activeStepInfo.title}
            hint={activeStepInfo.hint}
          />

          <div ref={bodyRef} className="wiz-body">
            <div className="wiz-body-inner">
              {activeTab === "upload" && (
                <UploadStage
                  hiddenFileInputRef={hiddenFileInputRef}
                  isDragActive={isDragActive}
                  setIsDragActive={setIsDragActive}
                  setFilesFromInput={setFilesFromInput}
                  selectedFiles={selectedFiles}
                  selectedFilePreviewUrls={selectedFilePreviewUrls}
                  setSelectedFiles={setSelectedFiles}
                  batchData={displayBatchData}
                />
              )}

              {activeTab === "review" && (
                <ReviewStage
                  batchData={displayBatchData}
                  analysisMap={analysisMap}
                  editedMaskMap={editedMaskMap}
                  currentItem={currentItem}
                  classifierClass={classifierClass}
                  onClassificationOverride={handleClassificationChange}
                  isResegmenting={!!(currentItem && resegmentingIds[currentItem.item_id])}
                  saveCurrentCanvasForItem={saveCurrentCanvasForItem}
                  setSelectedItemId={setSelectedItemId}
                  badgeClass={badgeClass}
                  showAdvancedImageOptions={showAdvancedImageOptions}
                  setShowAdvancedImageOptions={setShowAdvancedImageOptions}
                  imageParams={currentImageParams}
                  onImageParamsChange={updateCurrentImageParams}
                  onApplyImageParamsToAll={applyImageParamsToAll}
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
                  analysisParams={currentAnalysisParams}
                  onAnalysisParamsChange={updateCurrentAnalysisParams}
                  onRerunAnalysis={rerunCurrentAnalysis}
                  onApplyAnalysisParamsToAll={applyAnalysisParamsToAllAndRerun}
                  isRunning={isRunning}
                  isAnalysisStale={isCurrentAnalysisStale}
                  status={status}
                  outputSections={outputSections}
                  setViewerImage={setViewerImage}
                  importantMetrics={importantMetrics}
                />
              )}

              {activeTab === "export" && (
                <ExportStage
                  currentItem={currentItem}
                  handleExportCurrentPdf={() => void handleExportCurrentPdf()}
                  currentAnalysis={currentAnalysis}
                  exportTarget={exportTarget}
                  handleExportBatchPdf={() => void handleExportBatchPdf()}
                  handleExportCsv={handleExportCsv}
                  analysisMap={analysisMap}
                />
              )}
            </div>
          </div>

          <WizardBar
            onBack={() => activeIndex > 0 && goToStep(WIZARD_STEPS[activeIndex - 1].id)}
            backDisabled={activeIndex === 0}
            status={status}
            isBusy={isBusy}
          >
            {primaryAction()}
          </WizardBar>
        </section>

        <ImageViewerModal viewerImage={viewerImage} onClose={() => setViewerImage(null)} />
      </main>
    </>
  );
}
