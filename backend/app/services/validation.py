import re
from typing import Optional


class ValidationEngine:
    d_table = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
        [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
        [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
        [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
        [5, 9, 8, 7, 6, 0, 1, 2, 3, 4],
        [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
        [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
        [8, 7, 6, 5, 4, 3, 2, 1, 0, 9],
        [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    ]
    p_table = [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
        [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
        [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
        [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
        [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
        [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
        [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
    ]

    @classmethod
    def validate_verhoeff(cls, number_str: str) -> bool:
        if not number_str.isdigit() or len(number_str) != 12:
            return False
        checksum = 0
        for i, item in enumerate(reversed(number_str)):
            checksum = cls.d_table[checksum][cls.p_table[i % 8][int(item)]]
        return checksum == 0

    @staticmethod
    def validate_pan(pan_str: str) -> bool:
        pattern = r"^[A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z]$"
        return bool(re.match(pattern, pan_str.upper()))

    @staticmethod
    def validate_mrz(mrz_text: str) -> Optional[bool]:
        if not mrz_text or len(mrz_text) < 44:
            return None
        try:
            from mrz.checker.td3 import TD3CodeChecker

            checker = TD3CodeChecker(mrz_text.replace(" ", ""))
            return bool(checker)
        except Exception:
            return False

    @classmethod
    def compute_p_mrz(
        cls,
        pan_number: Optional[str],
        aadhaar_number: Optional[str],
        raw_text: str,
    ) -> tuple[dict, float]:
        validations = {
            "pan_format": None,
            "verhoeff": None,
            "mrz_valid": None,
        }
        penalties = []

        if pan_number:
            pan_ok = cls.validate_pan(pan_number)
            validations["pan_format"] = pan_ok
            if not pan_ok:
                penalties.append(0.8)

        if aadhaar_number:
            verhoeff_ok = cls.validate_verhoeff(aadhaar_number)
            validations["verhoeff"] = verhoeff_ok
            if not verhoeff_ok:
                penalties.append(1.0)

        if "<<" in raw_text or raw_text.count("<") >= 5:
            mrz_ok = cls.validate_mrz(raw_text)
            validations["mrz_valid"] = mrz_ok
            if mrz_ok is False:
                penalties.append(0.9)

        if not penalties:
            if pan_number and validations["pan_format"]:
                penalties.append(0.0)
            elif aadhaar_number and validations["verhoeff"]:
                penalties.append(0.0)
            else:
                penalties.append(0.2 if (pan_number or aadhaar_number) else 0.0)

        p_mrz = min(1.0, max(penalties) if penalties else 0.0)
        return validations, p_mrz
