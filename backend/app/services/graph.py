import networkx as nx
import numpy as np


class IdentityGraphEngine:
    _instance: "IdentityGraphEngine | None" = None

    def __init__(self):
        self.graph = nx.Graph()
        self.alerts: list[dict] = []

    @classmethod
    def get_instance(cls) -> "IdentityGraphEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def add_and_evaluate_scan(
        self,
        face_id: str,
        doc_id: str,
        embedding: list,
        threshold: float = 0.85,
    ) -> dict:
        self.graph.add_node(doc_id, type="document")
        self.graph.add_node(face_id, type="face", embedding=embedding)
        self.graph.add_edge(doc_id, face_id, relation="presented_by")

        emb = np.array(embedding, dtype=float)

        for node, data in self.graph.nodes(data=True):
            if data.get("type") != "face" or node == face_id:
                continue
            existing_emb = np.array(data["embedding"], dtype=float)
            denom = np.linalg.norm(emb) * np.linalg.norm(existing_emb)
            sim = float(np.dot(emb, existing_emb) / denom) if denom else 0.0
            if sim >= threshold:
                self.graph.add_edge(face_id, node, relation="biometric_match", similarity=sim)
                linked_docs = [
                    n
                    for n in self.graph.neighbors(node)
                    if self.graph.nodes[n].get("type") == "document"
                ]
                if any(d != doc_id for d in linked_docs):
                    alert = {
                        "face_id": face_id,
                        "matched_face": node,
                        "docs": linked_docs + [doc_id],
                        "similarity": sim,
                    }
                    self.alerts.append(alert)
                    return {
                        "fraud_loop_detected": True,
                        "matched_alias_docs": list(set(linked_docs + [doc_id])),
                        "similarity": sim,
                        "risk_delta": 40,
                    }

        return {"fraud_loop_detected": False, "matched_alias_docs": [], "risk_delta": 0}

    def get_alerts(self) -> list[dict]:
        return self.alerts
