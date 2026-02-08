import time
from collections import defaultdict
from sklearn.ensemble import IsolationForest


class TopologyAnomalyModel:
    def __init__(self, min_train_samples=10):
        self.min_train_samples = min_train_samples

        # Unsupervised model for connection anomalies
        self.model = IsolationForest(
            contamination=0.2,
            random_state=42
        )

        self.training_data = []
        self.trained = False

        # Device presence tracking
        self.devices = defaultdict(lambda: {
            "first_seen": None,
            "seen_count": 0
        })
        
    def reset_model(self):
        """Reset the model to untrained state"""
        self.model = IsolationForest(
            contamination=0.1,
            random_state=42
        )
        self.training_data = []
        self.trained = False
        self.devices = defaultdict(lambda: {
            "first_seen": None,
            "seen_count": 0
        })
        print(f"[AI] Model reset to initial state")

    # -----------------------------
    # Utilities
    # -----------------------------

    def ip_to_int(self, ip):
        try:
            parts = ip.split(".")
            return sum(int(p) << (8 * (3 - i)) for i, p in enumerate(parts))
        except Exception:
            return 0

    # -----------------------------
    # DEVICE ANOMALY LOGIC
    # -----------------------------

    def observe_device(self, ip):
        """
        Returns True if device is NEW / anomalous
        """
        stats = self.devices[ip]

        if stats["first_seen"] is None:
            stats["first_seen"] = time.time()
            stats["seen_count"] = 1
            return True  # NEW DEVICE

        stats["seen_count"] += 1
        return False

    # -----------------------------
    # CONNECTION ANOMALY LOGIC
    # -----------------------------

    def _hash_string(self, s):
        """Simple hash for categorical string data"""
        return abs(hash(s)) % (10**8)

    def _extract_features(self, src_ip, dst_ip, port, process, count):
        return [
            self.ip_to_int(src_ip),
            self.ip_to_int(dst_ip),
            port,
            self._hash_string(process),
            count
        ]

    def _train_if_ready(self):
        if not self.trained and len(self.training_data) >= self.min_train_samples:
            self.model.fit(self.training_data)
            self.trained = True

    def observe_connection(self, src_ip, dst_ip, port, process, count):
        """
        Returns True if connection behavior is anomalous
        """
        features = self._extract_features(src_ip, dst_ip, port, process, count)
        self.training_data.append(features)

        self._train_if_ready()

        if not self.trained:
            return False

        if not self.trained:
            return False

        prediction = self.model.predict([features])
        score = self.model.decision_function([features])[0]
        print(f"[AI DEBUG] Features: {features} -> Prediction: {prediction[0]}, Score: {score:.4f}")
        
        # Heuristic Fallback: 
        # If ML is uncertain (score > -0.1) but count is massive compared to average
        if score > -0.1 and len(self.training_data) > 0:
            avg_count = sum(t[4] for t in self.training_data) / len(self.training_data)
            current_count = count
            # If count is 10x average and > 100, flag it
            if current_count > 100 and current_count > avg_count * 10:
                print(f"[AI DEBUG] Heuristic override: Count {current_count} >> Avg {avg_count}")
                return True

        return prediction[0] == -1
    # -----------------------------
    # PERSISTENCE
    # -----------------------------
    
    def save_model(self, path="ai_model.pkl"):
        """Save the model and state to disk"""
        import pickle
        state = {
            "model": self.model,
            "trained": self.trained,
            "training_data": self.training_data,
            "devices": dict(self.devices)
        }
        try:
            with open(path, "wb") as f:
                pickle.dump(state, f)
            print(f"[AI] Model saved to {path}")
        except Exception as e:
            print(f"[AI] Failed to save model: {e}")

    def load_model(self, path="ai_model.pkl"):
        """Load the model and state from disk"""
        import pickle
        import os
        if not os.path.exists(path):
            return
            
        try:
            with open(path, "rb") as f:
                state = pickle.load(f)
                
            self.model = state.get("model", self.model)
            self.trained = state.get("trained", False)
            self.training_data = state.get("training_data", [])
            self.devices.update(state.get("devices", {}))
            print(f"[AI] Model loaded from {path}")
        except Exception as e:
            print(f"[AI] Failed to load model: {e}")
