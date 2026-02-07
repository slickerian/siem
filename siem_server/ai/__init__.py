"""
Network Anomaly Detection Integration for SIEM Server

Integrates NetworkAnomalyDetector with FastAPI siem_server.
Processes network topology data and exposes anomaly endpoints.
"""

from .network_anomaly import NetworkAnomalyDetector


# Global detector instance (singleton)
_detector: NetworkAnomalyDetector = None


def init_network_anomaly_detector(request_threshold_multiplier: float = 2.5,
                                   baseline_window_minutes: int = 30) -> NetworkAnomalyDetector:
    """
    Initialize the global network anomaly detector.
    
    Call this once at siem_server startup.
    
    Args:
        request_threshold_multiplier: Alert when node requests > baseline * multiplier
        baseline_window_minutes: Time window for calculating average baseline
    
    Returns:
        The initialized detector instance
    """
    global _detector
    _detector = NetworkAnomalyDetector(
        request_threshold_multiplier=request_threshold_multiplier,
        baseline_window_minutes=baseline_window_minutes
    )
    return _detector


def get_detector() -> NetworkAnomalyDetector:
    """
    Get the global detector instance.
    Raises ValueError if not initialized.
    """
    if _detector is None:
        raise ValueError("Network anomaly detector not initialized. Call init_network_anomaly_detector() first.")
    return _detector


def process_topology(topology_data: dict) -> dict:
    """
    Process network topology data and detect anomalies.
    
    This is the main entry point for processing data from siem_node.
    
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
    detector = get_detector()
    return detector.analyze_topology(topology_data)
