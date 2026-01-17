# siem_node/core/network_discovery.py
import socket
import psutil
from dns import resolver
from scapy.all import ARP, Ether, srp, conf

def resolve_hostname(ip):
    """Resolve hostname for an IP using socket or DNS resolver."""
    try:
        hostname = socket.gethostbyaddr(ip)[0]
        return hostname
    except socket.herror:
        try:
            # Reverse DNS lookup
            query = resolver.query(ip, 'PTR')
            hostname = query[0].to_text()[:-1]  # Remove trailing dot
            return hostname
        except Exception:
            return None

def detect_communication_patterns(devices, logger):
    """Detect basic communication patterns using psutil."""
    try:
        connections = psutil.net_connections()
        edges = {}
        for conn in connections:
            if conn.raddr and conn.laddr:
                local_ip = conn.laddr.ip
                remote_ip = conn.raddr.ip
                # Only consider connections within discovered devices
                if local_ip in devices and remote_ip in devices:
                    pair = tuple(sorted([local_ip, remote_ip]))
                    edges[pair] = edges.get(pair, 0) + 1
        return edges
    except Exception as e:
        logger.log("NETWORK_DISCOVERY_ERROR", f"Failed to detect communication patterns: {e}")
        return {}

def get_local_subnet():
    """Get the local subnet in CIDR notation, assuming /24."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        # Assume /24 subnet
        subnet_base = '.'.join(local_ip.split('.')[:-1]) + '.0/24'
        return subnet_base
    except Exception as e:
        logger.log("NETWORK_DISCOVERY_ERROR", f"Failed to get local subnet: {e}")
        return None

def discover_devices(logger):
    """Perform ARP scan on local subnet to discover devices and their communication patterns."""
    subnet = get_local_subnet()
    if not subnet:
        return {'nodes': {}, 'edges': {}}

    arp_request = ARP(pdst=subnet)
    broadcast = Ether(dst="ff:ff:ff:ff:ff:ff")
    packet = broadcast / arp_request

    try:
        answered, unanswered = srp(packet, timeout=2, verbose=0)
    except Exception as e:
        logger.log("NETWORK_DISCOVERY_ERROR", f"ARP scan failed: {e}")
        return {'nodes': {}, 'edges': {}}

    devices = {}
    for sent, received in answered:
        ip = received.psrc
        mac = received.hwsrc
        hostname = resolve_hostname(ip)

        devices[ip] = {
            'mac': mac,
            'hostname': hostname
        }

        # Log the discovery
        logger.log("DEVICE_DISCOVERED", f"IP: {ip}, MAC: {mac}, Hostname: {hostname}")

    # Detect communication patterns
    edges = detect_communication_patterns(devices, logger)

    # Log patterns
    for pair, count in edges.items():
        logger.log("COMMUNICATION_PATTERN", f"Devices {pair[0]} and {pair[1]} have {count} active connections")

    # Return graph structure
    return {'nodes': devices, 'edges': edges}

# Function to be called periodically
def perform_network_discovery(logger):
    """Entry point for periodic network discovery."""
    return discover_devices(logger)