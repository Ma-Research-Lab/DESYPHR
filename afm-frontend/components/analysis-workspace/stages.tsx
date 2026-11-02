"use client";

import type { Dispatch, MouseEventHandler, RefObject, SetStateAction } from "react";

import {
  runButtonStyle,
  secondaryButtonStyle,
  smallLabelStyle,
  toolButtonStyle,
} from "./helpers";
import { FillImage, FitGrid, FitTile, Panel, SliderRow } from "./ui";
import { DEFAULT_ANALYSIS_PARAMS, DEFAULT_IMAGE_PARAMS } from "./types";
import type {
  AnalysisParams,
  AnalysisResponse,
  ImageParams,
  MaskStroke,
  OutputSection,
  UploadBatchResponse,
  UploadItem,
  ViewerImage,
} from "./types";

export function UploadStage({
  hiddenFileInputRef,
  isDragActive,
  setIsDragActive,
  setFilesFromInput,
  selectedFiles,
  selectedFilePreviewUrls,
  setSelectedFiles,
  batchData,
}: {
  hiddenFileInputRef: RefObject<HTMLInputElement | null>;
  isDragActive: boolean;
  setIsDragActive: Dispatch<SetStateAction<boolean>>;
  setFilesFromInput: (files: File[], append?: boolean) => void;
  selectedFiles: File[];
  selectedFilePreviewUrls: string[];
  setSelectedFiles: Dispatch<SetStateAction<File[]>>;
  batchData: UploadBatchResponse | null;
}) {
  const hasFiles = selectedFiles.length > 0;

  return (
    <Panel title="Input Batch">
      <div
        onClick={() => hiddenFileInputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragActive(false);
          setFilesFromInput(Array.from(e.dataTransfer.files || []), true);
        }}
        style={{
          border: "1px dashed var(--border)",
          borderRadius: 6,
          padding: hasFiles ? "18px 24px" : "clamp(32px, 7vw, 64px) 24px",
          textAlign: "center",
          cursor: "pointer",
          background: isDragActive ? "var(--accentTintStrong)" : "var(--surface2)",
        }}
      >
        <input
          ref={hiddenFileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.tif,.tiff"
          multiple
          onChange={(e) => setFilesFromInput(Array.from(e.target.files || []), true)}
          style={{ display: "none" }}
        />
        {!hasFiles ? <div style={{ fontSize: "2.4rem", color: "var(--accent)", opacity: 0.8 }}>⤴</div> : null}
        <div style={{ fontSize: hasFiles ? "0.88rem" : "1rem", fontWeight: 700, letterSpacing: "0.05em" }}>
          {hasFiles ? "+ Add more images" : "Drop AFM images here"}
        </div>
        <div style={{ fontSize: "0.73rem", color: "var(--muted)", marginTop: 4 }}>
          {hasFiles ? "Drop or click to browse" : "or click to browse · JPG, PNG, TIFF · multiple files supported"}
        </div>
      </div>

      {hasFiles ? (
        <div style={{ marginTop: 16 }}>
          <div style={smallLabelStyle}>
            {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} selected
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="ws-row"
                style={{
                  position: "relative",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 6,
                  background: "var(--surface2)",
                  minWidth: 0,
                }}
              >
                <div style={{ aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden", background: "var(--imageBg)" }}>
                  {selectedFilePreviewUrls[idx] ? (
                    <img
                      src={selectedFilePreviewUrls[idx]}
                      alt={file.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : null}
                </div>
                <div
                  title={file.name}
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    marginTop: 6,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {idx + 1}. {file.name}
                </div>
                <div style={{ fontSize: "0.66rem", color: "var(--muted)" }}>{(file.size / 1024).toFixed(1)} KB</div>
                <button
                  type="button"
                  onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                  title="Remove file"
                  aria-label={`Remove ${file.name}`}
                  className="px-flat"
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--muted)",
                    borderRadius: 4,
                    width: 24,
                    height: 24,
                    lineHeight: "20px",
                    textAlign: "center",
                    cursor: "pointer",
                    fontWeight: 700,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {batchData?.items?.length ? (
        <div style={{ marginTop: 14, fontSize: "0.74rem", color: "var(--muted)", lineHeight: 1.6 }}>
          {batchData.items.length} image{batchData.items.length === 1 ? " is" : "s are"} already uploaded. Uploading again
          starts the review over and clears mask edits and results.
        </div>
      ) : null}
    </Panel>
  );
}

export function ReviewStage({
  batchData,
  analysisMap,
  editedMaskMap,
  currentItem,
  classifierClass,
  onClassificationOverride,
  saveCurrentCanvasForItem,
  setSelectedItemId,
  badgeClass,
  imageParams,
  onImageParamsChange,
  onApplyImageParamsToAll,
  maskMode,
  setMaskMode,
  toolMode,
  setToolMode,
  resetMask,
  undoLastStroke,
  redoLastStroke,
  brushSize,
  setBrushSize,
  maskOverlayOpacity,
  setMaskOverlayOpacity,
  canvasRef,
  startDrawing,
  stopDrawing,
  draw,
  strokeCount,
  selectedItemStrokes,
  selectLayer,
  flashLayerId,
  selectedLayerId,
  removeStrokeById,
  maskLayerId,
  canvasSize,
  isResegmenting,
}: {
  batchData: UploadBatchResponse | null;
  analysisMap: Record<string, AnalysisResponse>;
  editedMaskMap: Record<string, string>;
  currentItem: UploadItem | null;
  classifierClass: string;
  onClassificationOverride: (itemId: string, predictedClass: string) => void;
  saveCurrentCanvasForItem: (itemId?: string) => void;
  setSelectedItemId: Dispatch<SetStateAction<string>>;
  badgeClass: (name?: string) => string;
  imageParams: ImageParams;
  onImageParamsChange: (patch: Partial<ImageParams>) => void;
  onApplyImageParamsToAll: () => void;
  maskMode: "use" | "edit";
  setMaskMode: Dispatch<SetStateAction<"use" | "edit">>;
  toolMode: "draw" | "erase";
  setToolMode: Dispatch<SetStateAction<"draw" | "erase">>;
  resetMask: () => void;
  undoLastStroke: () => void;
  redoLastStroke: () => void;
  brushSize: number;
  setBrushSize: Dispatch<SetStateAction<number>>;
  maskOverlayOpacity: number;
  setMaskOverlayOpacity: Dispatch<SetStateAction<number>>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  startDrawing: MouseEventHandler<HTMLCanvasElement>;
  stopDrawing: () => void;
  draw: MouseEventHandler<HTMLCanvasElement>;
  strokeCount: number;
  selectedItemStrokes: MaskStroke[];
  selectLayer: (strokeId: string) => void;
  flashLayerId: string;
  selectedLayerId: string;
  removeStrokeById: (strokeId: string) => void;
  maskLayerId: string;
  canvasSize: number;
  isResegmenting: boolean;
}) {
  const isIrregular = currentItem?.predicted_class === "irregular";
  const selectStyle = {
    width: "100%",
    padding: "4px 8px",
    borderRadius: 5,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
  };
  const optionBoxStyle = { border: "1px solid var(--border)", borderRadius: 6, padding: 10, background: "var(--surface2)" };
  const checkboxRowStyle = { display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text)" };

  const isEditing = maskMode === "edit";
  const compactButton = { ...secondaryButtonStyle, padding: "5px 10px", fontSize: "0.76rem" };
  const compactTool = (active: boolean) => ({ ...toolButtonStyle(active), padding: "5px 10px", fontSize: "0.76rem" });
  const layerChip = (active: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 4px 3px 9px",
    borderRadius: 4,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: active ? "var(--accentTint)" : "var(--surface2)",
    color: "var(--text)",
    fontSize: "0.72rem",
    cursor: "pointer",
  });
  const sliderLabel = { fontSize: "0.7rem", color: "var(--muted)", whiteSpace: "nowrap" as const };

  return (
    <div className="wiz-fit wiz-review">
      <div className="wiz-col">
        <Panel title="Batch Items" fill cap>
          {batchData?.items?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {batchData.items.map((item) => {
                const isSelected = item.item_id === currentItem?.item_id;
                const isDone = !!analysisMap[item.item_id];
                const isEdited = !!editedMaskMap[item.item_id];

                return (
                  <button
                    key={item.item_id}
                    className="px-flat ws-row"
                    onClick={() => {
                      saveCurrentCanvasForItem(currentItem?.item_id);
                      setSelectedItemId(item.item_id);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: isSelected ? "var(--accentTint)" : "var(--surface)",
                      color: "var(--text)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ fontSize: "0.74rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.item_index}. {item.original_filename}
                    </div>
                    <div style={{ fontSize: "0.66rem", color: "var(--muted)", marginTop: 2 }}>
                      {badgeClass(item.predicted_class)} ·{" "}
                      {isDone ? "Analysis complete" : isEdited ? "Edited mask saved" : "Pending analysis"}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "var(--muted)", fontSize: "0.74rem" }}>No batch uploaded yet.</div>
          )}
        </Panel>

        <Panel title="Morphology Detection" fill>
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            <span
              style={{
                justifySelf: "start",
                padding: "3px 10px",
                borderRadius: 4,
                fontSize: "0.74rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                background: "var(--accentTint)",
                color: "var(--accent)",
              }}
            >
              CLASS {currentItem ? badgeClass(currentItem.predicted_class) : "NO IMAGE"}
            </span>
            <label style={{ display: "grid", gap: 4, fontSize: "0.7rem", color: "var(--muted)" }}>
              <span>Classification override{classifierClass ? ` · CNN: ${badgeClass(classifierClass)}` : ""}</span>
              <select
                value={currentItem?.predicted_class || ""}
                disabled={!currentItem}
                onChange={(event) => currentItem && onClassificationOverride(currentItem.item_id, event.target.value)}
                style={selectStyle}
              >
                <option value="dots">Dots</option>
                <option value="lines">Lines</option>
                <option value="mixed">Mixed</option>
                <option value="irregular">Irregular</option>
              </select>
            </label>
          </div>
          <div style={{ ...smallLabelStyle, marginBottom: 4 }}>Original Image</div>
          <FillImage src={currentItem?.original_image_url || ""} alt={currentItem?.original_filename || "Original image"} />
        </Panel>
      </div>

      <Panel
        title={isIrregular ? "Mask Editor · binarized mask" : "Mask Editor"}
        fill
        aside={
          isIrregular ? (
            <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--muted)", display: "flex", gap: 12 }}>
              <span>
                Feature pixels:{" "}
                <strong style={{ color: "var(--text)" }}>
                  {currentItem?.black_pixel_percent != null ? `${currentItem.black_pixel_percent}%` : "—"}
                </strong>
              </span>
              <span aria-live="polite" style={{ color: isResegmenting ? "var(--accent)" : "var(--muted)" }}>
                {isResegmenting ? "Updating mask…" : "Mask up to date"}
              </span>
            </span>
          ) : null
        }
      >
        <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div role="radiogroup" aria-label="Mask" style={{ display: "inline-flex", marginRight: 6 }}>
            <button
              type="button"
              role="radio"
              aria-checked={!isEditing}
              onClick={() => setMaskMode("use")}
              style={{ ...compactTool(!isEditing), borderRadius: "4px 0 0 4px" }}
            >
              ▶ Use as-is
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={isEditing}
              onClick={() => setMaskMode("edit")}
              style={{ ...compactTool(isEditing), borderRadius: "0 4px 4px 0", marginLeft: -1 }}
            >
              ✎ Edit mask
            </button>
          </div>
          <button onClick={() => setToolMode("draw")} disabled={!isEditing} title="Paint features in black" style={compactTool(toolMode === "draw")}>
            Draw
          </button>
          <button onClick={() => setToolMode("erase")} disabled={!isEditing} title="Erase the selected layer to white" style={compactTool(toolMode === "erase")}>
            Erase
          </button>
          <button onClick={undoLastStroke} disabled={!isEditing} style={compactButton}>
            Undo
          </button>
          <button onClick={redoLastStroke} disabled={!isEditing} style={compactButton}>
            Redo
          </button>
          <button onClick={resetMask} disabled={!isEditing} style={compactButton}>
            Reset
          </button>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 8, flexWrap: "wrap" }}>
          <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
            <span style={sliderLabel}>Brush px</span>
            <input
              type="range"
              min={2}
              max={40}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              style={{ flex: 1, accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: "0.7rem", color: "var(--accent)", minWidth: 24 }}>{brushSize}</span>
          </label>
          <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
            <span style={sliderLabel}>Mask opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={maskOverlayOpacity}
              onChange={(e) => setMaskOverlayOpacity(Number(e.target.value))}
              style={{ flex: 1, accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: "0.7rem", color: "var(--accent)", minWidth: 36 }}>
              {Math.round(maskOverlayOpacity * 100)}%
            </span>
          </label>
        </div>

        <div
          className="wiz-canvas-box"
          style={{
            background: "var(--imageBg)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            opacity: isResegmenting ? 0.7 : 1,
            transition: "opacity 120ms",
          }}
        >
          <div className="wiz-canvas-frame" style={{ position: "relative", background: "var(--imageBg)" }}>
                {currentItem?.original_image_url?.trim() ? (
                  <img
                    src={currentItem.original_image_url}
                    alt={currentItem.original_filename || "Original AFM"}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                      background: "var(--imageBg)",
                      pointerEvents: "none",
                      zIndex: 0,
                    }}
                  />
                ) : null}
                <canvas
                  ref={canvasRef}
                  width={canvasSize}
                  height={canvasSize}
                  onMouseDown={startDrawing}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onMouseMove={draw}
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    cursor: maskMode === "edit" ? "crosshair" : "not-allowed",
                    pointerEvents: currentItem && maskMode === "edit" ? "auto" : "none",
                    background: "var(--imageBg)",
                    opacity: maskOverlayOpacity,
                    position: "relative",
                    zIndex: 1,
                  }}
                />
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8, maxHeight: 62, overflowY: "auto", flexShrink: 0 }}>
          {isEditing ? (
            <>
              <span style={{ ...sliderLabel, marginRight: 2 }}>Layers:</span>
              <span
                onClick={() => selectLayer(maskLayerId)}
                title="Base mask layer. Select it to erase directly from the mask."
                style={{ ...layerChip(selectedLayerId === maskLayerId || flashLayerId === maskLayerId), paddingRight: 9 }}
              >
                Mask
              </span>
              {selectedItemStrokes.map((stroke, index) => (
                <span
                  key={stroke.id}
                  onClick={() => selectLayer(stroke.id)}
                  title={`Brush ${stroke.brushSize}px`}
                  style={layerChip(selectedLayerId === stroke.id || flashLayerId === stroke.id)}
                >
                  Layer {index + 1}
                  <button
                    type="button"
                    aria-label={`Remove layer ${index + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeStrokeById(stroke.id);
                    }}
                    className="px-flat"
                    style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", padding: "0 4px", fontWeight: 700 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </>
          ) : (
            <span style={sliderLabel}>Using the mask as-is. Choose Edit mask to correct it.</span>
          )}
          <span style={{ ...sliderLabel, marginLeft: "auto" }}>
            {strokeCount} stroke{strokeCount === 1 ? "" : "s"}
            {currentItem?.item_id && editedMaskMap[currentItem.item_id] ? " · edits saved" : ""}
          </span>
        </div>
      </Panel>

      <Panel title={isIrregular ? "Binarization Options" : "Segmentation Options"}
        fill
        aside={isIrregular ? <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "var(--muted)" }}>Mask updates live</span> : null}
      >
        {!currentItem ? (
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
            Upload images to adjust per-image segmentation settings.
          </div>
        ) : null}
        <fieldset disabled={!currentItem} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
          <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onImageParamsChange(DEFAULT_IMAGE_PARAMS)}
              style={{ ...compactButton, flex: 1 }}
            >
              Reset Parameters
            </button>
            {(batchData?.items?.length || 0) > 1 ? (
              <button type="button" onClick={onApplyImageParamsToAll} style={{ ...compactButton, flex: 1 }}>
                Apply to All Images
              </button>
            ) : null}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
              <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, background: "var(--surface2)" }}>
                <div style={{ ...smallLabelStyle, marginBottom: 8 }}>Preprocessing</div>
                <div style={{ display: "grid", gap: 7 }}>
                  <SliderRow compact label="Denoise Strength" min={0} max={30} step={1} value={imageParams.denoise} onChange={(value) => onImageParamsChange({ denoise: Math.round(value) })} />
                  <SliderRow compact label="Sharpen / Deblur" min={0} max={10} step={1} value={imageParams.sharpen} onChange={(value) => onImageParamsChange({ sharpen: Math.round(value) })} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <label style={checkboxRowStyle}>
                      <input type="checkbox" checked={imageParams.grayscale} onChange={(e) => onImageParamsChange({ grayscale: e.target.checked })} />
                      Convert to Grayscale
                    </label>
                    <label style={checkboxRowStyle}>
                      <input type="checkbox" checked={imageParams.invertPixels} onChange={(e) => onImageParamsChange({ invertPixels: e.target.checked })} />
                      Invert Pixels
                    </label>
                  </div>
                </div>
              </div>

              {isIrregular ? (
                <div style={optionBoxStyle}>
                  <div style={{ ...smallLabelStyle, marginBottom: 8 }}>Threshold Methods</div>
                  <div style={{ display: "grid", gap: 7 }}>
                    <label style={checkboxRowStyle}>
                      <input type="checkbox" checked={imageParams.binarizeAdaptive} onChange={(e) => onImageParamsChange({ binarizeAdaptive: e.target.checked })} />
                      Adaptive threshold
                    </label>
                    <label style={checkboxRowStyle}>
                      <input type="checkbox" checked={imageParams.binarizeNiblack} onChange={(e) => onImageParamsChange({ binarizeNiblack: e.target.checked })} />
                      Niblack threshold
                    </label>
                    {imageParams.binarizeAdaptive && imageParams.binarizeNiblack ? (
                      <label style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.4fr)", alignItems: "center", gap: 8, fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)" }}>
                        <span>Combine Logic</span>
                        <select
                          value={imageParams.binarizeCombineMode}
                          onChange={(e) => onImageParamsChange({ binarizeCombineMode: e.target.value as ImageParams["binarizeCombineMode"] })}
                          style={selectStyle}
                        >
                          <option value="OR">OR</option>
                          <option value="AND">AND</option>
                          <option value="adaptive">Adaptive only</option>
                          <option value="niblack">Niblack only</option>
                          <option value="weighted">Weighted</option>
                        </select>
                      </label>
                    ) : null}
                    {imageParams.binarizeAdaptive && imageParams.binarizeNiblack && imageParams.binarizeCombineMode === "weighted" ? (
                      <SliderRow compact label="Alpha (adaptive weight)" min={0} max={1} step={0.05} value={imageParams.binarizeAlpha} onChange={(value) => onImageParamsChange({ binarizeAlpha: value })} />
                    ) : null}
                    <label style={checkboxRowStyle}>
                      <input type="checkbox" checked={imageParams.invertMask} onChange={(e) => onImageParamsChange({ invertMask: e.target.checked })} />
                      Invert Mask
                    </label>
                  </div>
                </div>
              ) : (
                <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, background: "var(--surface2)" }}>
                  <div style={{ ...smallLabelStyle, marginBottom: 8 }}>Postprocessing</div>
                  <div style={{ display: "grid", gap: 7 }}>
                    <SliderRow compact label="Confidence Threshold" min={0.1} max={0.9} step={0.01} value={imageParams.threshold} onChange={(value) => onImageParamsChange({ threshold: value })} />
                    <SliderRow compact label="Remove Noise" min={0} max={7} step={1} value={imageParams.morphology} onChange={(value) => onImageParamsChange({ morphology: Math.round(value) })} />
                    <label style={checkboxRowStyle}>
                      <input type="checkbox" checked={imageParams.invertMask} onChange={(e) => onImageParamsChange({ invertMask: e.target.checked })} />
                      Invert Mask
                    </label>
                  </div>
                </div>
              )}
            </div>

            {isIrregular ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
                <div style={{ ...optionBoxStyle, opacity: imageParams.binarizeAdaptive ? 1 : 0.5 }}>
                  <div style={{ ...smallLabelStyle, marginBottom: 8 }}>Adaptive</div>
                  <div style={{ display: "grid", gap: 7 }}>
                    <label style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.4fr)", alignItems: "center", gap: 8, fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)" }}>
                      <span>Adaptive Method</span>
                      <select
                        value={imageParams.binarizeAdaptiveMethod}
                        onChange={(e) => onImageParamsChange({ binarizeAdaptiveMethod: e.target.value as ImageParams["binarizeAdaptiveMethod"] })}
                        disabled={!imageParams.binarizeAdaptive}
                        style={selectStyle}
                      >
                        <option value="gaussian">Gaussian</option>
                        <option value="mean">Mean</option>
                      </select>
                    </label>
                    <SliderRow compact label="Block Size" min={3} max={101} step={2} value={imageParams.binarizeBlockSize} onChange={(value) => onImageParamsChange({ binarizeBlockSize: Math.round(value) | 1 })} />
                    <SliderRow compact label="C Value" min={-50} max={30} step={1} value={imageParams.binarizeC} onChange={(value) => onImageParamsChange({ binarizeC: Math.round(value) })} />
                  </div>
                </div>

                <div style={optionBoxStyle}>
                  <div style={{ ...smallLabelStyle, marginBottom: 8 }}>Niblack + Filters</div>
                  <div style={{ display: "grid", gap: 7 }}>
                    <div style={{ display: "grid", gap: 7, opacity: imageParams.binarizeNiblack ? 1 : 0.5 }}>
                      <SliderRow compact label="Niblack k" min={-1} max={1} step={0.05} value={imageParams.binarizeK} onChange={(value) => onImageParamsChange({ binarizeK: value })} />
                      <SliderRow compact label="Niblack Window" min={3} max={111} step={2} value={imageParams.binarizeNiblackWindow} onChange={(value) => onImageParamsChange({ binarizeNiblackWindow: Math.round(value) | 1 })} />
                    </div>
                    <label style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.4fr)", alignItems: "center", gap: 8, fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)" }}>
                      <span>Blur</span>
                      <select
                        value={imageParams.binarizeBlur}
                        onChange={(e) => onImageParamsChange({ binarizeBlur: e.target.value as ImageParams["binarizeBlur"] })}
                        style={selectStyle}
                      >
                        <option value="none">None</option>
                        <option value="gaussian">Gaussian</option>
                        <option value="median">Median</option>
                        <option value="bilateral">Bilateral</option>
                      </select>
                    </label>
                    {imageParams.binarizeBlur === "gaussian" || imageParams.binarizeBlur === "median" ? (
                      <SliderRow compact label="Blur Kernel" min={3} max={21} step={2} value={imageParams.binarizeBlurKsize} onChange={(value) => onImageParamsChange({ binarizeBlurKsize: Math.round(value) | 1 })} />
                    ) : null}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <label style={checkboxRowStyle}>
                        <input type="checkbox" checked={imageParams.binarizeEqualize} onChange={(e) => onImageParamsChange({ binarizeEqualize: e.target.checked })} />
                        Equalize histogram
                      </label>
                      <label style={checkboxRowStyle}>
                        <input type="checkbox" checked={imageParams.binarizeClahe} onChange={(e) => onImageParamsChange({ binarizeClahe: e.target.checked })} />
                        CLAHE
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

        </fieldset>
      </Panel>
    </div>
  );
}

export function ResultsStage({
  batchData,
  currentItem,
  currentAnalysis,
  analysisMap,
  setSelectedItemId,
  badgeClass,
  showAdvancedAnalysisOptions,
  setShowAdvancedAnalysisOptions,
  analysisParams,
  onAnalysisParamsChange,
  onRerunAnalysis,
  onApplyAnalysisParamsToAll,
  isRunning,
  isAnalysisStale,
  outputSections,
  setViewerImage,
  importantMetrics,
}: {
  batchData: UploadBatchResponse | null;
  currentItem: UploadItem | null;
  currentAnalysis: AnalysisResponse | null;
  analysisMap: Record<string, AnalysisResponse>;
  setSelectedItemId: Dispatch<SetStateAction<string>>;
  badgeClass: (name?: string) => string;
  showAdvancedAnalysisOptions: boolean;
  setShowAdvancedAnalysisOptions: Dispatch<SetStateAction<boolean>>;
  analysisParams: AnalysisParams;
  onAnalysisParamsChange: (patch: Partial<AnalysisParams>) => void;
  onRerunAnalysis: () => void;
  onApplyAnalysisParamsToAll: () => void;
  isRunning: boolean;
  isAnalysisStale: boolean;
  status: string;
  outputSections: OutputSection[];
  setViewerImage: Dispatch<SetStateAction<ViewerImage | null>>;
  importantMetrics: AnalysisResponse["metrics"];
}) {
  // Controls edit the selected image's own settings; Rerun applies them.
  const {
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
    irregularInvertSpacing,
  } = analysisParams;
  const setParam =
    <K extends keyof AnalysisParams>(key: K) =>
    (value: AnalysisParams[K]) =>
      onAnalysisParamsChange({ [key]: value } as Pick<AnalysisParams, K>);
  const setImageSizeUm = setParam("imageSizeUm");
  const setColorwheelClusters = setParam("colorwheelClusters");
  const setShowColorwheelDebug = setParam("showColorwheelDebug");
  const setVoronoiThresholdEdge = setParam("voronoiThresholdEdge");
  const setVoronoiMaxSize = setParam("voronoiMaxSize");
  const setVoronoiPackingEdges = setParam("voronoiPackingEdges");
  const setVoronoiExtractDots = setParam("voronoiExtractDots");
  const setMinCircularity = setParam("minCircularity");
  const setMaxAspectRatio = setParam("maxAspectRatio");
  const setMinArea = setParam("minArea");
  const setMaxArea = setParam("maxArea");
  const setIrregularInvertSpacing = setParam("irregularInvertSpacing");

  const seenSrc = new Set<string>();
  const outputs = outputSections
    .flatMap((section) =>
      section.items.map((output, idx) => ({ ...output, key: `${section.title}-${output.label}-${idx}` })),
    )
    .filter((output) => !seenSrc.has(output.src) && !!seenSrc.add(output.src));
  const spacing = currentAnalysis?.domain_spacing && !currentAnalysis.domain_spacing.error ? currentAnalysis.domain_spacing : null;
  const summaryTiles = [
    ...(spacing
      ? [
          { key: "spacing-mean", label: "Mean spacing", value: `${spacing.mean_spacing_nm.toFixed(2)} nm` },
          { key: "spacing-median", label: "Median spacing", value: `${spacing.median_spacing_nm.toFixed(2)} nm` },
          { key: "spacing-std", label: "Spacing std dev", value: `${spacing.std_spacing_nm.toFixed(2)} nm` },
          ...(currentItem?.predicted_class !== "irregular"
            ? [{ key: "spacing-n", label: "Measurements", value: `${spacing.num_measurements}` }]
            : []),
        ]
      : []),
    ...importantMetrics
      .filter((metric) => !spacing || !["mean_spacing_nm", "median_spacing_nm", "std_spacing_nm"].includes(metric.key))
      .map((metric) => ({ key: metric.key, label: metric.label, value: String(metric.value) })),
  ];
  const hasControls = !!currentItem && ["dots", "mixed", "lines", "irregular"].includes(currentItem.predicted_class);
  const compactButton = { ...secondaryButtonStyle, padding: "5px 10px", fontSize: "0.76rem" };

  return (
    <div className="wiz-fit wiz-results">
      <div className="wiz-col">
        <Panel title="Batch Results" fill cap>
          {batchData?.items?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {batchData.items.map((item) => {
                const isSelected = item.item_id === currentItem?.item_id;
                const isDone = !!analysisMap[item.item_id];
                return (
                  <button
                    key={item.item_id}
                    className="px-flat ws-row"
                    onClick={() => setSelectedItemId(item.item_id)}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      textAlign: "left",
                      padding: "5px 8px",
                      borderRadius: 6,
                      border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: isSelected ? "var(--accentTint)" : "var(--surface)",
                      color: "var(--text)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 3,
                        border: "1px solid var(--border)",
                        overflow: "hidden",
                        background: "var(--imageBg)",
                        flexShrink: 0,
                      }}
                    >
                      {item.original_image_url?.trim() ? (
                        <img
                          src={item.original_image_url}
                          alt={item.original_filename}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : null}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "0.74rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.original_filename}
                      </div>
                      <div style={{ fontSize: "0.66rem", color: "var(--muted)", marginTop: 2 }}>
                        {badgeClass(item.predicted_class)} · {isDone ? "Ready to inspect" : "Not analyzed yet"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "var(--muted)", fontSize: "0.74rem" }}>No batch available.</div>
          )}
        </Panel>

        {hasControls && currentItem ? (
          <Panel
            title="Analysis Controls"
            fill
            aside={
              <span style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => onAnalysisParamsChange(DEFAULT_ANALYSIS_PARAMS)}
                  disabled={isRunning}
                  style={{ ...compactButton, fontWeight: 400 }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdvancedAnalysisOptions((prev) => !prev)}
                  style={{ ...compactButton, fontWeight: 400 }}
                >
                  {showAdvancedAnalysisOptions ? "Hide" : "Options"}
                </button>
              </span>
            }
          >
            <div style={{ flex: 1 }}>
          {showAdvancedAnalysisOptions ? (
            <>
              {currentItem.predicted_class === "irregular" ? (
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--text)",
                    marginBottom: 10,
                    textTransform: "uppercase",
                  }}
                >
                  Spacing Analysis - Irregular Pipeline
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: 8 }}>
                <SliderRow compact label="Image Size (µm)" min={0.1} max={10} step={0.1} value={imageSizeUm} onChange={setImageSizeUm} />

                {currentItem.predicted_class === "lines" || currentItem.predicted_class === "mixed" ? (
                  <>
                    <SliderRow compact label="Clusters" min={2} max={5} step={1} value={colorwheelClusters} onChange={(value) => setColorwheelClusters(Math.round(value))} />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text)" }}>
                      <input
                        type="checkbox"
                        checked={showColorwheelDebug}
                        onChange={(e) => setShowColorwheelDebug(e.target.checked)}
                      />
                      Show FFT peak diagnostics
                    </label>
                  </>
                ) : null}

                {currentItem.predicted_class === "dots" || currentItem.predicted_class === "mixed" ? (
                  <>
                    <SliderRow compact label="Voronoi Spacing Tolerance" min={0.05} max={0.5} step={0.01} value={voronoiThresholdEdge} onChange={setVoronoiThresholdEdge} />
                    <SliderRow compact label="Voronoi Max Size" min={256} max={2048} step={128} value={voronoiMaxSize} onChange={(value) => setVoronoiMaxSize(Math.round(value))} />
                    <label style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)", alignItems: "center", gap: 8, fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)" }}>
                      <span>Packing pattern</span>
                      <select
                        value={voronoiPackingEdges}
                        onChange={(e) => setVoronoiPackingEdges(Number(e.target.value) as 4 | 6)}
                        style={{
                          width: "100%",
                          padding: "4px 8px",
                          borderRadius: 5,
                          border: "1px solid var(--border)",
                          background: "var(--surface2)",
                          color: "var(--text)",
                        }}
                      >
                        <option value={6}>Hexagonal (6)</option>
                        <option value={4}>Square (4)</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text)" }}>
                      <input
                        type="checkbox"
                        checked={voronoiExtractDots}
                        onChange={(e) => setVoronoiExtractDots(e.target.checked)}
                      />
                      Extract dots before Voronoi
                    </label>
                  </>
                ) : null}
              </div>

              {(currentItem.predicted_class === "dots" || currentItem.predicted_class === "mixed") && voronoiExtractDots ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: 8 }}>
                  <SliderRow compact label="Min Circularity" min={0.1} max={1} step={0.05} value={minCircularity} onChange={setMinCircularity} />
                  <SliderRow compact label="Max Aspect Ratio" min={1} max={5} step={0.1} value={maxAspectRatio} onChange={setMaxAspectRatio} />
                  <SliderRow compact label="Min Area (0 = keep all)" min={0} max={100} step={1} value={minArea} onChange={(value) => setMinArea(Math.round(value))} />
                  <SliderRow compact label="Max Area" min={50} max={2000} step={10} value={maxArea} onChange={(value) => setMaxArea(Math.round(value))} />
                </div>
              ) : null}

              {currentItem.predicted_class === "irregular" ? (
                <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", lineHeight: 1.6 }}>
                    Binarization settings are set per image in Upload &amp; edit, where the mask previews as you adjust them.
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--text)" }}>
                    <input type="checkbox" checked={irregularInvertSpacing} onChange={(e) => setIrregularInvertSpacing(e.target.checked)} />
                    Invert feature phase for spacing
                  </label>
                </div>
              ) : null}
            </>
          ) : null}

            </div>

            <div style={{ display: "grid", gap: 6, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={onRerunAnalysis} disabled={isRunning} style={{ ...runButtonStyle, flex: 1, justifyContent: "center", padding: "7px 10px" }}>
                  {isRunning ? "Running..." : "⟳ Rerun"}
                </button>
                {(batchData?.items?.length || 0) > 1 ? (
                  <button type="button" onClick={onApplyAnalysisParamsToAll} disabled={isRunning} style={{ ...compactButton, flex: 1 }}>
                    Apply to all &amp; rerun
                  </button>
                ) : null}
              </div>
              {isAnalysisStale && !isRunning ? (
                <span style={{ fontSize: "0.7rem", color: "var(--yellow)" }}>Settings changed. Rerun to update the results.</span>
              ) : null}
            </div>
          </Panel>
        ) : null}
      </div>

      <div className="wiz-col">
        <Panel
          title={currentAnalysis ? `Image Outputs · ${badgeClass(currentItem?.predicted_class)}` : "Image Outputs"}
          fill
          aside={
            outputs.length ? (
              <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "var(--muted)" }}>Click an image to enlarge</span>
            ) : null
          }
        >
          {outputs.length ? (
            <FitGrid count={outputs.length}>
              {outputs.map((output) => (
                <FitTile key={output.key} label={output.label} src={output.src} caption={output.caption} onOpen={setViewerImage} />
              ))}
            </FitGrid>
          ) : (
            <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>No analysis result yet for the selected image.</div>
          )}
        </Panel>

      </div>

      <Panel title="Analysis Summary" fill>
        {summaryTiles.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
            <tbody>
              {summaryTiles.map((tile, idx) => (
                <tr key={tile.key} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 ? "transparent" : "var(--surface2)" }}>
                  <td style={{ padding: "6px 8px", color: "var(--muted)", lineHeight: 1.3 }}>{tile.label}</td>
                  <td style={{ padding: "6px 8px", color: "var(--text)", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {tile.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
            The image outputs contain the main analysis results for this image.
          </div>
        )}
      </Panel>
    </div>
  );
}

export function ExportStage({
  batchData,
  currentItem,
  setSelectedItemId,
  handleExportCurrentPdf,
  currentAnalysis,
  exportTarget,
  handleExportBatchPdf,
  handleExportCsv,
  analysisMap,
}: {
  batchData: UploadBatchResponse | null;
  currentItem: UploadItem | null;
  setSelectedItemId: Dispatch<SetStateAction<string>>;
  handleExportCurrentPdf: () => void;
  currentAnalysis: AnalysisResponse | null;
  exportTarget: "current" | "batch" | null;
  handleExportBatchPdf: () => void;
  handleExportCsv: () => void;
  analysisMap: Record<string, AnalysisResponse>;
}) {
  const analyzedCount = Object.keys(analysisMap).length;
  const isExporting = exportTarget !== null;

  // Step through the analyzed images here instead of going back to Results.
  const analyzedItems = (batchData?.items || []).filter((item) => analysisMap[item.item_id]);
  const pickerIndex = analyzedItems.findIndex((item) => item.item_id === currentItem?.item_id);
  const stepImage = (delta: number) => {
    if (!analyzedItems.length) return;
    const from = pickerIndex < 0 ? (delta > 0 ? -1 : 0) : pickerIndex;
    const next = (from + delta + analyzedItems.length) % analyzedItems.length;
    setSelectedItemId(analyzedItems[next].item_id);
  };
  const stepButtonStyle = { ...secondaryButtonStyle, padding: "8px 12px", flexShrink: 0 };
  const imagePicker = analyzedItems.length ? (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => stepImage(-1)}
          disabled={analyzedItems.length < 2 || isExporting}
          aria-label="Previous image"
          style={stepButtonStyle}
        >
          ‹
        </button>
        <select
          aria-label="Image to export"
          value={pickerIndex < 0 ? "" : currentItem?.item_id}
          disabled={isExporting}
          onChange={(e) => setSelectedItemId(e.target.value)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "8px 10px",
            borderRadius: 5,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
          }}
        >
          {pickerIndex < 0 ? <option value="">Choose an image</option> : null}
          {analyzedItems.map((item) => (
            <option key={item.item_id} value={item.item_id}>
              {item.item_index}. {item.original_filename}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => stepImage(1)}
          disabled={analyzedItems.length < 2 || isExporting}
          aria-label="Next image"
          style={stepButtonStyle}
        >
          ›
        </button>
      </div>
      {pickerIndex >= 0 && currentItem ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 4,
              border: "1px solid var(--border)",
              overflow: "hidden",
              background: "var(--imageBg)",
              flexShrink: 0,
            }}
          >
            {currentItem.original_image_url?.trim() ? (
              <img
                src={currentItem.original_image_url}
                alt={currentItem.original_filename}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : null}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", minWidth: 0 }}>
            Image {pickerIndex + 1} of {analyzedItems.length} · {String(currentItem.predicted_class).toUpperCase()}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  const cards = [
    {
      title: "Selected image",
      detail: `${currentItem?.original_filename || "No image selected"} as a single PDF report.`,
      picker: imagePicker,
      label: exportTarget === "current" ? "Exporting..." : "⭳ Download PDF",
      onClick: handleExportCurrentPdf,
      disabled: !currentAnalysis || isExporting,
    },
    {
      title: "Whole batch",
      detail: `All ${analyzedCount} analyzed image${analyzedCount === 1 ? "" : "s"} combined into one PDF.`,
      picker: null,
      label: exportTarget === "batch" ? "Exporting..." : "⭳ Download batch PDF",
      onClick: handleExportBatchPdf,
      disabled: !analyzedCount || isExporting,
    },
    {
      title: "Results table",
      detail: "Key metrics for every analyzed image as a CSV file.",
      picker: null,
      label: "⭳ Download CSV",
      onClick: handleExportCsv,
      disabled: !analyzedCount,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))",
        gap: 16,
        alignItems: "start",
      }}
    >
      {cards.map((card) => (
        <Panel key={card.title} title={card.title}>
          <div style={{ display: "grid", gap: 16 }}>
            {card.picker}
            <div style={{ color: "var(--muted)", fontSize: "0.76rem", lineHeight: 1.6, overflowWrap: "anywhere" }}>
              {card.detail}
            </div>
            <button onClick={card.onClick} disabled={card.disabled} style={runButtonStyle}>
              {card.label}
            </button>
          </div>
        </Panel>
      ))}
    </div>
  );
}
