import io

from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas

from utils import decode_data_url_to_pil, fit_image_size, wrap_text


def draw_result_block(pdf, x, y, width, title, data_url, caption="", max_height=210):
    pil_img = decode_data_url_to_pil(data_url)
    if pil_img is None:
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(x, y, title)
        pdf.setFont("Helvetica", 9)
        pdf.drawString(x, y - 14, "No image available")
        return y - 40

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(x, y, title)
    y -= 14

    img_w, img_h = pil_img.size
    draw_w, draw_h = fit_image_size(img_w, img_h, width, max_height)

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
    return deduped


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
        f"Job Directory: {batch_data.get('job_dir', '-')}",
        f"Item ID: {current_item.get('item_id', '-')}",
        f"Filename: {current_analysis.get('original_filename', current_item.get('original_filename', '-'))}",
        f"Summary: {current_analysis.get('summary', '-')}",
        f"Predicted Class: {current_analysis.get('predicted_class', current_item.get('predicted_class', '-'))}",
        f"Confidence: {float(current_analysis.get('confidence', current_item.get('confidence', 0.0))) * 100:.1f}%",
        f"CNN Model: {current_analysis.get('cnn_model_name', current_item.get('cnn_model_name', '-'))}",
        f"U-Net Model: {current_analysis.get('unet_model_name', current_item.get('unet_model_name', '-'))}",
    ]
    for line in meta_lines:
        pdf.drawString(margin, y, line[:130])
        y -= 13

    y -= 8

    image_blocks = collect_output_blocks(current_analysis, current_item)

    for title, src, caption in image_blocks:
        if not src or not str(src).startswith("data:"):
            continue
        ensure_space(260)
        y = draw_result_block(pdf, margin, y, usable_w, title, src, caption, max_height=230)

    metrics = current_analysis.get("metrics", [])
    if metrics:
        ensure_space(60 + 16 * len(metrics))
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

    details = current_analysis.get("details", "")
    if details:
        detail_lines = wrap_text(details, 115)
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
            f"Item ID: {item.get('item_id', '-')}",
            f"Summary: {(result or {}).get('summary', '-')}",
            f"Predicted Class: {(result or item).get('predicted_class', '-')}",
            f"Confidence: {float((result or item).get('confidence', 0.0)) * 100:.1f}%",
        ]
        for line in meta_lines:
            pdf.drawString(margin, y, line[:130])
            y -= 13

        y -= 10

        if result:
            image_blocks = collect_output_blocks(result, item)

            for title, src, caption in image_blocks:
                if not src or not str(src).startswith("data:"):
                    continue
                if y < 280:
                    pdf.showPage()
                    y = page_h - margin
                y = draw_result_block(pdf, margin, y, usable_w, title, src, caption, max_height=180)

            metrics = result.get("metrics", [])
            if metrics:
                if y < 140:
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

            details = result.get("details", "")
            if details:
                if y < 120:
                    pdf.showPage()
                    y = page_h - margin
                pdf.setFont("Helvetica-Bold", 12)
                pdf.drawString(margin, y, "Details")
                y -= 16
                pdf.setFont("Helvetica", 8)
                for line in wrap_text(details, 130)[:12]:
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
