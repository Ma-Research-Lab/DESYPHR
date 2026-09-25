"use client";

import type { Dispatch, MouseEventHandler, RefObject, SetStateAction } from "react";

import {
  runButtonStyle,
  secondaryButtonStyle,
  secondaryLargeButtonStyle,
  smallLabelStyle,
  toolButtonStyle,
} from "./helpers";
import { CompactMetric, ImageFrame, Panel, RadioOption, ResultsImage, SliderRow } from "./ui";
import type {
  AnalysisResponse,
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
  handleUpload,
  isUploading,
  batchData,
  analysisMap,
  editedMaskMap,
  currentItem,
  classifierClass,
  onClassificationOverride,
  saveCurrentCanvasForItem,
  setSelectedItemId,
  setActiveTab,
  badgeClass,
  showAdvancedImageOptions,
  setShowAdvancedImageOptions,
  denoise,
  setDenoise,
  sharpen,
  setSharpen,
  grayscale,
  setGrayscale,
  invertPixels,
  setInvertPixels,
  threshold,
  setThreshold,
  morphology,
  setMorphology,
  invertMask,
  setInvertMask,
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
  status,
  handleRunAnalysis,
  isRunning,
  maskLayerId,
  canvasSize,
}: {
  hiddenFileInputRef: RefObject<HTMLInputElement | null>;
  isDragActive: boolean;
  setIsDragActive: Dispatch<SetStateAction<boolean>>;
  setFilesFromInput: (files: File[], append?: boolean) => void;
  selectedFiles: File[];
  selectedFilePreviewUrls: string[];
  setSelectedFiles: Dispatch<SetStateAction<File[]>>;
  handleUpload: () => void;
  isUploading: boolean;
  batchData: UploadBatchResponse | null;
  analysisMap: Record<string, AnalysisResponse>;
  editedMaskMap: Record<string, string>;
  currentItem: UploadItem | null;
  classifierClass: string;
  onClassificationOverride: (itemId: string, predictedClass: string) => void;
  saveCurrentCanvasForItem: (itemId?: string) => void;
  setSelectedItemId: Dispatch<SetStateAction<string>>;
  setActiveTab: Dispatch<SetStateAction<"upload" | "results" | "export">>;
  badgeClass: (name?: string) => string;
  showAdvancedImageOptions: boolean;
  setShowAdvancedImageOptions: Dispatch<SetStateAction<boolean>>;
  denoise: number;
  setDenoise: Dispatch<SetStateAction<number>>;
  sharpen: number;
  setSharpen: Dispatch<SetStateAction<number>>;
  grayscale: boolean;
  setGrayscale: Dispatch<SetStateAction<boolean>>;
  invertPixels: boolean;
  setInvertPixels: Dispatch<SetStateAction<boolean>>;
  threshold: number;
  setThreshold: Dispatch<SetStateAction<number>>;
  morphology: number;
  setMorphology: Dispatch<SetStateAction<number>>;
  invertMask: boolean;
  setInvertMask: Dispatch<SetStateAction<boolean>>;
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
  status: string;
  handleRunAnalysis: () => void;
  isRunning: boolean;
  maskLayerId: string;
  canvasSize: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
              const files = Array.from(e.dataTransfer.files || []);
              setFilesFromInput(files, true);
            }}
            style={{
              border: "1px dashed var(--border)",
              borderRadius: 6,
              padding: "36px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: isDragActive ? "rgba(0,212,255,0.12)" : "rgba(0,212,255,0.02)",
            }}
          >
            <input
              ref={hiddenFileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.tif,.tiff"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setFilesFromInput(files, true);
              }}
              style={{ display: "none" }}
            />
            <div style={{ fontSize: "2.4rem", color: "var(--accent)", opacity: 0.8 }}>⤴</div>
            <div style={{ fontSize: "1rem", fontWeight: 700, letterSpacing: "0.05em" }}>
              {selectedFiles.length
                ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`
                : "Drop AFM images here"}
            </div>
            <div style={{ fontSize: "0.73rem", color: "var(--muted)", marginTop: 4 }}>
              {selectedFiles.length
                ? "Batch ready. Click upload below."
                : "or click to browse multiple files"}
            </div>
          </div>

          {!!selectedFiles.length && (
            <div style={{ marginTop: 12 }}>
              <div style={smallLabelStyle}>Selected Files</div>
              <div
                className="file-list-scroll"
                style={{
                  maxHeight: 300,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--surface2)",
                }}
              >
                {selectedFiles.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    style={{
                      padding: "8px 10px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      borderBottom:
                        idx === selectedFiles.length - 1 ? "none" : "1px solid var(--border)",
                      fontSize: "0.74rem",
                      color: "var(--text)",
                    }}
                  >
                    {selectedFilePreviewUrls[idx] ? (
                      <img
                        src={selectedFilePreviewUrls[idx]}
                        alt={file.name}
                        style={{
                          width: 64,
                          height: 64,
                          objectFit: "cover",
                          borderRadius: 4,
                          border: "1px solid var(--border)",
                          background: "var(--imageBg)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 4,
                          border: "1px solid var(--border)",
                          background: "var(--surface)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 300,
                        }}
                      >
                        {idx + 1}. {file.name}
                      </div>
                      <div style={{ fontSize: "0.66rem", color: "var(--muted)" }}>
                        {(file.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      title="Remove file"
                      style={{
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
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={handleUpload} disabled={isUploading} style={runButtonStyle}>
              {isUploading ? "Running..." : selectedFiles.length <= 1 ? "Upload" : "Upload Batch"}
            </button>
            <span style={{ fontSize: "0.73rem", color: "var(--muted)" }} />
          </div>
        </Panel>

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
                    onClick={() => {
                      saveCurrentCanvasForItem(currentItem?.item_id);
                      setSelectedItemId(item.item_id);
                      setActiveTab("upload");
                    }}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: isSelected ? "rgba(0,212,255,0.08)" : "var(--surface2)",
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
                background: "rgba(0,212,255,0.1)",
                color: "var(--accent)",
                border: "1px solid rgba(0,212,255,0.3)",
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

        <Panel title="Image Advanced Options" accentColor="var(--yellow)">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
              Segmentation settings and model selection
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedImageOptions((prev) => !prev)}
              style={secondaryButtonStyle}
            >
              {showAdvancedImageOptions ? "Hide Advanced Options" : "Show Advanced Options"}
            </button>
          </div>

          {showAdvancedImageOptions ? (
            <>
              <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 14, background: "var(--surface2)" }}>
                    <div style={{ ...smallLabelStyle, marginBottom: 12 }}>Preprocessing</div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <SliderRow label="Denoise Strength" min={0} max={30} step={1} value={denoise} onChange={(value) => setDenoise(Math.round(value))} />
                      <SliderRow label="Sharpen / Deblur" min={0} max={10} step={1} value={sharpen} onChange={(value) => setSharpen(Math.round(value))} />
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                        <input type="checkbox" checked={grayscale} onChange={(e) => setGrayscale(e.target.checked)} />
                        Convert to Grayscale
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                        <input type="checkbox" checked={invertPixels} onChange={(e) => setInvertPixels(e.target.checked)} />
                        Invert Pixels
                      </label>
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 14, background: "var(--surface2)" }}>
                    <div style={{ ...smallLabelStyle, marginBottom: 12 }}>Postprocessing</div>
                    <div style={{ display: "grid", gap: 12 }}>
                      <SliderRow label="Confidence Threshold" min={0.1} max={0.9} step={0.01} value={threshold} onChange={setThreshold} />
                      <SliderRow label="Remove Noise" min={0} max={7} step={1} value={morphology} onChange={(value) => setMorphology(Math.round(value))} />
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                        <input type="checkbox" checked={invertMask} onChange={(e) => setInvertMask(e.target.checked)} />
                        Invert Mask
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => {
                    setThreshold(0.5);
                    setDenoise(0);
                    setSharpen(0);
                    setMorphology(0);
                    setGrayscale(false);
                    setInvertPixels(false);
                    setInvertMask(false);
                  }}
                  style={secondaryButtonStyle}
                >
                  Reset Parameters
                </button>
              </div>
            </>
          ) : null}
        </Panel>
      </div>

      <div>
        {currentItem?.predicted_class === "irregular" ? (
          <Panel title="Irregular Pipeline Input" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: "0.76rem", color: "var(--muted)", lineHeight: 1.65, marginBottom: 14 }}>
              Irregular morphology bypasses the U-Net mask stage. The irregular analysis pipeline runs directly on the preprocessed image instead.
            </p>
            <ImageFrame
              src={currentItem?.preprocessed_image_url || currentItem?.original_image_url || ""}
              caption="preprocessed_irregular_input.png"
              height={260}
            />
          </Panel>
        ) : (
          <Panel title="Binary Mask" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: "0.76rem", color: "var(--muted)", lineHeight: 1.65, marginBottom: 14 }}>
              Review the raw binary mask before analysis. <span style={{ color: "var(--text)" }}>White regions</span> = detected features.{" "}
              <span style={{ color: "var(--text)" }}>Black</span> = background.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: currentItem?.confidence_image_url ? "1fr 1fr" : "1fr",
                gap: 12,
              }}
            >
              <ImageFrame
                src={currentItem?.mask_image_url || ""}
                caption={currentItem?.mask_filename || "unet_mask_preview.png"}
                height={260}
              />
              {currentItem?.confidence_image_url ? (
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
        )}

        {currentItem?.predicted_class !== "irregular" ? (
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
                    "linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: 1,
                  height: "100%",
                  background: "rgba(0,212,255,0.1)",
                  left: "50%",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  height: 1,
                  background: "rgba(0,212,255,0.1)",
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
                    boxShadow: "0 0 20px rgba(0,212,255,0.08)",
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
                          ? "rgba(0,212,255,0.12)"
                          : "var(--surface2)",
                      boxShadow:
                        selectedLayerId === maskLayerId || flashLayerId === maskLayerId
                          ? "0 0 0 1px rgba(0,212,255,0.35), 0 0 18px rgba(0,212,255,0.18)"
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
                                ? "rgba(0,212,255,0.12)"
                                : "var(--surface2)",
                            boxShadow:
                              selectedLayerId === stroke.id || flashLayerId === stroke.id
                                ? "0 0 0 1px rgba(0,212,255,0.35), 0 0 18px rgba(0,212,255,0.18)"
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
        ) : null}

        <div style={{ display: "flex", alignItems: "center", padding: "16px 0", flexWrap: "wrap", gap: 10 }}>
          <button onClick={handleRunAnalysis} disabled={isRunning || !batchData?.items?.length} style={runButtonStyle}>
            {isRunning ? "Running..." : "Run Analysis"}
          </button>
          <span style={{ fontSize: "0.73rem", color: "var(--muted)" }} />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 4,
            fontSize: "0.78rem",
            border: "1px solid rgba(0,212,255,0.25)",
            background: "rgba(0,212,255,0.06)",
            color: "var(--accent)",
            whiteSpace: "pre-wrap",
          }}
        >
          <span>●</span>
          <span>{status}</span>
        </div>
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
  imageSizeUm,
  setImageSizeUm,
  colorwheelClusters,
  setColorwheelClusters,
  showColorwheelDebug,
  setShowColorwheelDebug,
  voronoiThresholdEdge,
  setVoronoiThresholdEdge,
  voronoiMaxSize,
  setVoronoiMaxSize,
  voronoiPackingEdges,
  setVoronoiPackingEdges,
  voronoiExtractDots,
  setVoronoiExtractDots,
  minCircularity,
  setMinCircularity,
  maxAspectRatio,
  setMaxAspectRatio,
  minArea,
  setMinArea,
  maxArea,
  setMaxArea,
  irregularUseAdaptive,
  setIrregularUseAdaptive,
  irregularUseNiblack,
  setIrregularUseNiblack,
  irregularCombineMode,
  setIrregularCombineMode,
  irregularAlpha,
  setIrregularAlpha,
  irregularAdaptiveMethod,
  setIrregularAdaptiveMethod,
  irregularAdaptiveBlockSize,
  setIrregularAdaptiveBlockSize,
  irregularCValue,
  setIrregularCValue,
  irregularKValue,
  setIrregularKValue,
  irregularNiblackWindow,
  setIrregularNiblackWindow,
  irregularBlur,
  setIrregularBlur,
  irregularBlurKsize,
  setIrregularBlurKsize,
  irregularEqualize,
  setIrregularEqualize,
  irregularClahe,
  setIrregularClahe,
  irregularInvertSpacing,
  setIrregularInvertSpacing,
  outputSections,
  setViewerImage,
  importantMetrics,
  metricValueByKey,
}: {
  batchData: UploadBatchResponse | null;
  currentItem: UploadItem | null;
  currentAnalysis: AnalysisResponse | null;
  analysisMap: Record<string, AnalysisResponse>;
  setSelectedItemId: Dispatch<SetStateAction<string>>;
  badgeClass: (name?: string) => string;
  showAdvancedAnalysisOptions: boolean;
  setShowAdvancedAnalysisOptions: Dispatch<SetStateAction<boolean>>;
  imageSizeUm: number;
  setImageSizeUm: Dispatch<SetStateAction<number>>;
  colorwheelClusters: number;
  setColorwheelClusters: Dispatch<SetStateAction<number>>;
  showColorwheelDebug: boolean;
  setShowColorwheelDebug: Dispatch<SetStateAction<boolean>>;
  voronoiThresholdEdge: number;
  setVoronoiThresholdEdge: Dispatch<SetStateAction<number>>;
  voronoiMaxSize: number;
  setVoronoiMaxSize: Dispatch<SetStateAction<number>>;
  voronoiPackingEdges: 4 | 6;
  setVoronoiPackingEdges: Dispatch<SetStateAction<4 | 6>>;
  voronoiExtractDots: boolean;
  setVoronoiExtractDots: Dispatch<SetStateAction<boolean>>;
  minCircularity: number;
  setMinCircularity: Dispatch<SetStateAction<number>>;
  maxAspectRatio: number;
  setMaxAspectRatio: Dispatch<SetStateAction<number>>;
  minArea: number;
  setMinArea: Dispatch<SetStateAction<number>>;
  maxArea: number;
  setMaxArea: Dispatch<SetStateAction<number>>;
  irregularUseAdaptive: boolean;
  setIrregularUseAdaptive: Dispatch<SetStateAction<boolean>>;
  irregularUseNiblack: boolean;
  setIrregularUseNiblack: Dispatch<SetStateAction<boolean>>;
  irregularCombineMode: "OR" | "AND" | "adaptive" | "niblack" | "weighted";
  setIrregularCombineMode: Dispatch<
    SetStateAction<"OR" | "AND" | "adaptive" | "niblack" | "weighted">
  >;
  irregularAlpha: number;
  setIrregularAlpha: Dispatch<SetStateAction<number>>;
  irregularAdaptiveMethod: "gaussian" | "mean";
  setIrregularAdaptiveMethod: Dispatch<SetStateAction<"gaussian" | "mean">>;
  irregularAdaptiveBlockSize: number;
  setIrregularAdaptiveBlockSize: Dispatch<SetStateAction<number>>;
  irregularCValue: number;
  setIrregularCValue: Dispatch<SetStateAction<number>>;
  irregularKValue: number;
  setIrregularKValue: Dispatch<SetStateAction<number>>;
  irregularNiblackWindow: number;
  setIrregularNiblackWindow: Dispatch<SetStateAction<number>>;
  irregularBlur: "none" | "gaussian" | "median" | "bilateral";
  setIrregularBlur: Dispatch<SetStateAction<"none" | "gaussian" | "median" | "bilateral">>;
  irregularBlurKsize: number;
  setIrregularBlurKsize: Dispatch<SetStateAction<number>>;
  irregularEqualize: boolean;
  setIrregularEqualize: Dispatch<SetStateAction<boolean>>;
  irregularClahe: boolean;
  setIrregularClahe: Dispatch<SetStateAction<boolean>>;
  irregularInvertSpacing: boolean;
  setIrregularInvertSpacing: Dispatch<SetStateAction<boolean>>;
  outputSections: OutputSection[];
  setViewerImage: Dispatch<SetStateAction<ViewerImage | null>>;
  importantMetrics: AnalysisResponse["metrics"];
  metricValueByKey: Record<string, string>;
}) {
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
                  onClick={() => setSelectedItemId(item.item_id)}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: isSelected ? "rgba(0,212,255,0.08)" : "var(--surface2)",
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
          border: "1px solid rgba(0,255,157,0.25)",
          background: "rgba(0,255,157,0.06)",
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
          border: "1px solid rgba(0,212,255,0.2)",
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
            background: "rgba(0,212,255,0.1)",
            color: "var(--accent)",
            border: "1px solid rgba(0,212,255,0.3)",
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
              Advanced analysis controls
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
                  Advanced Analysis - Irregular Pipeline
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
                    <SliderRow label="Voronoi Edge Threshold" min={0.005} max={0.1} step={0.005} value={voronoiThresholdEdge} onChange={setVoronoiThresholdEdge} />
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
                  <SliderRow label="Min Area" min={1} max={100} step={1} value={minArea} onChange={(value) => setMinArea(Math.round(value))} />
                  <SliderRow label="Max Area" min={50} max={2000} step={10} value={maxArea} onChange={(value) => setMaxArea(Math.round(value))} />
                </div>
              ) : null}

              {currentItem.predicted_class === "irregular" ? (
                <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--surface2)" }}>
                    <div style={{ ...smallLabelStyle, marginBottom: 12 }}>Step 1 - Binarization</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                      <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12, background: "var(--surface)" }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text)", fontWeight: 700, marginBottom: 10 }}>Threshold Methods</div>
                        <div style={{ display: "grid", gap: 10 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                            <input type="checkbox" checked={irregularUseAdaptive} onChange={(e) => setIrregularUseAdaptive(e.target.checked)} />
                            Use Adaptive
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                            <input type="checkbox" checked={irregularUseNiblack} onChange={(e) => setIrregularUseNiblack(e.target.checked)} />
                            Use Niblack
                          </label>
                          {irregularUseAdaptive && irregularUseNiblack ? (
                            <label style={{ display: "grid", gap: 6, fontSize: "0.76rem", color: "var(--text)" }}>
                              <span>Combine Logic</span>
                              <select
                                value={irregularCombineMode}
                                onChange={(e) => setIrregularCombineMode(e.target.value as "OR" | "AND" | "adaptive" | "niblack" | "weighted")}
                                style={{
                                  width: "100%",
                                  padding: "10px 12px",
                                  borderRadius: 6,
                                  border: "1px solid var(--border)",
                                  background: "var(--surface2)",
                                  color: "var(--text)",
                                }}
                              >
                                <option value="OR">OR</option>
                                <option value="AND">AND</option>
                                <option value="adaptive">Adaptive only</option>
                                <option value="niblack">Niblack only</option>
                                <option value="weighted">Weighted</option>
                              </select>
                            </label>
                          ) : null}
                          {irregularUseAdaptive && irregularUseNiblack && irregularCombineMode === "weighted" ? (
                            <SliderRow label="Alpha" min={0} max={1} step={0.05} value={irregularAlpha} onChange={setIrregularAlpha} />
                          ) : null}
                        </div>
                      </div>

                      <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12, background: "var(--surface)" }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text)", fontWeight: 700, marginBottom: 10 }}>Adaptive Parameters</div>
                        <div style={{ display: "grid", gap: 10, opacity: irregularUseAdaptive ? 1 : 0.5 }}>
                          <label style={{ display: "grid", gap: 6, fontSize: "0.76rem", color: "var(--text)" }}>
                            <span>Adaptive Method</span>
                            <select
                              value={irregularAdaptiveMethod}
                              onChange={(e) => setIrregularAdaptiveMethod(e.target.value as "gaussian" | "mean")}
                              disabled={!irregularUseAdaptive}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: 6,
                                border: "1px solid var(--border)",
                                background: "var(--surface2)",
                                color: "var(--text)",
                              }}
                            >
                              <option value="gaussian">Gaussian</option>
                              <option value="mean">Mean</option>
                            </select>
                          </label>
                          <SliderRow label="Block Size" min={3} max={101} step={2} value={irregularAdaptiveBlockSize} onChange={(value) => setIrregularAdaptiveBlockSize(Math.round(value) | 1)} />
                          <SliderRow label="C Value" min={-50} max={30} step={1} value={irregularCValue} onChange={(value) => setIrregularCValue(Math.round(value))} />
                        </div>
                      </div>

                      <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12, background: "var(--surface)" }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text)", fontWeight: 700, marginBottom: 10 }}>Niblack + Preprocess</div>
                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={{ opacity: irregularUseNiblack ? 1 : 0.5 }}>
                            <SliderRow label="Niblack k" min={-1} max={1} step={0.05} value={irregularKValue} onChange={setIrregularKValue} />
                            <SliderRow label="Niblack Window" min={3} max={111} step={2} value={irregularNiblackWindow} onChange={(value) => setIrregularNiblackWindow(Math.round(value) | 1)} />
                          </div>
                          <label style={{ display: "grid", gap: 6, fontSize: "0.76rem", color: "var(--text)" }}>
                            <span>Blur</span>
                            <select
                              value={irregularBlur}
                              onChange={(e) => setIrregularBlur(e.target.value as "none" | "gaussian" | "median" | "bilateral")}
                              style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: 6,
                                border: "1px solid var(--border)",
                                background: "var(--surface2)",
                                color: "var(--text)",
                              }}
                            >
                              <option value="none">None</option>
                              <option value="gaussian">Gaussian</option>
                              <option value="median">Median</option>
                              <option value="bilateral">Bilateral</option>
                            </select>
                          </label>
                          <SliderRow label="Blur Kernel" min={3} max={21} step={2} value={irregularBlurKsize} onChange={(value) => setIrregularBlurKsize(Math.round(value) | 1)} />
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                            <input type="checkbox" checked={irregularEqualize} onChange={(e) => setIrregularEqualize(e.target.checked)} />
                            Equalize
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                            <input type="checkbox" checked={irregularClahe} onChange={(e) => setIrregularClahe(e.target.checked)} />
                            CLAHE
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14, background: "var(--surface2)" }}>
                    <div style={{ ...smallLabelStyle, marginBottom: 12 }}>Step 2 - Spacing Analysis</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                      <SliderRow label="Image Size (µm)" min={0.1} max={10} step={0.1} value={imageSizeUm} onChange={setImageSizeUm} />
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.76rem", color: "var(--text)" }}>
                        <input type="checkbox" checked={irregularInvertSpacing} onChange={(e) => setIrregularInvertSpacing(e.target.checked)} />
                        Invert feature phase for spacing
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="Image Outputs" style={{ marginBottom: 18 }}>
        {((currentItem?.predicted_class === "lines" || currentItem?.predicted_class === "mixed") && metricValueByKey.domain_spacing_nm) ||
        (currentAnalysis?.domain_spacing && !currentAnalysis.domain_spacing.error) ? (
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
              {(currentItem?.predicted_class === "lines" || currentItem?.predicted_class === "mixed") &&
              metricValueByKey.domain_spacing_nm ? (
                <CompactMetric
                  label="Domain spacing"
                  value={`${Number(metricValueByKey.domain_spacing_nm).toFixed(2)} nm`}
                />
              ) : null}
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
            <tbody>
              {importantMetrics.map((metric) => (
                <tr key={metric.key} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td
                    style={{
                      padding: "7px 0",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      fontSize: "0.68rem",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {metric.label}
                  </td>
                  <td
                    style={{
                      padding: "7px 0",
                      color: "var(--accent)",
                      fontWeight: 700,
                      textAlign: "right",
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
  handleNewJob,
  handleExportCurrentPdf,
  currentAnalysis,
  isExporting,
  handleExportBatchPdf,
  analysisMap,
}: {
  handleNewJob: () => void;
  handleExportCurrentPdf: () => void;
  currentAnalysis: AnalysisResponse | null;
  isExporting: boolean;
  handleExportBatchPdf: () => void;
  analysisMap: Record<string, AnalysisResponse>;
}) {
  return (
    <div>
      <Panel title="Export Results" style={{ marginBottom: 18 }}>
        <div style={{ color: "var(--muted)", fontSize: "0.76rem", marginBottom: 16 }}>
          Export the selected result or the full analyzed batch.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={handleNewJob} style={secondaryLargeButtonStyle}>
            ⟲ New Job
          </button>
          <button onClick={handleExportCurrentPdf} disabled={!currentAnalysis || isExporting} style={runButtonStyle}>
            {isExporting ? "Exporting..." : "⭳ Export Selected PDF"}
          </button>
          <button
            onClick={handleExportBatchPdf}
            disabled={!Object.keys(analysisMap).length || isExporting}
            style={runButtonStyle}
          >
            {isExporting ? "Exporting..." : "⭳ Export Batch PDF"}
          </button>
        </div>
      </Panel>
    </div>
  );
}
