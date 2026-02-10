import requests
import time
import json
import random

API_URL = "http://localhost:8000/log"

def send_log(log_data):
    payload = {
        "node_id": "demo-node",
        "event_type": "COMMUNICATION_PATTERN",
        "data": log_data
    }
    try:
        response = requests.post(API_URL, json=payload)
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def run_demo():
    print("🚀 STARTING AI DEMO... 🚀")
    print("--------------------------------")
    
    # Phase 1: Train with Normal Traffic
    print("\n[Phase 1] Teaching AI 'Normal' Traffic (Web Browsing)...")
    for i in range(15):
        # Normal web traffic: Port 80/443, low connection count
        port = random.choice([80, 443])
        count = random.randint(5, 50)
        log = f"Devices 192.168.1.50 and 8.8.8.8 ({count} connections) [Port: {port} | Process: chrome.exe]"
        
        if send_log(log):
            print(f"✓ Sent Normal Log: {count} connections on Port {port}")
        time.sleep(0.1)
        
    print("\n✅ AI trained on normal patterns.")
    print("   (Wait 2 seconds...)")
    time.sleep(2)
    
    # Phase 2: Launch Attack
    print("\n[Phase 2] ⚠️ LAUNCHING ANOMALY ATTACK! ⚠️")
    
    # Anomaly: Massive spike, weird port, weird process
    anomaly_port = 666
    anomaly_count = 50000
    anomaly_proc = "malware.exe"
    
    log = f"Devices 192.168.1.50 and 8.8.8.8 ({anomaly_count} connections) [Port: {anomaly_port} | Process: {anomaly_proc}]"
    
    if send_log(log):
        print(f"🔥 SENT ATTACK: {anomaly_count} CONNECTIONS on Port {anomaly_port} (malware.exe)")
        
    print("\n--------------------------------")
    print("Check your dashboard now! You should see 'Traffic spikes & AI patterns' count increment.")

if __name__ == "__main__":
    run_demo()
