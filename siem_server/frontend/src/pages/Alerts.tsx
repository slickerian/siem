// src/pages/Alerts.tsx
import { useState, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

import { EventTable } from "@/components/siem/EventTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";

import { siemApi, LogsResponse, LogEntry } from "@/services/siemApi";

const isCritical = (eventType: string) => ['ERROR','CRITICAL','FAIL','ACTION_FAILED'].includes(eventType.toUpperCase().trim());

const Alerts = () => {
  // ---------------- States ----------------
  const [nodes, setNodes] = useState<{ node_id: string; online: boolean }[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>(localStorage.getItem('alerts_selectedNode') || "");

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(localStorage.getItem('alerts_searchQuery') || "");

  // Filters
  const [startDate, setStartDate] = useState<string>(localStorage.getItem('alerts_startDate') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // 7 days ago
  const [endDate, setEndDate] = useState<string>(localStorage.getItem('alerts_endDate') || new Date().toISOString().split('T')[0]); // today

  // Persist filters
  useEffect(() => {
    localStorage.setItem('alerts_selectedNode', selectedNode);
  }, [selectedNode]);

  useEffect(() => {
    localStorage.setItem('alerts_searchQuery', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem('alerts_startDate', startDate);
  }, [startDate]);

  useEffect(() => {
    localStorage.setItem('alerts_endDate', endDate);
  }, [endDate]);

  // ---------------- Load Nodes ----------------
  const loadNodes = useCallback(async () => {
    try {
      console.log("[NODES] Refreshing node list and online status");
      const allNodes = await siemApi.getNodes();
      setNodes(allNodes);
      if (!selectedNode && allNodes.length > 0) setSelectedNode(allNodes[0].node_id);
      console.log(`[NODES] Loaded ${allNodes.length} nodes, ${allNodes.filter(n => n.online).length} online`);
    } catch (err) {
      console.error("Failed to load nodes:", err);
    }
  }, [selectedNode]);

  // ---------------- Load Alerts (Critical Logs) ----------------
  const loadAlerts = useCallback(async () => {
    if (!selectedNode) return;

    setIsLoading(true);
    try {
      const apiParams: any = { limit: 1000, node_id: selectedNode };
      if (searchQuery) apiParams.q = searchQuery;
      if (startDate) apiParams.start = new Date(startDate + 'T00:00:00').toISOString();
      if (endDate) apiParams.end = new Date(endDate + 'T23:59:59').toISOString();

      console.log(`[PERF] Fetching logs for Alerts page...`);
      const logsResponse: LogsResponse = await siemApi.getLogs(apiParams);
      console.log(`[PERF] Logs API returned ${logsResponse.items.length} items`);

      // Filter only critical events
      const criticalLogs = logsResponse.items.filter(log => isCritical(log.event_type));
      setLogs(criticalLogs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load alerts";
      console.error(`[ERROR] Alerts load failed: ${msg}`);
      setError(msg);
      toast({
        title: "Error loading alerts",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedNode, searchQuery, startDate, endDate]);

  // ---------------- Effects ----------------
  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Auto-refresh nodes every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadNodes();
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [loadNodes]);

  // WebSocket for live updates
  useEffect(() => {
    console.log(`[WS] Connecting WebSocket for live alerts`);
    const ws = siemApi.connectWebSocket((log) => {
      console.log(`[WS] Received log from ${log.node_id}: ${log.event_type}`);

      // Check if log is critical and matches current filters
      const isCriticalLog = isCritical(log.event_type);
      const matchesNode = log.node_id === selectedNode;
      // Date filtering consistent with API
      const startIso = startDate ? new Date(startDate + 'T00:00:00').toISOString() : null;
      const endIso = endDate ? new Date(endDate + 'T23:59:59').toISOString() : null;
      const matchesDate = (!startIso || log.created_at >= startIso) && (!endIso || log.created_at <= endIso);

      if (isCriticalLog && matchesNode && matchesDate) {
        setLogs(prev => [log, ...prev].slice(0, 1000)); // Add to top, keep up to 1000
      }
    });

    ws.onerror = (error) => {
      console.error(`[WS] WebSocket error:`, error);
    };

    ws.onclose = (event) => {
      console.log(`[WS] WebSocket closed:`, event.code, event.reason);
    };

    return () => {
      console.log(`[WS] Closing WebSocket connection`);
      ws.close();
    };
  }, [selectedNode, startDate, endDate, loadAlerts]);

  // ---------------- Handlers ----------------
  const handleNodeChange = (nodeId: string) => {
    setSelectedNode(nodeId);
  };

  const handleExport = () => {
    const params: any = { node_id: selectedNode };
    if (searchQuery) params.q = searchQuery;
    if (startDate) params.start = startDate;
    if (endDate) params.end = endDate;
    window.open(siemApi.getExportUrl(params), "_blank");
  };

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="text-destructive text-4xl">⚠️</div>
          <h1 className="text-2xl font-bold text-foreground">Connection Error</h1>
          <p className="text-muted-foreground max-w-md">
            Unable to connect to the SIEM server. Please ensure the backend is running.
          </p>
          <button
            onClick={() => { setError(null); loadAlerts(); }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );

  // ---------------- Render ----------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Alerts</h1>
        <Button
          variant="outline"
          onClick={handleExport}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-card">
        <div>
          <Label htmlFor="node">Node</Label>
          <Select value={selectedNode} onValueChange={handleNodeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select node" />
            </SelectTrigger>
            <SelectContent>
              {nodes.map((node) => (
                <SelectItem key={node.node_id} value={node.node_id}>
                  {node.node_id}
                  <span className={`ml-2 inline-block w-2 h-2 rounded-full ${
                    node.online ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="start">Start Date</Label>
          <Input
            type="date"
            id="start"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="end">End Date</Label>
          <Input
            type="date"
            id="end"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      {/* Alerts Table */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Critical Alerts</h3>
        <EventTable
          data={logs}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>
    </div>
  );
};

export default Alerts;