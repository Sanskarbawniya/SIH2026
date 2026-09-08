import hashlib
import logging
from pathlib import Path

import networkx as nx
import numpy as np

logger = logging.getLogger(__name__)

RISK_DELTA_MAX = 40.0
DEFAULT_SIMILARITY_THRESHOLD = 0.85

GraphStatus = str  # clear | duplicate_rescan | same_identity | linked_profile | fraud_loop


def file_content_fingerprint(*paths: str) -> str:
    """SHA-256 over file bytes — detects exact re-upload of document + selfie."""
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(Path(path).read_bytes())
    return digest.hexdigest()


def build_identity_keys(
    pan: str | None = None,
    aadhaar: str | None = None,
    passport: str | None = None,
) -> frozenset[str]:
    keys: set[str] = set()
    if pan:
        keys.add(f"pan:{pan.strip().upper()}")
    if aadhaar:
        digits = "".join(c for c in aadhaar if c.isdigit())
        if digits:
            keys.add(f"aadhaar:{digits}")
    if passport:
        keys.add(f"passport:{passport.strip().upper()}")
    return frozenset(keys)


def _has_identity_conflict(keys_a: frozenset[str], keys_b: frozenset[str]) -> bool:
    """True when the same ID type appears with different values (e.g. two PANs)."""
    for prefix in ("pan:", "aadhaar:", "passport:"):
        vals_a = {k for k in keys_a if k.startswith(prefix)}
        vals_b = {k for k in keys_b if k.startswith(prefix)}
        if vals_a and vals_b and vals_a != vals_b:
            return True
    return False


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

    @classmethod
    def reset_instance(cls) -> None:
        cls._instance = None

    @staticmethod
    def normalize_p_graph(risk_delta: float) -> float:
        return min(1.0, max(0.0, risk_delta / RISK_DELTA_MAX))

    @staticmethod
    def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        denom = np.linalg.norm(a) * np.linalg.norm(b)
        return float(np.dot(a, b) / denom) if denom else 0.0

    def _find_doc_by_fingerprint(self, fingerprint: str) -> str | None:
        for node, data in self.graph.nodes(data=True):
            if data.get("type") == "document" and data.get("content_fingerprint") == fingerprint:
                return node
        return None

    def _doc_identity_keys(self, doc_id: str) -> frozenset[str]:
        raw = self.graph.nodes[doc_id].get("identity_keys")
        return frozenset(raw) if raw else frozenset()

    def _linked_documents(self, face_id: str) -> list[str]:
        return [
            n for n in self.graph.neighbors(face_id) if self.graph.nodes[n].get("type") == "document"
        ]

    def _evaluate_cross_document(
        self,
        doc_id: str,
        current_keys: frozenset[str],
        linked_docs: list[str],
    ) -> tuple[bool, GraphStatus, list[str]]:
        """Decide fraud vs legitimate linked identity across prior documents."""
        other_docs = [d for d in linked_docs if d != doc_id]
        if not other_docs:
            return False, "clear", []

        related: list[str] = list(set(other_docs + [doc_id]))
        has_conflict = False
        has_unknown_pair = False
        has_disjoint_valid_ids = False

        for other_id in other_docs:
            other_keys = self._doc_identity_keys(other_id)

            if current_keys & other_keys:
                # Same PAN / Aadhaar / passport number — re-presentation, not alias fraud
                continue

            if _has_identity_conflict(current_keys, other_keys):
                has_conflict = True
                break

            if not current_keys or not other_keys:
                has_unknown_pair = True
                continue

            # Both have IDs, different types (e.g. PAN + Aadhaar) — legitimate multi-doc profile
            has_disjoint_valid_ids = True

        if has_conflict or has_unknown_pair:
            return True, "fraud_loop", related

        if has_disjoint_valid_ids:
            return False, "linked_profile", related

        return False, "same_identity", related

    def add_and_evaluate_scan(
        self,
        face_id: str,
        doc_id: str,
        embedding: list,
        *,
        content_fingerprint: str | None = None,
        identity_keys: frozenset[str] | None = None,
        threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    ) -> dict:
        identity_keys = identity_keys or frozenset()

        # Exact re-scan: same document file + same selfie file already in graph
        if content_fingerprint:
            prior_doc = self._find_doc_by_fingerprint(content_fingerprint)
            if prior_doc is not None:
                logger.info("Duplicate rescan detected for fingerprint %s", content_fingerprint[:12])
                return {
                    "fraud_loop_detected": False,
                    "graph_status": "duplicate_rescan",
                    "matched_alias_docs": [prior_doc],
                    "matched_face": None,
                    "similarity": 1.0,
                    "risk_delta": 0,
                }

        self.graph.add_node(
            doc_id,
            type="document",
            content_fingerprint=content_fingerprint,
            identity_keys=list(identity_keys),
        )
        self.graph.add_node(face_id, type="face", embedding=embedding)
        self.graph.add_edge(doc_id, face_id, relation="presented_by")

        emb = np.array(embedding, dtype=float)
        best_match: dict | None = None

        for node, data in self.graph.nodes(data=True):
            if data.get("type") != "face" or node == face_id:
                continue
            existing_emb = np.array(data["embedding"], dtype=float)
            sim = self._cosine_similarity(emb, existing_emb)
            if sim >= threshold and (best_match is None or sim > best_match["similarity"]):
                best_match = {"node": node, "similarity": sim}

        if not best_match:
            return {
                "fraud_loop_detected": False,
                "graph_status": "clear",
                "matched_alias_docs": [],
                "matched_face": None,
                "similarity": None,
                "risk_delta": 0,
            }

        matched_face = best_match["node"]
        sim = best_match["similarity"]
        self.graph.add_edge(face_id, matched_face, relation="biometric_match", similarity=sim)
        linked_docs = self._linked_documents(matched_face)

        is_fraud, status, related_docs = self._evaluate_cross_document(doc_id, identity_keys, linked_docs)

        if is_fraud:
            alert = {
                "face_id": face_id,
                "matched_face": matched_face,
                "docs": related_docs,
                "similarity": sim,
                "reason": "conflicting_or_unknown_identity",
            }
            self.alerts.append(alert)
            logger.warning(
                "Fraud loop detected: face %s matches %s (sim=%.3f) docs=%s",
                face_id,
                matched_face,
                sim,
                related_docs,
            )
            return {
                "fraud_loop_detected": True,
                "graph_status": "fraud_loop",
                "matched_alias_docs": related_docs,
                "matched_face": matched_face,
                "similarity": sim,
                "risk_delta": RISK_DELTA_MAX,
            }

        return {
            "fraud_loop_detected": False,
            "graph_status": status,
            "matched_alias_docs": related_docs if status in ("linked_profile", "same_identity") else [],
            "matched_face": matched_face,
            "similarity": sim,
            "risk_delta": 0,
        }

    def get_stats(self) -> dict:
        doc_nodes = [n for n, d in self.graph.nodes(data=True) if d.get("type") == "document"]
        face_nodes = [n for n, d in self.graph.nodes(data=True) if d.get("type") == "face"]
        match_edges = [
            (u, v, d)
            for u, v, d in self.graph.edges(data=True)
            if d.get("relation") == "biometric_match"
        ]
        return {
            "documents": len(doc_nodes),
            "faces": len(face_nodes),
            "biometric_links": len(match_edges),
            "alerts": len(self.alerts),
        }

    def get_alerts(self) -> list[dict]:
        return self.alerts

    def clear(self) -> None:
        self.graph.clear()
        self.alerts.clear()
        logger.info("Identity graph cleared")
