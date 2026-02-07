"""
FastAPI endpoints for network anomaly detection.

Add these endpoints to your siem_server.py to expose anomaly detection API.
"""

from fastapi import FastAPI, Query
from typing import Optional
from pydantic import BaseModel


# Models for request/response
class TopologyInput(BaseModel):
    """Input model for topology analysis endpoint."""
    nodes: dict  # {ip: {"mac": str, "hostname": str or None}}
    edges: dict  # {tuple: int} or nested dict format


class AnomalyResponse(BaseModel):
    """Response model for anomaly detection."""
    new_nodes: list
    excessive_requests: dict
    anomalies_summary: int
    timestamp: float


def register_network_anomaly_routes(app: FastAPI):
    """
    Register network anomaly detection routes on the FastAPI app.
    
    Call this in siem_server.py:
        from ai.endpoints import register_network_anomaly_routes
        register_network_anomaly_routes(app)
    
    This adds the following endpoints:
    - POST /api/anomalies/topology - Process topology data
    - GET /api/anomalies/report - Get anomaly report
    - GET /api/anomalies/devices - Get known devices
    - GET /api/anomalies/baseline/{ip} - Get baseline for a node
    """
    from ai import get_detector
    
    # ========== POST: Process Topology Data ==========
    @app.post("/api/anomalies/topology", response_model=AnomalyResponse)
    async def analyze_topology(data: TopologyInput):
        """
        Analyze network topology for anomalies.
        
        **Request body:**
        ```json
        {
            "nodes": {
                "192.168.1.10": {"mac": "00:11:22:33:44:55", "hostname": "pc-1"},
                "192.168.1.20": {"mac": "aa:bb:cc:dd:ee:ff", "hostname": "router"}
            },
            "edges": {
                "192.168.1.10,192.168.1.20": 150,
                "192.168.1.20,8.8.8.8": 2000
            }
        }
        ```
        
        **Response:**
        - `new_nodes`: List of IPs appearing for first time
        - `excessive_requests`: Map of IPs with spike detection
        - `anomalies_summary`: Count of detected anomalies
        """
        detector = get_detector()
        
        # Convert edges format if needed (handle tuple keys from dict)
        edges = {}
        for key, value in data.edges.items():
            if isinstance(key, str):
                # Handle string tuple format "ip1,ip2" -> convert to proper tuple
                parts = key.split(",")
                if len(parts) == 2:
                    edges[tuple(parts)] = value
            else:
                edges[key] = value
        
        topology = {
            "nodes": data.nodes,
            "edges": edges
        }
        
        result = detector.analyze_topology(topology)
        return AnomalyResponse(**result)
    
    # ========== GET: Anomaly Report ==========
    @app.get("/api/anomalies/report")
    def get_anomalies_report(limit: int = Query(100, ge=1, le=10000)):
        """
        Get recent anomaly events (audit trail).
        
        **Parameters:**
        - `limit`: Max number of anomalies to return (default: 100)
        
        **Response:**
        ```json
        [
            {
                "type": "NEW_NODE",
                "timestamp": 1707168000.5,
                "node_ip": "192.168.1.50",
                "mac": "11:22:33:44:55:66",
                "hostname": "new-device",
                "severity": "MEDIUM"
            },
            {
                "type": "EXCESSIVE_REQUESTS",
                "timestamp": 1707168100.2,
                "node_ip": "192.168.1.20",
                "baseline": 150.5,
                "current": 500,
                "multiplier": 3.32,
                "severity": "HIGH"
            }
        ]
        ```
        """
        detector = get_detector()
        return detector.get_anomalies(limit=limit)
    
    # ========== GET: Known Devices ==========
    @app.get("/api/anomalies/devices")
    def get_known_devices():
        """
        Get all known devices in the network.
        
        **Response:**
        ```json
        {
            "192.168.1.10": {
                "first_seen": 1707167000.0,
                "mac": "00:11:22:33:44:55",
                "hostname": "pc-1"
            },
            "192.168.1.20": {
                "first_seen": 1707166000.0,
                "mac": "aa:bb:cc:dd:ee:ff",
                "hostname": "router"
            }
        }
        ```
        """
        detector = get_detector()
        return detector.get_known_devices()
    
    # ========== GET: Baseline Stats for a Node ==========
    @app.get("/api/anomalies/baseline/{ip}")
    def get_node_baseline(ip: str):
        """
        Get baseline statistics for a specific node.
        
        **Parameters:**
        - `ip`: Node IP address (e.g., 192.168.1.10)
        
        **Response:**
        ```json
        {
            "ip": "192.168.1.10",
            "avg_requests": 145.67,
            "min_requests": 100,
            "max_requests": 200,
            "samples": 15
        }
        ```
        
        Returns `null` if node has no history.
        """
        detector = get_detector()
        return detector.get_baseline_stats(ip)
    
    # ========== POST: Clear Anomalies (Admin) ==========
    @app.post("/api/anomalies/clear")
    def clear_anomalies():
        """
        Clear the anomaly audit trail (for testing/admin).
        
        **Response:**
        ```json
        {"status": "cleared"}
        ```
        """
        detector = get_detector()
        detector.clear_anomalies()
        return {"status": "cleared"}
