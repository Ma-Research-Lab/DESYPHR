import uuid
from pathlib import Path

from flask import abort, jsonify, make_response, request, send_file

import settings as config
from model_bundle import ModelBundle
from services.export_service import build_batch_pdf_bytes, build_single_result_pdf_bytes
from services.pipeline_service import analyze_one_item, process_single_file, resegment_item
from utils import sanitize_filename


def pdf_response(pdf_bytes: bytes, filename: str):
    response = make_response(pdf_bytes)
    response.headers["Content-Type"] = "application/pdf"
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.headers["Content-Length"] = str(len(pdf_bytes))
    return response


def register_legacy_routes(app, models: ModelBundle):
    @app.route("/api/health", methods=["GET"])
    def health_api():
        return jsonify({"ok": True, "message": "AFM backend running"})

    @app.route("/job_file/<job_id>/<path:filename>", methods=["GET"])
    def serve_job_file(job_id, filename):
        job_dir = config.RESULTS_DIR / f"job_{job_id}"
        file_path = (job_dir / filename).resolve()

        try:
            root = job_dir.resolve()
            if root not in file_path.parents and file_path != root:
                return abort(403)
        except Exception:
            return abort(403)

        if not file_path.exists():
            return abort(404)

        return send_file(str(file_path))

    @app.route("/api/upload", methods=["POST"])
    def upload_and_predict():
        try:
            files = request.files.getlist("files")
            if not files:
                single_file = request.files.get("file")
                if single_file:
                    files = [single_file]

            if not files:
                return jsonify({"error": "No files uploaded."}), 400

            valid_files = [f for f in files if f and f.filename]
            if not valid_files:
                return jsonify({"error": "All uploaded files were empty."}), 400

            client_session_id = request.form.get("client_session_id", "").strip()
            if not client_session_id:
                client_session_id = uuid.uuid4().hex[:12]

            job_id = uuid.uuid4().hex[:10]
            job_dir = config.RESULTS_DIR / f"job_{job_id}"
            job_dir.mkdir(exist_ok=True)

            items = []
            for index, file_storage in enumerate(valid_files, start=1):
                item_data = process_single_file(models, file_storage, job_dir, index, request.form)
                item_data["job_id"] = job_id
                item_data["job_dir"] = str(job_dir)
                items.append(item_data)

            return jsonify(
                {
                    "message": "Batch upload + prediction successful",
                    "client_session_id": client_session_id,
                    "job_id": job_id,
                    "job_dir": str(job_dir),
                    "batch_count": len(items),
                    "cnn_model_name": config.CNN_WEIGHTS.name,
                    "unet_model_name": config.UNET_WEIGHTS.name,
                    "items": items,
                }
            )

        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/resegment-item", methods=["POST"])
    def resegment_one_item():
        try:
            data = request.get_json(force=True)
            item = data.get("item") or {}
            params = data.get("params") or {}

            saved_path = item.get("saved_path", "")
            if not saved_path:
                return jsonify({"error": "Missing saved_path."}), 400

            results_root = config.RESULTS_DIR.resolve()
            resolved = Path(saved_path).resolve()
            if results_root not in resolved.parents or not resolved.exists():
                return jsonify({"error": "Item image not found."}), 404

            return jsonify(resegment_item(models, item, params))

        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/run-analysis", methods=["POST"])
    def run_analysis():
        try:
            data = request.get_json(force=True)
            edited_mask_data = data.get("edited_mask_data_url", "")
            result = analyze_one_item(models, data, edited_mask_data)
            return jsonify(result)

        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/run-analysis-batch", methods=["POST"])
    def run_analysis_batch():
        try:
            data = request.get_json(force=True)

            job_id = data.get("job_id")
            job_dir = data.get("job_dir")
            items = data.get("items", [])

            if not job_id or not job_dir:
                return jsonify({"error": "Missing job_id or job_dir."}), 400

            if not isinstance(items, list) or not items:
                return jsonify({"error": "No batch items provided."}), 400

            edited_masks_by_item_id = data.get("edited_masks_by_item_id", {})
            if not isinstance(edited_masks_by_item_id, dict):
                edited_masks_by_item_id = {}

            results = []
            for item in items:
                item_payload = dict(item)
                item_payload["job_id"] = job_id
                item_payload["job_dir"] = job_dir

                item_id = item_payload.get("item_id", "")
                edited_mask_data = edited_masks_by_item_id.get(item_id, "")

                result = analyze_one_item(models, item_payload, edited_mask_data)
                results.append(result)

            return jsonify(
                {
                    "message": "Batch analysis complete",
                    "job_id": job_id,
                    "job_dir": job_dir,
                    "result_count": len(results),
                    "results": results,
                }
            )

        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/export-pdf", methods=["POST"])
    def export_single_pdf():
        try:
            data = request.get_json(force=True)

            batch_data = data.get("batch_data")
            current_item = data.get("current_item")
            current_analysis = data.get("current_analysis")

            if not isinstance(batch_data, dict):
                return jsonify({"error": "Missing or invalid batch_data."}), 400
            if not isinstance(current_item, dict):
                return jsonify({"error": "Missing or invalid current_item."}), 400
            if not isinstance(current_analysis, dict):
                return jsonify({"error": "Missing or invalid current_analysis."}), 400

            pdf_bytes = build_single_result_pdf_bytes(
                batch_data=batch_data,
                current_item=current_item,
                current_analysis=current_analysis,
            )

            base_name = Path(
                current_analysis.get("original_filename") or current_item.get("original_filename") or "afm_result"
            ).stem
            filename = f"{sanitize_filename(base_name, 'afm_result')}_analysis.pdf"

            return pdf_response(pdf_bytes, filename)

        except Exception as e:
            return jsonify({"error": str(e)}), 500

    @app.route("/api/export-pdf-batch", methods=["POST"])
    def export_batch_pdf():
        try:
            data = request.get_json(force=True)

            batch_data = data.get("batch_data")
            items = data.get("items")
            analysis_results = data.get("analysis_results")

            if not isinstance(batch_data, dict):
                return jsonify({"error": "Missing or invalid batch_data."}), 400
            if not isinstance(items, list) or not items:
                return jsonify({"error": "Missing or invalid items list."}), 400
            if not isinstance(analysis_results, list):
                return jsonify({"error": "Missing or invalid analysis_results list."}), 400

            pdf_bytes = build_batch_pdf_bytes(
                batch_data=batch_data,
                items=items,
                analysis_results=analysis_results,
            )

            job_id = sanitize_filename(batch_data.get("job_id", "batch"))
            filename = f"afm_batch_{job_id}.pdf"

            return pdf_response(pdf_bytes, filename)

        except Exception as e:
            return jsonify({"error": str(e)}), 500
