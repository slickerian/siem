import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network/standalone';
import { LogEntry, siemApi } from '@/services/siemApi';
import { toast } from '@/hooks/use-toast';

interface Device {
  ip: string;
  mac: string;
  hostname: string | null;
}

interface Edge {
  from: string;
  to: string;
  count: number;
}

interface NetworkData {
  nodes: Device[];
  edges: Edge[];
}

interface NetworkTopologyProps {
  selectedNode: string;
}

const NetworkTopology: React.FC<NetworkTopologyProps> = ({ selectedNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [networkData, setNetworkData] = useState<NetworkData>({ nodes: [], edges: [] });
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  useEffect(() => {
    if (!selectedNode) return;

    const fetchNetworkData = async () => {
      try {
        // Fetch logs for device discovered and communication patterns
        const logs = await siemApi.getLogs({
          node_id: selectedNode,
          event_type: 'DEVICE_DISCOVERED',
          limit: 1000,
        });

        const patternLogs = await siemApi.getLogs({
          node_id: selectedNode,
          event_type: 'COMMUNICATION_PATTERN',
          limit: 1000,
        });

        const allLogs = [...logs.items, ...patternLogs.items];

        const devices: { [ip: string]: Device } = {};
        const edges: Edge[] = [];

        allLogs.forEach((log: LogEntry) => {
          if (log.event_type === 'DEVICE_DISCOVERED') {
            // Parse data like "IP: 192.168.1.1, MAC: aa:bb:cc:dd:ee:ff, Hostname: device1"
            const match = log.data.match(/IP:\s*([^,]+),\s*MAC:\s*([^,]+),\s*Hostname:\s*(.*)/);
            if (match) {
              const ip = match[1].trim();
              const mac = match[2].trim();
              let hostname = match[3].trim();

              // Handle Python "None" string or empty
              if (hostname === "None" || hostname === "") {
                hostname = null;
              }

              devices[ip] = { ip, mac, hostname };
            }
          } else if (log.event_type === 'COMMUNICATION_PATTERN') {
            // Robust parsing: Just look for "Devices X and Y" at the start
            // We can optionally parse the rest, but the core requirement is the link.
            const matchSimple = log.data.match(/Devices\s+([^\s]+)\s+and\s+([^\s]+)/);

            if (matchSimple) {
              const from = matchSimple[1];
              const to = matchSimple[2];

              // Try to extract count if available, otherwise default to 1
              const countMatch = log.data.match(/\((\d+)\s+connections\)/);
              const count = countMatch ? parseInt(countMatch[1]) : 1;

              // Check existing edge
              const existingEdge = edges.find(e => (e.from === from && e.to === to) || (e.from === to && e.to === from));
              if (existingEdge) {
                existingEdge.count += count;
              } else {
                edges.push({ from, to, count });
              }
            }
          }
        });

        setNetworkData({ nodes: Object.values(devices), edges });
      } catch (error) {
        console.error('Failed to fetch network data:', error);
        toast({
          title: 'Error loading network topology',
          description: 'Failed to fetch network discovery data.',
          variant: 'destructive',
        });
      }
    };

    fetchNetworkData();
  }, [selectedNode]);

  useEffect(() => {
    if (!containerRef.current || networkData.nodes.length === 0) return;

    // Prepare nodes for vis-network
    const nodes = networkData.nodes.map((device, index) => ({
      id: device.ip,
      label: device.hostname || device.ip,
      title: `IP: ${device.ip}<br>MAC: ${device.mac}<br>Hostname: ${device.hostname || 'N/A'}`,
      shape: 'circle',
      color: '#4CAF50',
    }));

    // Prepare edges
    const edges = networkData.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      label: `${edge.count}`,
      width: Math.min(edge.count, 5),
      arrows: 'to',
    }));

    const data = { nodes, edges };
    const options = {
      nodes: {
        font: {
          size: 14,
          face: 'Inter',
        },
        borderWidth: 2,
        shadow: true,
      },
      edges: {
        width: 2,
        color: { color: '#64748b', highlight: '#3b82f6' },
        arrows: 'to',
        smooth: {
          enabled: true,
          type: 'continuous',
          roundness: 0.4,
        },
      },
      physics: {
        enabled: true,
        barnesHut: {
          gravitationalConstant: -2000,
          springConstant: 0.04,
          springLength: 200,
        },
        stabilization: {
          iterations: 200,
        },
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        selectConnectedEdges: false,
      },
    };

    // Create network
    networkRef.current = new Network(containerRef.current, data, options);

    // Handle node selection
    networkRef.current.on('selectNode', (params) => {
      const selectedNodeId = params.nodes[0];
      const device = networkData.nodes.find(d => d.ip === selectedNodeId);
      setSelectedDevice(device || null);
    });

    // Handle deselect
    networkRef.current.on('deselectNode', () => {
      setSelectedDevice(null);
    });

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [networkData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Network Topology</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 bg-card">
          <div ref={containerRef} style={{ height: '400px' }} />
        </div>
        <div className="border rounded-lg p-4 bg-card">
          {selectedDevice ? (
            <div className="space-y-2">
              <h4 className="text-md font-medium">Device Details</h4>
              <div className="space-y-1">
                <p><strong>IP:</strong> {selectedDevice.ip}</p>
                <p><strong>MAC:</strong> {selectedDevice.mac}</p>
                <p><strong>Hostname:</strong> {selectedDevice.hostname || 'N/A'}</p>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">Click on a node to see details</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NetworkTopology;