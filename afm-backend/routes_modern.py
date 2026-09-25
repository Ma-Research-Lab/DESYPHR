from flask import jsonify

from afm_runtime.api.routes import create_routes

from model_bundle import ModelBundle


def register_modern_routes(app, models: ModelBundle):
    create_routes(app, models.model_manager, models.cnn_classifier)

    @app.route("/api/healthz", methods=["GET"])
    def healthz_alias():
        return jsonify({"status": "ok", "message": "AFM backend running"})

    @app.route("/api/model-info", methods=["GET"])
    def model_info_alias():
        mm = models.model_manager
        return jsonify(
            {
                "mode": "production",
                "device": str(mm.device),
                "img_size": mm.img_size,
                "class_names": mm.class_names,
                "num_classes": mm.model_info.get("num_classes", len(mm.class_names)),
                "is_binary": mm.is_binary,
                "active_model": mm.active_checkpoint,
            }
        )
