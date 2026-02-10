
import React, { useEffect, useCallback, useState } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    Position,
    BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { LogEntry, siemApi } from '@/services/siemApi';
import { toast } from '@/hooks/use-toast';
import CustomNode from './CustomNode';
import { Loader2 } from 'lucide-react';

const nodeTypes = {
    custom: CustomNode,
};

// Layout Graph using Dagre
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const isHorizontal = direction === 'LR';
    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        // Width/Height approximation for layout
        dagreGraph.setNode(node.id, { width: 180, height: 150 });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            targetPosition: isHorizontal ? Position.Left : Position.Top,
            sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
            // Shift position so dagre center corresponds to react-flow top-left
            position: {
                x: nodeWithPosition.x - 90,
                y: nodeWithPosition.y - 75,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

interface NetworkMapProps {
    selectedNode: string;
}

const NetworkMap: React.FC<NetworkMapProps> = ({ selectedNode }) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    );

    useEffect(() => {
        if (!selectedNode) return;

        const fetchNetworkData = async () => {
            if (nodes.length === 0) setIsLoading(true); // Only show loader on first load
            try {
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

                // Fetch Anomalies to identify ROGUE DEVICES
                const anomalies = await siemApi.getAnomalies(50);
                const rogueIps = new Set(
                    anomalies
                        .filter((a: any) => a.type === 'ROGUE_DEVICE')
                        .map((a: any) => a.node_id || a.node_ip)
                );

                // 1. Process Nodes
                const deviceMap: Record<string, any> = {};

                // Always add the current selected node as "Gateway" or "Self"
                // (If it discovers itself in the logs, we update it)

                allLogs.forEach((log: LogEntry) => {
                    if (log.event_type === 'DEVICE_DISCOVERED') {
                        const match = log.data.match(/IP:\s*([^,]+),\s*MAC:\s*([^,]+),\s*Hostname:\s*(.*)/);
                        if (match) {
                            const ip = match[1].trim();
                            const mac = match[2].trim();
                            let hostname = match[3].trim();
                            if (hostname === 'None' || hostname === '') hostname = ip;

                            let type = 'device';
                            if (ip.endsWith('.1') || ip.endsWith('.254')) type = 'gateway';
                            if (hostname.includes('External')) type = 'external';

                            if (ip.endsWith('.1') || ip.endsWith('.254')) type = 'gateway';
                            if (hostname.includes('External')) type = 'external';

                            deviceMap[ip] = {
                                ip,
                                mac,
                                hostname,
                                type,
                                isRogue: rogueIps.has(ip)
                            };
                        }
                    }
                });

                // 2. Process Edges
                const edgesList: Edge[] = [];
                const edgesSet = new Set<string>();

                allLogs.forEach((log: LogEntry) => {
                    if (log.event_type === 'COMMUNICATION_PATTERN') {
                        // Robust Regex
                        const matchSimple = log.data.match(/Devices\s+([^\s]+)\s+and\s+([^\s]+)/);
                        if (matchSimple) {
                            const from = matchSimple[1];
                            const to = matchSimple[2];

                            // Ensure both nodes exist (add simplified nodes if missing)
                            if (!deviceMap[from]) deviceMap[from] = { ip: from, mac: "Unknown", hostname: from, type: 'external', isRogue: rogueIps.has(from) };
                            if (!deviceMap[to]) deviceMap[to] = { ip: to, mac: "Unknown", hostname: to, type: 'external', isRogue: rogueIps.has(to) };

                            const edgeId = `e-${from}-${to}`;
                            if (!edgesSet.has(edgeId)) {
                                edgesList.push({
                                    id: edgeId,
                                    source: from,
                                    target: to,
                                    animated: true,
                                    style: { stroke: '#64748b', strokeWidth: 2 },
                                });
                                edgesSet.add(edgeId);
                            }
                        }
                    }
                });

                // 3. Infrastructure Edges (Star Topology)
                // Connect all recognized devices to the Gateway if a gateway exists
                const gateway = Object.values(deviceMap).find((d: any) => d.type === 'gateway');
                if (gateway) {
                    Object.values(deviceMap).forEach((dev: any) => {
                        if (dev.ip !== gateway.ip && dev.type === 'device') {
                            const edgeId = `infra-${gateway.ip}-${dev.ip}`;
                            // Only add if no direct traffic edge exists (to avoid duplicate lines)
                            const trafficEdgeExists = edgesSet.has(`e-${gateway.ip}-${dev.ip}`) || edgesSet.has(`e-${dev.ip}-${gateway.ip}`);

                            if (!trafficEdgeExists) {
                                edgesList.push({
                                    id: edgeId,
                                    source: gateway.ip,
                                    target: dev.ip,
                                    animated: false, // Static line for infrastructure
                                    style: { stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '5,5' },
                                    type: 'default',
                                });
                            }
                        }
                    });
                }

                // Convert to React Flow format
                const initialNodes: Node[] = Object.values(deviceMap).map((dev: any) => ({
                    id: dev.ip,
                    type: 'custom',
                    data: {
                        label: dev.hostname,
                        ip: dev.ip,
                        mac: dev.mac,
                        type: dev.type,
                        isRogue: dev.isRogue,
                    },
                    position: { x: 0, y: 0 }, // Layout will fix this
                }));

                const layouted = getLayoutedElements(initialNodes, edgesList);
                setNodes(layouted.nodes);
                setEdges(layouted.edges);

            } catch (error) {
                console.error("Failed to load map", error);
                toast({ title: "Failed to load network map", variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };

        fetchNetworkData();
    }, [selectedNode, setNodes, setEdges, refreshTrigger]);

    // Auto-refresh map every 5 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setRefreshTrigger((prev) => prev + 1);
        }, 5000);
        return () => clearInterval(interval);
    }, []);


    if (isLoading) {
        return <div className="h-[500px] flex items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin" /> Loading Network Map...
        </div>
    }

    return (
        <div style={{ height: 600 }} className="border rounded-xl shadow-inner bg-slate-50 dark:bg-slate-950/20">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
            >
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                <Controls />
                <MiniMap nodeStrokeColor='#000' nodeColor='#ccc' />
            </ReactFlow>
        </div>
    );
};

export default NetworkMap;
