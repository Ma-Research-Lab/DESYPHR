import os

from flask import Flask
from flask_cors import CORS

from afm_runtime import config as runtime_config
from model_bundle import load_models
from routes_legacy import register_legacy_routes
from routes_modern import register_modern_routes


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["UPLOAD_FOLDER"] = runtime_config.UPLOAD_FOLDER
    app.config["MAX_CONTENT_LENGTH"] = runtime_config.MAX_CONTENT_LENGTH

    allowed_origins = [
        origin.strip()
        for origin in os.environ.get(
            "AFM_ALLOWED_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ]

    CORS(
        app,
        resources={
            r"/*": {
                "origins": allowed_origins,
                "methods": ["GET", "POST", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization"],
                "expose_headers": ["Content-Type"],
            }
        },
    )

    models = load_models()

    register_legacy_routes(app, models)
    register_modern_routes(app, models)

    return app
