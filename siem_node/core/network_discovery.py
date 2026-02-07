# siem_node/core/network_discovery.py

import socket
import psutil
import ipaddress
from dns import resolver
from scapy.all import ARP, Ether, srp


# -----------------------------
# Hostname Resolution
# -----------------------------

def resolve_hostname(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        try:
            query = resolver.resolve_address(ip)
            return query[0].to_text().rstrip(".")
        except Exception:
            return None


# -----------------------------
# Network Interface Discovery
# -----------------------------

def get_local_networks():
    """
    Discover all IPv4 networks on this host based on interfaces.
    Returns a list of ipaddress.IPv4Network
    """
    networks = []

    for iface, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family == socket.AF_INET and addr.netmask:
                try:
                    network = ipaddress.IPv4Network(
                        f"{addr.address}/{addr.netmask}",
                        strict=False
                    )
                    networks.append(network)
                except Exception:
                    continue

    return list(set(networks))


# -----------------------------
# ARP Discovery
# -----------------------------

def arp_scan(network, logger):
    """
    Perform ARP scan on a given IPv4Network
    """
    devices = {}

    packet = Ether(dst="ff:ff:ff:ff:ff:ff") / ARP(pdst=str(network))

    try:
        answered, _ = srp(packet, timeout=2, verbose=0)
    except Exception as e:
        logger.log("NETWORK_DISCOVERY_ERROR", f"ARP scan failed on {network}: {e}")
        return devices

    for _, received in answered:
        ip = received.psrc
        mac = received.hwsrc

        devices[ip] = {
            "mac": mac,
            "hostname": resolve_hostname(ip)
        }

    return devices


# -----------------------------
# Communication Pattern Detection
# -----------------------------

def detect_communication_patterns(devices, logger):
    """
    Detect communication *involving this host*.
    Edges represent observed local participation, not full network traffic.
    """
    edges = {}

    try:
        connections = psutil.net_connections(kind="inet")
    except Exception as e:
        logger.log("NETWORK_DISCOVERY_ERROR", f"psutil failure: {e}")
        return edges

    for conn in connections:
        if not conn.laddr or not conn.raddr:
            continue

        local_ip = conn.laddr.ip
        remote_ip = conn.raddr.ip
        remote_port = conn.raddr.port
        
        # Get process name
        try:
            process = psutil.Process(conn.pid).name() if conn.pid else "unknown"
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            process = "unknown"

        if local_ip in devices and remote_ip in devices:
            # Key: (Source, Dest, Port, Process)
            # Use tuple for immutable dict key
            edge_key = (local_ip, remote_ip, remote_port, process)
            edges[edge_key] = edges.get(edge_key, 0) + 1

    return edges


# -----------------------------
# Main Discovery Logic
# -----------------------------

def discover_devices(logger):
    """
    Discover network devices and basic communication edges.
    Output format intentionally unchanged for frontend compatibility.
    """
    all_devices = {}
    all_edges = {}

    networks = get_local_networks()

    for network in networks:
        discovered = arp_scan(network, logger)

        for ip, meta in discovered.items():
            if ip not in all_devices:
                all_devices[ip] = meta
                logger.log(
                    "DEVICE_DISCOVERED",
                    f"IP: {ip}, MAC: {meta['mac']}, Hostname: {meta['hostname']}"
                )

    # Communication patterns (local host perspective)
    edges = detect_communication_patterns(all_devices, logger)

    for (src, dst, port, process), count in edges.items():
        logger.log(
            "COMMUNICATION_PATTERN",
            f"Devices {src} and {dst} communicate on port {port} via {process} ({count} connections)"
        )
        # Flatten key for JSON serialization if needed, or keep as tuple structure that backend parses
        # But wait, JSON keys must be strings.
        # Let's standardize the key format: "src|dst|port|process"
        key = f"{src}|{dst}|{port}|{process}"
        all_edges[key] = count

    return {
        "nodes": all_devices,
        "edges": all_edges
    }


# -----------------------------
# Periodic Entry Point
# -----------------------------

def perform_network_discovery(logger):
    return discover_devices(logger)
