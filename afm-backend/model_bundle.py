from __future__ import annotations

import os
from dataclasses import dataclass

from afm_runtime.config import CNN_MODEL_PATH, DEFAULT_CHECKPOINT_PATH
from afm_runtime.models.manager import ModelManager
from afm_runtime.utils.cnn_classifier import CnnClassifier


@dataclass
class ModelBundle:
    model_manager: ModelManager
    cnn_classifier: CnnClassifier


def load_models() -> ModelBundle:
    use_gpu = os.environ.get("AFM_FORCE_CPU", "").lower() not in {"1", "true", "yes"}

    model_manager = ModelManager()
    model_manager.load(DEFAULT_CHECKPOINT_PATH, use_gpu=use_gpu)

    cnn_classifier = CnnClassifier()
    cnn_classifier.load(CNN_MODEL_PATH, device=model_manager.device)

    return ModelBundle(
        model_manager=model_manager,
        cnn_classifier=cnn_classifier,
    )
