"""
Network Topology Anomaly Detector

Detects anomalies in network topology data from siem_node:
1. NEW NODES: Identifies devices that appear for the first time
2. EXCESSIVE REQUESTS: Identifies nodes sending/receiving unusually high traffic

Uses statistical baselines to detect request volume anomalies.
"""

import time
from collections import defaultdict
from datetime import datetime, timedelta
import os
from typing import Dict, List, Tuple, Optional
from .ai import TopologyAnomalyModel

import re

class NetworkAnomalyDetector:
    """
    Detects anomalies in network topology and communication patterns.
    
    Tracks:
    - New devices appearing in the network (new nodes)
    - Nodes with excessive request counts (communication spikes)
    """
    
    # Regex for parsing COMMUNICATION_PATTERN logs
    LOG_PATTERN = re.compile(r"Devices\s+([^\s]+)\s+and\s+([^\s]+)(?:\s*\((\d+)\s+connections\))?(?:\s*\[Port:\s*(\d+|None)\s*\|\s*Process:\s*([^\]]+)\])?")
    
    def __init__(self, request_threshold_multiplier: float = 2.5, 
                 baseline_window_minutes: int = 30):
        """
        Args:
            request_threshold_multiplier: Alert when node requests > baseline * multiplier
            baseline_window_minutes: Time window for calculating average baseline
        """
        self.request_threshold_multiplier = request_threshold_multiplier
        self.baseline_window_minutes = baseline_window_minutes
        
        # Device tracking: ip -> {"first_seen": timestamp, "count": int}
        self.known_devices = {}
        
        # Request history: ip -> [(timestamp, request_count), ...]
        # Keeps rolling window of request counts for baseline calculation
        self.request_history = defaultdict(list)
        
        # Anomaly log for audit trail
        self.anomalies = []

        # ML Model (Persistent)
        self.ml_model = TopologyAnomalyModel()
        # Determine absolute path to models directory (siem_server/models)
        current_dir = os.path.dirname(os.path.abspath(__file__)) # siem_server/ai
        server_dir = os.path.dirname(current_dir) # siem_server
        self.models_dir = os.path.join(server_dir, "models")
        
        self.model_path = os.path.join(self.models_dir, "ai_model.pkl")
        self.state_path = os.path.join(self.models_dir, "detector_state.pkl")
        
        # Ensure models directory exists
        os.makedirs(self.models_dir, exist_ok=True)
        
        try:
            self.load_state()
        except Exception as e:
            print(f"[AI] Warning: Could not load AI state: {e}")

    def process_log_entry(self, event_type: str, data: str):
        """
        Process a single log entry for anomaly detection.
        Called by siem_server.py ingest_log().
        """
        if event_type == "COMMUNICATION_PATTERN":
            # DEBUG
            print(f"[AI DEBUG] Processing log: {data}")
            match = self.LOG_PATTERN.match(data)
            if match:
                print(f"[AI DEBUG] Match found: {match.groups()}")
                ip1, ip2, count_str, port_str, process = match.groups()
                
                count = int(count_str) if count_str else 1
                port = int(port_str) if port_str and port_str != 'None' else 0
                process = process.strip() if process else "unknown"

                # Feed to ML Model
                # Check connection (ip1 -> ip2)
                is_anomalous = self.ml_model.observe_connection(ip1, ip2, port, process, count)
                
                # If anomalous, log it
                if is_anomalous: # Isolation Forest flagged this pattern
                    timestamp = time.time()
                    self.anomalies.append({
                        "type": "ML_ANOMALY",
                        "timestamp": timestamp,
                        "node_ip": ip1, # Source
                        "dst_ip": ip2,
                        "port": port,
                        "process": process,
                        "severity": "HIGH",
                        "details": "Unusual communication pattern detected by AI"
                    })
                    print(f"[AI] ANOMALY DETECTED: {ip1} -> {ip2} (Port: {port}, Proc: {process})")
    # DEVICE ANOMALY DETECTION
    # ==============================
    
    def detect_new_nodes(self, nodes: Dict[str, dict]) -> List[str]:
        """
        Detect nodes that are appearing for the first time in the topology.
        
        Args:
            nodes: Dict of {ip: {"mac": str, "hostname": str or None}}
                   From siem_node network_discovery.discover_devices()["nodes"]
        
        Returns:
            List of new node IPs detected
        """
        new_nodes = []
        current_time = time.time()
        
        for ip, metadata in nodes.items():
            if ip not in self.known_devices:
                # NEW NODE DETECTED
                self.known_devices[ip] = {
                    "first_seen": current_time,
                    "mac": metadata.get("mac", "unknown"),
                    "hostname": metadata.get("hostname", "unknown")
                }
                new_nodes.append(ip)
                
                # Log anomaly
                self.anomalies.append({
                    "type": "NEW_NODE",
                    "timestamp": current_time,
                    "node_ip": ip,
                    "mac": metadata.get("mac", "unknown"),
                    "hostname": metadata.get("hostname", "unknown"),
                    "severity": "MEDIUM"
                })
        
        return new_nodes
    
    # ==============================
    # REQUEST VOLUME ANOMALY DETECTION
    # ==============================
    
    def observe_communication(self, edges: Dict[Tuple[str, str], int]) -> Dict[str, dict]:
        """
        Observe communication edges and detect excessive request volumes.
        
        Args:
            edges: Dict of {(ip1, ip2): request_count}
                   From siem_node network_discovery.discover_devices()["edges"]
        
        Returns:
            Dict of anomalous IPs with details:
            {
                "ip": {
                    "baseline": float,
                    "current": int,
                    "multiplier": float,
                    "severity": str
                },
                ...
            }
        """
        current_time = time.time()
        anomalies = {}
        
        # Aggregate request counts per node (sum of all edges involving that node)
        node_request_counts = defaultdict(int)
        
        for edge_key, count in edges.items():
            # Edge key could be old format or new format
            # Old: "(ip1, ip2)" tuple string representation? No, it was JSON key string likely
            # Actually, `siem_node` sends edges as dict. JSON keys are strings.
            # New format: "src|dst|port|process"
            if "|" in edge_key:
                parts = edge_key.split("|")
                if len(parts) >= 2:
                    ip1, ip2 = parts[0], parts[1]
                    node_request_counts[ip1] += count
                    node_request_counts[ip2] += count
            else:
                 # FLIMSY FALLBACK: If it somehow comes as tuple string representation or old format
                 pass
        
        # Analyze each node
        for ip, total_requests in node_request_counts.items():
            # Add to history
            self.request_history[ip].append((current_time, total_requests))
            
            # Remove old entries outside baseline window
            cutoff_time = current_time - (self.baseline_window_minutes * 60)
            self.request_history[ip] = [
                (ts, req) for ts, req in self.request_history[ip]
                if ts >= cutoff_time
            ]
            
            # Calculate baseline (average of historical requests)
            if len(self.request_history[ip]) > 1:
                baseline = sum(req for _, req in self.request_history[ip][:-1]) / (len(self.request_history[ip]) - 1)
                current = total_requests
                
                # Check if current requests exceed threshold
                if baseline > 0:
                    multiplier = current / baseline
                else:
                    # If baseline is 0 but now have requests, treat as anomaly
                    multiplier = float('inf') if current > 0 else 1.0
                
                if multiplier >= self.request_threshold_multiplier:
                    severity = self._calculate_severity(multiplier)
                    
                    anomalies[ip] = {
                        "baseline": baseline,
                        "current": current,
                        "multiplier": round(multiplier, 2),
                        "severity": severity
                    }
                    
                    # Log anomaly
                    self.anomalies.append({
                        "type": "EXCESSIVE_REQUESTS",
                        "timestamp": current_time,
                        "node_ip": ip,
                        "baseline": round(baseline, 2),
                        "current": current,
                        "multiplier": round(multiplier, 2),
                        "severity": severity
                    })

                # --- ML INTEGRATION ---
                # Also check connection pattern with Isolation Forest
                # We analyze the aggregate flow for these two nodes
                # Since we aggregated by node above, we need the original edges to feed the ML model correct pairs
                pass # Logic moved to analyze_topology to access edges directly
        
        return anomalies
    
    def _calculate_severity(self, multiplier: float) -> str:
        """
        Calculate severity level based on how much requests exceed baseline.
        """
        if multiplier >= 10.0:
            return "CRITICAL"
        elif multiplier >= 5.0:
            return "HIGH"
        elif multiplier >= 2.5:
            return "MEDIUM"
        else:
            return "LOW"
    
    # ==============================
    # UNIFIED ANALYSIS
    # ==============================
    
    def analyze_topology(self, topology_data: Dict) -> Dict:
        """
        Complete topology analysis. Call this with data from siem_node.
        
        Args:
            topology_data: {
                "nodes": {ip: {"mac": str, "hostname": str or None}},
                "edges": {(ip, ip): request_count}
            }
        
        Returns:
            {
                "new_nodes": [ip, ...],
                "excessive_requests": {ip: {baseline, current, multiplier, severity}},
                "anomalies_summary": int,
                "timestamp": float
            }
        """
        new_nodes = self.detect_new_nodes(topology_data.get("nodes", {}))
        excessive = self.observe_communication(topology_data.get("edges", {}))
        
        # ML Analysis: Check every connection edge
        ml_anomalies = []
        for edge_str, count in edges.items():
            try:
                # Parse "src|dst|port|process"
                if "|" in edge_str:
                    parts = edge_str.split("|")
                    if len(parts) == 4:
                        ip1, ip2, port, process = parts
                        port = int(port)
                    else:
                        continue # malformed
                else:
                    continue # ignore old format
                
                is_anomalous = self.ml_model.observe_connection(ip1, ip2, port, process, count)
                if is_anomalous:
                    ml_anomalies.append({
                        "src": ip1,
                        "dst": ip2,
                        "port": port,
                        "process": process,
                        "count": count,
                        "reason": "Unusual traffic pattern (Isolation Forest)"
                    })
                    # Log to history
                    self.anomalies.append({
                        "type": "ML_ANOMALY",
                        "timestamp": time.time(),
                        "node_ip": ip1, 
                        "dst_ip": ip2,
                        "port": port,
                        "process": process,
                        "count": count,
                        "severity": "WARNING"
                    })
            except Exception as e:
                print(f"[AI] Error processing edge {edge_str}: {e}")
                continue

        return {
            "new_nodes": new_nodes,
            "excessive_requests": excessive,
            "ml_anomalies": ml_anomalies,
            "anomalies_summary": len(new_nodes) + len(excessive) + len(ml_anomalies),
            "timestamp": time.time()
        }
    
    # ==============================
    # AUDIT & REPORTING
    # ==============================
    
    def get_anomalies(self, limit: int = 100) -> List[dict]:
        """
        Retrieve recent anomalies (audit trail).
        
        Args:
            limit: Maximum number of recent anomalies to return
        
        Returns:
            List of anomaly events, newest first
        """
        return sorted(
            self.anomalies[-limit:],
            key=lambda x: x["timestamp"],
            reverse=True
        )
    
    def clear_anomalies(self):
        """Clear the anomaly history."""
        self.anomalies = []
        
    def save_state(self):
        """Save AI state (model + anomalies)"""
        import pickle
        try:
            state = {
                "anomalies": self.anomalies,
                "known_devices": self.known_devices,
                "request_history": self.request_history
            }
            # Save detector state
            with open(self.state_path, "wb") as f:
                pickle.dump(state, f)
            
            # Save ML model separately (it handles its own persistence)
            if self.ml_model:
                self.ml_model.save_model(self.model_path)
                
            print(f"[AI] State saved successfully")
        except Exception as e:
            print(f"[AI] Failed to save state: {e}")

    def load_state(self):
        """Load AI state"""
        import pickle
        if os.path.exists(self.state_path):
            try:
                with open(self.state_path, "rb") as f:
                    state = pickle.load(f)
                    self.anomalies = state.get("anomalies", [])
                    self.known_devices = state.get("known_devices", {})
                    self.request_history = state.get("request_history", defaultdict(list))
                print(f"[AI] Detector state loaded ({len(self.anomalies)} anomalies)")
            except Exception as e:
                print(f"[AI] Failed to load detector state: {e}")

        # Load ML model
        if self.ml_model:
            self.ml_model.load_model(self.model_path)

    def relearn(self):
        """Force AI to relearn from scratch"""
        self.anomalies = [] # Clear history
        self.known_devices = {} # Clear known devices cache
        self.request_history = defaultdict(list) # Clear baselines
        if self.ml_model:
            self.ml_model.reset_model()
        print("[AI] Anomaly detector reset complete. Entering learning mode.")
    
    def get_known_devices(self) -> Dict[str, dict]:
        """
        Get all known devices and when they were first seen.
        
        Returns:
            {ip: {"first_seen": timestamp, "mac": str, "hostname": str}}
        """
        return dict(self.known_devices)
    
    def get_baseline_stats(self, ip: str) -> Optional[dict]:
        """
        Get baseline statistics for a specific node.
        
        Args:
            ip: Node IP address
        
        Returns:
            {
                "ip": str,
                "avg_requests": float,
                "min_requests": int,
                "max_requests": int,
                "samples": int
            }
            or None if no history
        """
        if ip not in self.request_history or not self.request_history[ip]:
            return None
        
        requests = [req for _, req in self.request_history[ip]]
        
        return {
            "ip": ip,
            "avg_requests": round(sum(requests) / len(requests), 2),
            "min_requests": min(requests),
            "max_requests": max(requests),
            "samples": len(requests)
        }
