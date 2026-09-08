import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageEnhance


class ForensicAnalyzer:
    ELA_NORMALIZE_MAX = 45.0

    @staticmethod
    def generate_ela(image_path: str, quality: int = 90) -> tuple[np.ndarray, float]:
        original = Image.open(image_path).convert("RGB")

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            resaved_path = tmp.name

        try:
            original.save(resaved_path, "JPEG", quality=quality)
            resaved = Image.open(resaved_path)

            ela_img = ImageChops.difference(original, resaved)
            extrema = ela_img.getextrema()
            max_diff = max(ex[1] for ex in extrema) or 1
            scale = 255.0 / max_diff
            ela_enhanced = ImageEnhance.Brightness(ela_img).enhance(scale)
            ela_np = np.array(ela_enhanced)

            gray = cv2.cvtColor(ela_np, cv2.COLOR_RGB2GRAY)
            h, w = gray.shape
            stds = []
            for i in range(0, h, 32):
                for j in range(0, w, 32):
                    patch = gray[i : i + 32, j : j + 32]
                    if patch.size:
                        stds.append(float(np.std(patch)))

            anomaly_score = float(np.std(stds)) if stds else 0.0
            return ela_np, anomaly_score
        finally:
            Path(resaved_path).unlink(missing_ok=True)

    @classmethod
    def save_ela_image(cls, ela_np: np.ndarray, output_path: Path) -> str:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(ela_np).save(output_path)
        return f"/uploads/ela/{output_path.name}"

    @classmethod
    def normalize_p_ela(cls, anomaly_score: float) -> float:
        return min(1.0, max(0.0, anomaly_score / cls.ELA_NORMALIZE_MAX))

    @classmethod
    def tampering_band(cls, p_ela: float) -> str:
        if p_ela <= 0.15:
            return "CLEAN"
        if p_ela <= 0.4:
            return "SUSPICIOUS"
        return "TAMPERED"
