import io
from itertools import zip_longest

from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas

from utils import decode_data_url_to_pil, fit_image_size, wrap_text


def draw_result_block(pdf, x, y, width, title, data_url, caption="", max_height=210, center=False):
    pil_img = decode_data_url_to_pil(data_url)
    if pil_img is None:
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(x, y, title)
        pdf.setFont("Helvetica", 9)
        pdf.drawString(x, y - 14, "No image available")
        return y - 40

    img_w, img_h = pil_img.size
    draw_w, draw_h = fit_image_size(img_w, img_h, width, max_height)
    if center:
        x += (width - draw_w) / 2

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(x, y, title)
    y -= 14

    reader = ImageReader(pil_img)
    pdf.drawImage(
        reader,
        x,
        y - draw_h,
        width=draw_w,
        height=draw_h,
        preserveAspectRatio=True,
        mask="auto",
    )

    y = y - draw_h - 8
    if caption:
        pdf.setFont("Helvetica", 8)
        pdf.drawString(x, y, str(caption)[:100])
        y -= 12

    return y - 8


def collect_output_blocks(result: dict, item: dict | None = None):
    blocks = [
        (
            "Original",
            result.get("original_image_url", (item or {}).get("original_image_url", "")),
            result.get("original_filename", (item or {}).get("original_filename", "")),
        ),
        ("Final Mask", result.get("final_mask_url", ""), result.get("final_mask_filename", "")),
    ]

    for key in ("extra1", "extra2", "extra3", "extra4"):
        src = result.get(f"{key}_url", "")
        note = result.get(f"{key}_note", "") or key.title()
        if src:
            blocks.append((note, src, note))

    for output in result.get("additional_outputs", []) or []:
        src = output.get("url", "")
        label = output.get("label", "Additional Output")
        if src:
            blocks.append((label, src, label))

    deduped = []
    seen = set()
    for title, src, caption in blocks:
        if not src or not str(src).startswith("data:"):
            continue
        key = (title, src)
        if key in seen:
            continue
        seen.add(key)
        deduped.append((title, src, caption))

    # Original and Final Mask always lead; dots, lines and mixed then show only
    # their key outputs, in this order. Other classes keep every output.
    predicted_class = result.get("predicted_class", (item or {}).get("predicted_class", ""))
    pdf_outputs = PDF_OUTPUTS_BY_CLASS.get(predicted_class)
    if pdf_outputs is None:
        return deduped
    by_title = {}
    for block in deduped:
        by_title.setdefault(block[0], block)
    return [by_title[title] for title in ("Original", "Final Mask", *pdf_outputs) if title in by_title]


PDF_OUTPUTS_BY_CLASS = {
    "dots": ("Voronoi Overlay",),
    "lines": ("Grain Map",),
    "mixed": ("Voronoi Overlay", "Grain Map"),
}

LEFT_COLUMN_OUTPUTS = ("Original", "Final Mask")
COLUMN_GAP = 18


def draw_output_columns(pdf, blocks, y, margin, usable_w, page_h, reserve=0):
    """Draw outputs two to a row: Original and Final Mask down the left column,
    the analysis outputs down the right; any further outputs follow in pairs.

    Images are sized so the first two rows still leave `reserve` points
    (the metrics) on the page. Returns the new y.
    """
    blocks = [b for b in blocks if b[1] and str(b[1]).startswith("data:")]
    if not blocks:
        return y
    left = [b for b in blocks if b[0] in LEFT_COLUMN_OUTPUTS]
    right = [b for b in blocks if b[0] not in LEFT_COLUMN_OUTPUTS]
    rows = [[l, r] for l, r in zip_longest(left, right[: len(left)])]
    rest = right[len(left):]
    rows += [rest[i:i + 2] for i in range(0, len(rest), 2)]

    col_w = (usable_w - COLUMN_GAP) / 2
    lead_rows = min(len(rows), 2)
    img_h = (y - margin - reserve) / lead_rows - 38
    img_h = max(140, min(col_w, img_h))
    row_h = img_h + 38

    for row in rows:
        if y - row_h < margin:
            pdf.showPage()
            y = page_h - margin
        next_y = y
        for col, block in enumerate(row):
            if block is None:
                continue
            title, src, _caption = block
            x = margin + col * (col_w + COLUMN_GAP)
            cell_y = draw_result_block(pdf, x, y, col_w, title, src, max_height=img_h, center=True)
            next_y = min(next_y, cell_y)
        y = next_y
    return y


def build_single_result_pdf_bytes(batch_data: dict, current_item: dict, current_analysis: dict) -> bytes:
    buffer = io.BytesIO()
    pdf = pdf_canvas.Canvas(buffer, pagesize=letter)
    page_w, page_h = letter

    margin = 36
    usable_w = page_w - 2 * margin
    y = page_h - margin

    def new_page():
        nonlocal y
        pdf.showPage()
        y = page_h - margin

    def ensure_space(required_height):
        nonlocal y
        if y - required_height < margin:
            new_page()

    pdf.setTitle("AFM Analysis Export")

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(margin, y, "AFM Analysis Export")
    y -= 24

    pdf.setFont("Helvetica", 10)
    meta_lines = [
        f"Job ID: {batch_data.get('job_id', '-')}",
        f"Filename: {current_analysis.get('original_filename', current_item.get('original_filename', '-'))}",
        f"Summary: {current_analysis.get('summary', '-')}",
        f"Predicted Class: {str(current_analysis.get('predicted_class', current_item.get('predicted_class', '-'))).capitalize()}",
        f"Confidence: {float(current_analysis.get('confidence', current_item.get('confidence', 0.0))) * 100:.1f}%",
    ]
    for line in meta_lines:
        pdf.drawString(margin, y, line[:130])
        y -= 13

    y -= 8

    metrics = current_analysis.get("metrics", [])
    details = current_analysis.get("details", "")
    detail_lines = wrap_text(details, 115) if details else []
    # Leave room for metrics and details so the report fits on one page.
    reserve = (30 + 14 * len(metrics) if metrics else 0) + (30 + 11 * len(detail_lines) if detail_lines else 0)
    image_blocks = collect_output_blocks(current_analysis, current_item)
    y = draw_output_columns(pdf, image_blocks, y, margin, usable_w, page_h, reserve=reserve)

    if metrics:
        ensure_space(30 + 14 * len(metrics))
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(margin, y, "Metrics")
        y -= 18
        for metric in metrics:
            ensure_space(16)
            pdf.setFont("Helvetica-Bold", 10)
            pdf.drawString(margin, y, str(metric.get("label", ""))[:55])
            pdf.setFont("Helvetica", 10)
            pdf.drawString(margin + 230, y, str(metric.get("value", ""))[:45])
            y -= 14

    if detail_lines:
        y -= 10
        ensure_space(40)
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(margin, y, "Details")
        y -= 18
        pdf.setFont("Helvetica", 9)
        for line in detail_lines:
            ensure_space(12)
            pdf.drawString(margin, y, line[:130])
            y -= 11

    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


def build_batch_pdf_bytes(batch_data: dict, items: list, analysis_results: list) -> bytes:
    buffer = io.BytesIO()
    pdf = pdf_canvas.Canvas(buffer, pagesize=letter)
    page_w, page_h = letter

    margin = 36
    usable_w = page_w - 2 * margin

    pdf.setTitle("AFM Batch Analysis Export")

    analysis_map = {}
    for result in analysis_results:
        item_id = result.get("item_id")
        if item_id:
            analysis_map[item_id] = result

    for idx, item in enumerate(items):
        if idx > 0:
            pdf.showPage()

        y = page_h - margin
        result = analysis_map.get(item.get("item_id"))

        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(margin, y, "AFM Batch Analysis Export")
        y -= 24

        pdf.setFont("Helvetica", 10)
        meta_lines = [
            f"Job ID: {batch_data.get('job_id', '-')}",
            f"Item {item.get('item_index', '-')}: {item.get('original_filename', '-')}",
            f"Summary: {(result or {}).get('summary', '-')}",
            f"Predicted Class: {str((result or item).get('predicted_class', '-')).capitalize()}",
            f"Confidence: {float((result or item).get('confidence', 0.0)) * 100:.1f}%",
        ]
        for line in meta_lines:
            pdf.drawString(margin, y, line[:130])
            y -= 13

        y -= 10

        if result:
            metrics = result.get("metrics", [])
            details = result.get("details", "")
            detail_lines = wrap_text(details, 130)[:12] if details else []
            # Leave room for metrics and details so each item fits on one page.
            reserve = (26 + 12 * len(metrics[:12]) if metrics else 0) + (
                26 + 10 * len(detail_lines) if detail_lines else 0
            )
            image_blocks = collect_output_blocks(result, item)
            y = draw_output_columns(pdf, image_blocks, y, margin, usable_w, page_h, reserve=reserve)

            if metrics:
                if y < margin + 26 + 12 * len(metrics[:12]):
                    pdf.showPage()
                    y = page_h - margin
                pdf.setFont("Helvetica-Bold", 12)
                pdf.drawString(margin, y, "Metrics")
                y -= 16
                for metric in metrics[:12]:
                    if y < margin + 20:
                        pdf.showPage()
                        y = page_h - margin
                    pdf.setFont("Helvetica-Bold", 9)
                    pdf.drawString(margin, y, str(metric.get("label", ""))[:55])
                    pdf.setFont("Helvetica", 9)
                    pdf.drawString(margin + 220, y, str(metric.get("value", ""))[:45])
                    y -= 12

            if detail_lines:
                y -= 10
                if y < margin + 26 + 10 * len(detail_lines):
                    pdf.showPage()
                    y = page_h - margin
                pdf.setFont("Helvetica-Bold", 12)
                pdf.drawString(margin, y, "Details")
                y -= 16
                pdf.setFont("Helvetica", 8)
                for line in detail_lines:
                    if y < margin + 14:
                        pdf.showPage()
                        y = page_h - margin
                    pdf.drawString(margin, y, line[:135])
                    y -= 10
        else:
            pdf.setFont("Helvetica-Bold", 12)
            pdf.drawString(margin, y, "Status")
            y -= 18
            pdf.setFont("Helvetica", 10)
            pdf.drawString(margin, y, "No analysis result available for this item.")
            y -= 14

    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()
