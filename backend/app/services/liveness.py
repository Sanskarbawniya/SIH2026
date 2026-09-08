import logging
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

LIVENESS_PASS_THRESHOLD = 0.52


class LivenessDetector:
    """Phase 7: MiniFASNet when weights exist; multi-signal heuristic otherwise."""

    def __init__(self):
        self.model_dir = Path(__file__).resolve().parent.parent.parent / "models" / "antispoof"
        self.weights_path = self.model_dir / "MiniFASNetV2.pth"
        self._model = None

    def _load_minifasnet(self):
        if self._model is not None:
            return self._model
        if not self.weights_path.exists():
            return None
        try:
            import torch

            self._model = torch.load(self.weights_path, map_location="cpu", weights_only=False)
            if hasattr(self._model, "eval"):
                self._model.eval()
            return self._model
        except Exception as exc:
            logger.warning("MiniFASNet load failed: %s", exc)
            return None

    @staticmethod
    def _analyze_signals(image_path: str) -> dict:
        """Heuristic anti-spoof signals for screen/print attacks."""
        img = cv2.imread(image_path)
        if img is None:
            return {
                "sharpness": 0.0,
                "color_variance": 0.0,
                "texture_score": 0.0,
                "screen_glare": 0.0,
                "score": 0.0,
                "reason": "Could not read selfie image",
            }

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        sharpness = min(1.0, laplacian_var / 120.0)

        color_std = float(np.std(img.astype(np.float32)))
        color_variance = min(1.0, color_std / 45.0)

        f = np.fft.fftshift(np.fft.fft2(gray))
        magnitude = np.abs(f)
        cy, cx = h // 2, w // 2
        y, x = np.ogrid[:h, :w]
        mask = ((y - cy) ** 2 + (x - cx) ** 2) <= (min(h, w) * 0.15) ** 2
        low_energy = float(magnitude[mask].mean() or 1.0)
        high_energy = float(magnitude[~mask].mean() or 0.0)
        hf_ratio = high_energy / (low_energy + 1e-6)
        texture_score = min(1.0, hf_ratio / 0.35)

        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        saturation = hsv[:, :, 1].astype(np.float32) / 255.0
        value = hsv[:, :, 2].astype(np.float32) / 255.0
        bright_flat = np.mean((saturation < 0.12) & (value > 0.75))
        screen_glare = min(1.0, bright_flat * 4.0)

        score = (
            sharpness * 0.35
            + color_variance * 0.25
            + texture_score * 0.25
            + (1.0 - screen_glare) * 0.15
        )
        score = round(float(np.clip(score, 0.0, 1.0)), 3)

        reason = "Live capture indicators within normal range"
        if score < LIVENESS_PASS_THRESHOLD:
            reasons = []
            if sharpness < 0.35:
                reasons.append("low sharpness (blur/print)")
            if screen_glare > 0.45:
                reasons.append("screen glare detected")
            if texture_score < 0.25:
                reasons.append("flat texture (photo-of-photo)")
            if color_variance < 0.25:
                reasons.append("low color depth")
            reason = "; ".join(reasons) if reasons else "Spoof indicators above threshold"

        return {
            "sharpness": round(sharpness, 3),
            "color_variance": round(color_variance, 3),
            "texture_score": round(texture_score, 3),
            "screen_glare": round(screen_glare, 3),
            "score": score,
            "reason": reason,
        }

    def _run_minifasnet(self, image_path: str) -> dict | None:
        model = self._load_minifasnet()
        if model is None:
            return None
        try:
            import torch
            from PIL import Image

            img = Image.open(image_path).convert("RGB").resize((80, 80))
            tensor = torch.tensor(np.array(img)).permute(2, 0, 1).float().unsqueeze(0) / 255.0
            with torch.no_grad():
                output = model(tensor)
                if hasattr(output, "softmax"):
                    probs = output.softmax(dim=1)
                else:
                    probs = torch.softmax(output, dim=1)
                live_prob = float(probs[0, 1].item()) if probs.shape[1] > 1 else float(probs.max().item())
            passed = live_prob >= 0.5
            return {
                "liveness_passed": passed,
                "score": round(live_prob, 3),
                "method": "minifasnet",
                "reason": "Live face" if passed else "MiniFASNet spoof detected",
                "signals": {"live_probability": round(live_prob, 3)},
            }
        except Exception as exc:
            logger.warning("MiniFASNet inference failed: %s", exc)
            return None

    def check_liveness(self, selfie_path: str) -> dict:
        start = time.perf_counter()
        neural = self._run_minifasnet(selfie_path)
        if neural is not None:
            neural["inference_ms"] = round((time.perf_counter() - start) * 1000, 1)
            return neural

        signals = self._analyze_signals(selfie_path)
        passed = signals["score"] >= LIVENESS_PASS_THRESHOLD
        note = None
        if not self.weights_path.exists():
            note = "Place MiniFASNetV2.pth in backend/models/antispoof/ for neural anti-spoofing"

        return {
            "liveness_passed": passed,
            "score": signals["score"],
            "method": "heuristic",
            "reason": signals["reason"],
            "signals": {
                "sharpness": signals["sharpness"],
                "color_variance": signals["color_variance"],
                "texture_score": signals["texture_score"],
                "screen_glare": signals["screen_glare"],
            },
            "note": note,
            "inference_ms": round((time.perf_counter() - start) * 1000, 1),
        }


_liveness_detector: Optional[LivenessDetector] = None


def get_liveness_detector() -> LivenessDetector:
    global _liveness_detector
    if _liveness_detector is None:
        _liveness_detector = LivenessDetector()
    return _liveness_detector
