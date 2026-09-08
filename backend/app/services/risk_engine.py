from app.schemas.scan_result import Penalties, RiskBreakdown, RiskResult


class RiskEngine:
    W_MRZ = 35
    W_ELA = 25
    W_FACE = 25
    W_GRAPH = 15

    @classmethod
    def compute(cls, penalties: Penalties) -> RiskResult:
        mrz_c = cls.W_MRZ * penalties.P_mrz
        ela_c = cls.W_ELA * penalties.P_ela
        face_c = cls.W_FACE * penalties.P_face
        graph_c = cls.W_GRAPH * penalties.P_graph

        score = int(min(100, round(mrz_c + ela_c + face_c + graph_c)))

        if score <= 30:
            band = "LOW"
        elif score <= 60:
            band = "MEDIUM"
        else:
            band = "HIGH"

        return RiskResult(
            score=score,
            band=band,
            breakdown=RiskBreakdown(
                mrz_contribution=round(mrz_c, 1),
                ela_contribution=round(ela_c, 1),
                face_contribution=round(face_c, 1),
                graph_contribution=round(graph_c, 1),
            ),
        )
