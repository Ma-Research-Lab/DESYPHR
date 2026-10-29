"use client";

import type { Dispatch, MouseEventHandler, RefObject, SetStateAction } from "react";

import {
  runButtonStyle,
  secondaryButtonStyle,
  smallLabelStyle,
  toolButtonStyle,
} from "./helpers";
import { CompactMetric, ImageFrame, Panel, RadioOption, ResultsImage, SliderRow } from "./ui";
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
  showAdvancedImageOptions,
  setShowAdvancedImageOptions,
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
  showAdvancedImageOptions: boolean;
  setShowAdvancedImageOptions: Dispatch<SetStateAction<boolean>>;
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
  const showImageOptions = showAdvancedImageOptions || isIrregular;
  const selectStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 5,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
  };
  const optionBoxStyle = { border: "1px solid var(--border)", borderRadius: 6, padding: 14, background: "var(--surface2)" };
  const checkboxRowStyle = { display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" };

  return (
    <div className="wiz-review">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel title="Batch Items">
          {batchData?.items?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: isSelected ? "var(--accentTint)" : "var(--surface)",
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: "0.76rem", fontWeight: 700 }}>
                      {item.item_index}. {item.original_filename}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: 4 }}>
                      Class: {badgeClass(item.predicted_class)} ·{" "}
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

        <Panel title="Morphology Detection">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                borderRadius: 4,
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                background: "var(--accentTint)",
                color: "var(--accent)",
                border: "1px solid transparent",
              }}
            >
              CLASS {currentItem ? badgeClass(currentItem.predicted_class) : "NO IMAGE"}
            </span>

            <label style={{ display: "grid", gap: 5, fontSize: "0.7rem", color: "var(--muted)", minWidth: 220 }}>
              <span>Classification override{classifierClass ? ` · CNN: ${badgeClass(classifierClass)}` : ""}</span>
              <select
                value={currentItem?.predicted_class || ""}
                disabled={!currentItem}
                onChange={(event) => currentItem && onClassificationOverride(currentItem.item_id, event.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 5,
                  border: "1px solid var(--border)",
                  background: "var(--surface2)",
                  color: "var(--text)",
                }}
              >
                <option value="dots">Dots</option>
                <option value="lines">Lines</option>
                <option value="mixed">Mixed</option>
                <option value="irregular">Irregular</option>
              </select>
            </label>

            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              {currentItem ? "Select an override before running analysis" : "No prediction yet"}
            </span>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={smallLabelStyle}>Original Image</div>
            <ImageFrame
              src={currentItem?.original_image_url || ""}
              caption={currentItem?.saved_filename || "No image loaded"}
              height={240}
            />
          </div>
        </Panel>

        <Panel title={isIrregular ? "Binarization Options" : "Image Advanced Options"} accentColor="var(--yellow)">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.74rem", color: "var(--muted)", lineHeight: 1.6 }}>
              {!currentItem
                ? "Upload images to adjust per-image segmentation settings"
                : isIrregular
                  ? `Binarization settings for ${currentItem.original_filename}. The binarized mask updates as you change them.`
                  : `Segmentation settings for ${currentItem.original_filename}`}
            </div>
            {!isIrregular ? (
              <button
                type="button"
                onClick={() => setShowAdvancedImageOptions((prev) => !prev)}
                style={secondaryButtonStyle}
              >
                {showAdvancedImageOptions ? "Hide Advanced Options" : "Show Advanced Options"}
              </button>
            ) : null}
          </div>

          {showImageOptions ? (
            <fieldset disabled={!currentItem} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
              <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 14, background: "var(--surface2)" }}>
                    <div style={{ ...smallLabelStyle, marginBottom: 12 }}>Preprocessing</div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <SliderRow label="Denoise Strength" min={0} max={30} step={1} value={imageParams.denoise} onChange={(value) => onImageParamsChange({ denoise: Math.round(value) })} />
                      <SliderRow label="Sharpen / Deblur" min={0} max={10} step={1} value={imageParams.sharpen} onChange={(value) => onImageParamsChange({ sharpen: Math.round(value) })} />
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                        <input type="checkbox" checked={imageParams.grayscale} onChange={(e) => onImageParamsChange({ grayscale: e.target.checked })} />
                        Convert to Grayscale
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                        <input type="checkbox" checked={imageParams.invertPixels} onChange={(e) => onImageParamsChange({ invertPixels: e.target.checked })} />
                        Invert Pixels
                      </label>
                    </div>
                  </div>

                  {isIrregular ? (
                    <div style={optionBoxStyle}>
                      <div style={{ ...smallLabelStyle, marginBottom: 12 }}>Threshold Methods</div>
                      <div style={{ display: "grid", gap: 12 }}>
                        <label style={checkboxRowStyle}>
                          <input type="checkbox" checked={imageParams.binarizeAdaptive} onChange={(e) => onImageParamsChange({ binarizeAdaptive: e.target.checked })} />
                          Adaptive threshold
                        </label>
                        <label style={checkboxRowStyle}>
                          <input type="checkbox" checked={imageParams.binarizeNiblack} onChange={(e) => onImageParamsChange({ binarizeNiblack: e.target.checked })} />
                          Niblack threshold
                        </label>
                        {imageParams.binarizeAdaptive && imageParams.binarizeNiblack ? (
                          <label style={{ display: "grid", gap: 6, fontSize: "0.76rem", color: "var(--text)" }}>
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
                          <SliderRow label="Alpha (adaptive weight)" min={0} max={1} step={0.05} value={imageParams.binarizeAlpha} onChange={(value) => onImageParamsChange({ binarizeAlpha: value })} />
                        ) : null}
                        <label style={checkboxRowStyle}>
                          <input type="checkbox" checked={imageParams.invertMask} onChange={(e) => onImageParamsChange({ invertMask: e.target.checked })} />
                          Invert Mask
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 14, background: "var(--surface2)" }}>
                      <div style={{ ...smallLabelStyle, marginBottom: 12 }}>Postprocessing</div>
                      <div style={{ display: "grid", gap: 12 }}>
                        <SliderRow label="Confidence Threshold" min={0.1} max={0.9} step={0.01} value={imageParams.threshold} onChange={(value) => onImageParamsChange({ threshold: value })} />
                        <SliderRow label="Remove Noise" min={0} max={7} step={1} value={imageParams.morphology} onChange={(value) => onImageParamsChange({ morphology: Math.round(value) })} />
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                          <input type="checkbox" checked={imageParams.invertMask} onChange={(e) => onImageParamsChange({ invertMask: e.target.checked })} />
                          Invert Mask
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {isIrregular ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ ...optionBoxStyle, opacity: imageParams.binarizeAdaptive ? 1 : 0.5 }}>
                      <div style={{ ...smallLabelStyle, marginBottom: 12 }}>Adaptive</div>
                      <div style={{ display: "grid", gap: 12 }}>
                        <label style={{ display: "grid", gap: 6, fontSize: "0.76rem", color: "var(--text)" }}>
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
                        <SliderRow label="Block Size" min={3} max={101} step={2} value={imageParams.binarizeBlockSize} onChange={(value) => onImageParamsChange({ binarizeBlockSize: Math.round(value) | 1 })} />
                        <SliderRow label="C Value" min={-50} max={30} step={1} value={imageParams.binarizeC} onChange={(value) => onImageParamsChange({ binarizeC: Math.round(value) })} />
                      </div>
                    </div>

                    <div style={optionBoxStyle}>
                      <div style={{ ...smallLabelStyle, marginBottom: 12 }}>Niblack + Filters</div>
                      <div style={{ display: "grid", gap: 12 }}>
                        <div style={{ display: "grid", gap: 12, opacity: imageParams.binarizeNiblack ? 1 : 0.5 }}>
                          <SliderRow label="Niblack k" min={-1} max={1} step={0.05} value={imageParams.binarizeK} onChange={(value) => onImageParamsChange({ binarizeK: value })} />
                          <SliderRow label="Niblack Window" min={3} max={111} step={2} value={imageParams.binarizeNiblackWindow} onChange={(value) => onImageParamsChange({ binarizeNiblackWindow: Math.round(value) | 1 })} />
                        </div>
                        <label style={{ display: "grid", gap: 6, fontSize: "0.76rem", color: "var(--text)" }}>
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
                          <SliderRow label="Blur Kernel" min={3} max={21} step={2} value={imageParams.binarizeBlurKsize} onChange={(value) => onImageParamsChange({ binarizeBlurKsize: Math.round(value) | 1 })} />
                        ) : null}
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
                ) : null}
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => onImageParamsChange(DEFAULT_IMAGE_PARAMS)}
                  style={secondaryButtonStyle}
                >
                  Reset Parameters
                </button>
                {(batchData?.items?.length || 0) > 1 ? (
                  <button type="button" onClick={onApplyImageParamsToAll} style={secondaryButtonStyle}>
                    Apply to All Images
                  </button>
                ) : null}
              </div>
            </fieldset>
          ) : null}
        </Panel>
      </div>

      <div>
        <Panel title={isIrregular ? "Binarized Mask" : "Binary Mask"} style={{ marginBottom: 16 }}>
          <p style={{ fontSize: "0.76rem", color: "var(--muted)", lineHeight: 1.65, marginBottom: 14 }}>
            {isIrregular
              ? "Irregular images skip the U-Net. The preprocessed image is binarized with the options on the left. "
              : "Review the raw binary mask before analysis. "}
            <span style={{ color: "var(--text)" }}>White regions</span> = detected features.{" "}
            <span style={{ color: "var(--text)" }}>Black</span> = background.
          </p>

          {isIrregular ? (
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 10, fontSize: "0.74rem", color: "var(--muted)" }}>
              <span>
                Feature pixels:{" "}
                <strong style={{ color: "var(--text)" }}>
                  {currentItem?.black_pixel_percent != null ? `${currentItem.black_pixel_percent}%` : "—"}
                </strong>
              </span>
              <span aria-live="polite" style={{ color: isResegmenting ? "var(--accent)" : "var(--muted)" }}>
                {isResegmenting ? "Updating mask…" : "Mask up to date"}
              </span>
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: currentItem?.confidence_image_url || isIrregular ? "1fr 1fr" : "1fr",
              gap: 12,
              opacity: isResegmenting ? 0.7 : 1,
              transition: "opacity 120ms",
            }}
          >
            {isIrregular ? (
              <ImageFrame
                src={currentItem?.preprocessed_image_url || currentItem?.original_image_url || ""}
                caption="preprocessed_input.png"
                height={260}
              />
            ) : null}
            <ImageFrame
              src={currentItem?.mask_image_url || ""}
              caption={currentItem?.mask_filename || (isIrregular ? "binarized_mask.png" : "unet_mask_preview.png")}
              height={260}
            />
            {currentItem?.confidence_image_url && !isIrregular ? (
              <ImageFrame
                src={currentItem.confidence_image_url}
                caption="u-net_probability_map.png"
                height={260}
              />
            ) : null}
          </div>

          <div style={{ marginTop: 14 }}>
            <p
              style={{
                fontSize: "0.76rem",
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Proceed with selected mask?
            </p>

            <RadioOption
              active={maskMode === "use"}
              accent="green"
              onClick={() => setMaskMode("use")}
              label="Use mask as-is"
              icon="▶"
            />
            <RadioOption
              active={maskMode === "edit"}
              accent="accent"
              onClick={() => setMaskMode("edit")}
              label="Open editor to correct the mask"
              icon="✎"
            />
          </div>
        </Panel>

        <Panel title="Mask Editor" style={{ opacity: maskMode === "edit" ? 1 : 0.65 }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--muted)" }}>
              <div style={{ width: 14, height: 14, borderRadius: 2, border: "1px solid var(--border)", background: "#000" }} />
              Black = brush draw features
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "var(--muted)" }}>
              <div style={{ width: 14, height: 14, borderRadius: 2, border: "1px solid #888", background: "#fff" }} />
              White = erase selected layer area
            </div>
          </div>

          {maskMode !== "edit" ? (
            <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginBottom: 12 }}>
              Editor disabled while &quot;Use mask as-is&quot; is selected.
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setToolMode("draw")} style={toolButtonStyle(toolMode === "draw")}>
              Brush Draw (black)
            </button>

            <button onClick={() => setToolMode("erase")} style={toolButtonStyle(toolMode === "erase")}>
              Erase (white)
            </button>

            <button onClick={resetMask} style={secondaryButtonStyle}>
              Reset Mask
            </button>

            <button onClick={undoLastStroke} style={secondaryButtonStyle}>
              Undo
            </button>

            <button onClick={redoLastStroke} style={secondaryButtonStyle}>
              Redo
            </button>

            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginLeft: 10,
                minWidth: 220,
              }}
            >
              <span style={{ fontSize: "0.68rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                Brush px:
              </span>
              <input
                type="range"
                min={2}
                max={40}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                style={{ flex: 1, accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: "0.68rem", color: "var(--accent)", minWidth: 24 }}>
                {brushSize}
              </span>
            </div>

            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 220,
              }}
            >
              <span style={{ fontSize: "0.68rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                Mask opacity:
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={maskOverlayOpacity}
                onChange={(e) => setMaskOverlayOpacity(Number(e.target.value))}
                style={{ flex: 1, accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: "0.68rem", color: "var(--accent)", minWidth: 36 }}>
                {Math.round(maskOverlayOpacity * 100)}%
              </span>
            </div>
          </div>

          <div
            style={{
              width: "100%",
              minHeight: 300,
              background: "var(--imageBg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "linear-gradient(var(--overlayGrid) 1px, transparent 1px), linear-gradient(90deg, var(--overlayGrid) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: 1,
                height: "100%",
                background: "var(--overlayAxis)",
                left: "50%",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: "100%",
                height: 1,
                background: "var(--overlayAxis)",
                top: "50%",
              }}
            />

            <div style={{ position: "relative", zIndex: 1, padding: 12 }}>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  overflow: "hidden",
                  background: "var(--imageBg)",
                  boxShadow: "none",
                  position: "relative",
                }}
              >
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
                    maxWidth: 520,
                    height: "auto",
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
          </div>

          <p style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: 8 }}>
            {strokeCount} stroke{strokeCount === 1 ? "" : "s"} recorded for this image.
            {currentItem?.item_id && editedMaskMap[currentItem.item_id] ? " Ready for batch analysis." : ""}
          </p>

          {maskMode === "edit" ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...smallLabelStyle, marginBottom: 8 }}>Stroke Layers</div>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  maxHeight: 220,
                  overflowY: "auto",
                  paddingRight: 4,
                }}
              >
                <div
                  onClick={() => selectLayer(maskLayerId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    border:
                      selectedLayerId === maskLayerId || flashLayerId === maskLayerId
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    background:
                      selectedLayerId === maskLayerId || flashLayerId === maskLayerId
                        ? "var(--accentTint)"
                        : "var(--surface2)",
                    boxShadow:
                      selectedLayerId === maskLayerId || flashLayerId === maskLayerId
                        ? "inset 0 0 0 1px var(--accent)"
                        : "none",
                    cursor: "pointer",
                    transition: "all 140ms ease",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--text)", fontWeight: 700 }}>
                      Mask
                    </div>
                    <div style={{ fontSize: "0.66rem", color: "var(--muted)" }}>
                      Base mask layer. Select this to erase directly from the mask.
                    </div>
                  </div>
                </div>
                {selectedItemStrokes.length ? (
                  selectedItemStrokes
                    .map((stroke, index) => ({ stroke, index }))
                    .reverse()
                    .map(({ stroke, index }) => (
                      <div
                        key={stroke.id}
                        onClick={() => selectLayer(stroke.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          border:
                            selectedLayerId === stroke.id || flashLayerId === stroke.id
                              ? "1px solid var(--accent)"
                              : "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "8px 10px",
                          background:
                            selectedLayerId === stroke.id || flashLayerId === stroke.id
                              ? "var(--accentTint)"
                              : "var(--surface2)",
                          boxShadow:
                            selectedLayerId === stroke.id || flashLayerId === stroke.id
                              ? "inset 0 0 0 1px var(--accent)"
                              : "none",
                          cursor: "pointer",
                          transition: "all 140ms ease",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "0.72rem", color: "var(--text)", fontWeight: 700 }}>
                            Layer {index + 1}
                          </div>
                          <div style={{ fontSize: "0.66rem", color: "var(--muted)" }}>
                            Brush {stroke.brushSize}px
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeStrokeById(stroke.id);
                          }}
                          style={secondaryButtonStyle}
                        >
                          Remove Layer
                        </button>
                      </div>
                    ))
                ) : (
                  <div style={{ fontSize: "0.73rem", color: "var(--muted)" }}>
                    Each new brush stroke becomes its own removable layer.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Panel>

      </div>
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
  status,
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

  return (
    <div>
      <Panel title="Batch Results Navigator" style={{ marginBottom: 18 }}>
        {batchData?.items?.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {batchData.items.map((item) => {
              const isSelected = item.item_id === currentItem?.item_id;
              const isDone = !!analysisMap[item.item_id];
              return (
                <button
                  key={item.item_id}
                  className="px-flat ws-row"
                  onClick={() => setSelectedItemId(item.item_id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: isSelected ? "var(--accentTint)" : "var(--surface)",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: 4,
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
                      <div
                        style={{
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.original_filename}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: 4 }}>
                        {badgeClass(item.predicted_class)} · {isDone ? "Ready to inspect" : "Not analyzed yet"}
                      </div>
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 4,
          fontSize: "0.78rem",
          border: "1px solid rgba(46,125,50,0.3)",
          background: "rgba(46,125,50,0.07)",
          color: "var(--green)",
          marginBottom: 18,
        }}
      >
        <span>✔</span>
        <span>
          {currentAnalysis
            ? `${badgeClass(currentItem?.predicted_class)} results ready`
            : "No analysis result yet for the selected image."}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "12px 18px",
          marginBottom: 18,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 4,
            fontSize: "0.78rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            background: "var(--accentTint)",
            color: "var(--accent)",
            border: "1px solid transparent",
          }}
        >
          {currentItem ? badgeClass(currentItem.predicted_class) : "WAITING"}
        </span>
      </div>

      {currentItem && ["dots", "mixed", "lines", "irregular"].includes(currentItem.predicted_class) ? (
        <Panel title="Analysis Controls" accentColor="var(--yellow)" style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: "0.74rem", color: "var(--muted)", lineHeight: 1.6 }}>
              Analysis settings for {currentItem.original_filename}
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedAnalysisOptions((prev) => !prev)}
              style={secondaryButtonStyle}
            >
              {showAdvancedAnalysisOptions ? "Hide Advanced Options" : "Show Advanced Options"}
            </button>
          </div>

          {showAdvancedAnalysisOptions ? (
            <>
              {currentItem.predicted_class === "irregular" ? (
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--text)",
                    marginTop: 14,
                    textTransform: "uppercase",
                  }}
                >
                  Spacing Analysis - Irregular Pipeline
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 14 }}>
                <SliderRow label="Image Size (µm)" min={0.1} max={10} step={0.1} value={imageSizeUm} onChange={setImageSizeUm} />

                {currentItem.predicted_class === "lines" || currentItem.predicted_class === "mixed" ? (
                  <>
                    <SliderRow label="Clusters" min={2} max={5} step={1} value={colorwheelClusters} onChange={(value) => setColorwheelClusters(Math.round(value))} />
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
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
                    <SliderRow label="Voronoi Spacing Tolerance" min={0.05} max={0.5} step={0.01} value={voronoiThresholdEdge} onChange={setVoronoiThresholdEdge} />
                    <SliderRow label="Voronoi Max Size" min={256} max={2048} step={128} value={voronoiMaxSize} onChange={(value) => setVoronoiMaxSize(Math.round(value))} />
                    <label style={{ display: "grid", gap: 6, fontSize: "0.76rem", color: "var(--text)" }}>
                      <span>Voronoi Packing Pattern</span>
                      <select
                        value={voronoiPackingEdges}
                        onChange={(e) => setVoronoiPackingEdges(Number(e.target.value) as 4 | 6)}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "var(--surface2)",
                          color: "var(--text)",
                        }}
                      >
                        <option value={6}>Hexagonal (6 edges)</option>
                        <option value={4}>Square / cubic (4 edges)</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 14 }}>
                  <SliderRow label="Min Circularity" min={0.1} max={1} step={0.05} value={minCircularity} onChange={setMinCircularity} />
                  <SliderRow label="Max Aspect Ratio" min={1} max={5} step={0.1} value={maxAspectRatio} onChange={setMaxAspectRatio} />
                  <SliderRow label="Min Area (0 = keep all)" min={0} max={100} step={1} value={minArea} onChange={(value) => setMinArea(Math.round(value))} />
                  <SliderRow label="Max Area" min={50} max={2000} step={10} value={maxArea} onChange={(value) => setMaxArea(Math.round(value))} />
                </div>
              ) : null}

              {currentItem.predicted_class === "irregular" ? (
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", lineHeight: 1.6 }}>
                    Binarization settings are set per image in Upload &amp; edit, where the mask previews as you adjust them.
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                    <input type="checkbox" checked={irregularInvertSpacing} onChange={(e) => setIrregularInvertSpacing(e.target.checked)} />
                    Invert feature phase for spacing
                  </label>
                </div>
              ) : null}
            </>
          ) : null}

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={onRerunAnalysis} disabled={isRunning} style={runButtonStyle}>
              {isRunning ? "Running..." : "⟳ Rerun Analysis"}
            </button>
            {(batchData?.items?.length || 0) > 1 ? (
              <button type="button" onClick={onApplyAnalysisParamsToAll} disabled={isRunning} style={secondaryButtonStyle}>
                Apply to All Images &amp; Rerun
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onAnalysisParamsChange(DEFAULT_ANALYSIS_PARAMS)}
              disabled={isRunning}
              style={secondaryButtonStyle}
            >
              Reset Parameters
            </button>
            <span style={{ fontSize: "0.72rem", color: isAnalysisStale ? "var(--yellow)" : "var(--muted)" }}>
              {isRunning
                ? status
                : isAnalysisStale
                  ? "Settings changed. Rerun to update the results."
                  : status}
            </span>
          </div>
        </Panel>
      ) : null}

      <Panel title="Image Outputs" style={{ marginBottom: 18 }}>
        {/* Dots, lines and mixed report domain spacing in the Analysis Summary. */}
        {currentAnalysis?.domain_spacing && !currentAnalysis.domain_spacing.error ? (
          <div style={{ marginBottom: 14 }}>
            <div style={smallLabelStyle}>Domain Spacing</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 8,
                marginBottom: 10,
              }}
            >
              {currentAnalysis?.domain_spacing && !currentAnalysis.domain_spacing.error ? (
                <>
                  <CompactMetric
                    label="Mean spacing"
                    value={`${currentAnalysis.domain_spacing.mean_spacing_nm.toFixed(2)} nm`}
                  />
                  <CompactMetric
                    label="Median spacing"
                    value={`${currentAnalysis.domain_spacing.median_spacing_nm.toFixed(2)} nm`}
                  />
                  <CompactMetric
                    label="Std dev"
                    value={`${currentAnalysis.domain_spacing.std_spacing_nm.toFixed(2)} nm`}
                  />
                </>
              ) : null}
              {currentAnalysis?.domain_spacing && currentItem?.predicted_class !== "irregular" ? (
                <CompactMetric
                  label="Measurements"
                  value={`${currentAnalysis.domain_spacing.num_measurements}`}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {outputSections.map((section) => (
            <div key={section.title}>
              <div style={smallLabelStyle}>{section.title}</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 14,
                }}
              >
                {section.items.map((output, idx) => (
                  <ResultsImage
                    key={`${section.title}-${output.label}-${idx}`}
                    label={output.label}
                    src={output.src}
                    caption={output.caption}
                    onOpen={setViewerImage}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Analysis Summary" style={{ marginBottom: 18 }}>
        {importantMetrics.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", border: "1px solid var(--border)" }}>
            <tbody>
              {importantMetrics.map((metric, idx) => (
                <tr
                  key={metric.key}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: idx % 2 ? "transparent" : "var(--surface2)",
                  }}
                >
                  <td style={{ padding: "9px 12px", color: "var(--muted)", fontSize: "0.88rem" }}>
                    {metric.label}
                  </td>
                  <td
                    style={{
                      padding: "9px 12px",
                      color: "var(--text)",
                      fontWeight: 600,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {metric.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
            Domain spacing and branch-specific outputs above contain the main analysis results for this image.
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
