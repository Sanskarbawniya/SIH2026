from pathlib import Path
from typing import Optional

import cv2
import numpy as np


class LivenessDetector:
    """Phase 7: MiniFASNet when weights exist; heuristic fallback otherwise."""

    def __init__(self):
        self.model_dir = Path(__file__).resolve().parent.parent.parent / "models" / "antispoof"
        self.weights_path = self.model_dir / "MiniFASNetV2.pth"
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        if not self.weights_path.exists():
            return None
        try:
            import torch

            self._model = torch.load(self.weights_path, map_location="cpu")
            self._model.eval()
            return self._model
        except Exception:
            return None

    @staticmethod
    def _heuristic_check(image_path: str) -> bool:
        img = cv2.imread(image_path)
        if img is None:
            return False
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        return laplacian_var > 80.0

    def check_liveness(self, selfie_path: str) -> dict:
        model = self._load_model()
        if model is None:
            passed = self._heuristic_check(selfie_path)
            return {
                "liveness_passed": passed,
                "method": "heuristic",
                "note": "Place MiniFASNetV2.pth in backend/models/antispoof/ for full anti-spoofing",
            }

        try:
            import torch
            from PIL import Image

            img = Image.open(selfie_path).convert("RGB").resize((80, 80))
            tensor = torch.tensor(np.array(img)).permute(2, 0, 1).float().unsqueeze(0) / 255.0
            with torch.no_grad():
                output = model(tensor)
                label = int(output.argmax(dim=1).item())
            return {"liveness_passed": label == 1, "method": "minifasnet"}
        except Exception:
            passed = self._heuristic_check(selfie_path)
            return {"liveness_passed": passed, "method": "heuristic_fallback"}


_liveness_detector: Optional[LivenessDetector] = None


def get_liveness_detector() -> LivenessDetector:
    global _liveness_detector
    if _liveness_detector is None:
        _liveness_detector = LivenessDetector()
    return _liveness_detector
