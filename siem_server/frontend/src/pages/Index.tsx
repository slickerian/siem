// src/pages/Index.tsx
import { useState, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

console.log("Index.tsx loaded - monitoring for performance issues");

import { Header } from "@/components/siem/Header";
import { StatsCards } from "@/components/siem/StatsCards";
import { EventChart } from "@/components/siem/EventChart";
import { EventTypeChart } from "@/components/siem/EventTypeChart";
import { EventTable } from "@/components/siem/EventTable";
import { DropdownMenu } from "@/components/siem/DropdownMenu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

import { siemApi, StatsResponse, LogsResponse, LogEntry } from "@/services/siemApi";

const Index = () => {
  // ---------------- States ----------------
  const [nodes, setNodes] = useState<{ node_id: string; online: boolean }[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [showNodeMenu, setShowNodeMenu] = useState<boolean>(false);

  const [chartData, setChartData] = useState<{ bucket: string; count: number }[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [lastChartUpdate, setLastChartUpdate] = useState<Date | null>(null);

  // Function to refresh charts data
  const refreshCharts = useCallback(async () => {
    if (!selectedNode) return;

    try {
      console.log(`[CHART] Refreshing chart data for node ${selectedNode}`);
      const chartStart = performance.now();

      const newStatsResponse = await siemApi.getStats({ node_id: selectedNode });
      setStats(newStatsResponse);
      setChartData(newStatsResponse.timeseries);
      setLastChartUpdate(new Date());

      const chartTime = performance.now() - chartStart;
      console.log(`[CHART] Chart refresh completed in ${chartTime.toFixed(2)}ms`);
    } catch (error) {
      console.error(`[CHART] Failed to refresh charts:`, error);
    }
  }, [selectedNode]);
  const [liveStats, setLiveStats] = useState({
    total: 0,
    critical: 0,
    last24h: 0,
    avgPerHour: 0,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  // ---------------- Load Logs & Stats ----------------
   const loadData = useCallback(async () => {
     if (!selectedNode) return;

     const startTime = performance.now();
     console.log(`[PERF] Starting data load for node ${selectedNode}`);

     try {
       setIsLoading(true);
       setError(null);

       const apiParams: any = { limit: 1000, node_id: selectedNode };
       if (searchQuery) apiParams.q = searchQuery;

       console.log(`[PERF] Fetching stats...`);
       const statsStart = performance.now();
       const statsResponse = await siemApi.getStats(apiParams);
       const statsTime = performance.now() - statsStart;
       console.log(`[PERF] Stats API took ${statsTime.toFixed(2)}ms`);

       console.log(`[PERF] Fetching logs...`);
       const logsStart = performance.now();
       const logsResponse: LogsResponse = await siemApi.getLogs(apiParams);
       const logsTime = performance.now() - logsStart;
       console.log(`[PERF] Logs API took ${logsTime.toFixed(2)}ms, returned ${logsResponse.items.length} items`);

       setStats(statsResponse);
       setLiveStats({
         total: logsResponse.total,
         critical: logsResponse.critical,
         last24h: logsResponse.last24h,
         avgPerHour: logsResponse.avgPerHour,
       });

       setChartData(statsResponse.timeseries);
       setLogs(logsResponse.items);

       const totalTime = performance.now() - startTime;
       console.log(`[PERF] Total data load completed in ${totalTime.toFixed(2)}ms`);
     } catch (err) {
       const msg = err instanceof Error ? err.message : "Failed to load data";
       console.error(`[ERROR] Data load failed: ${msg}`);
       setError(msg);
       toast({
         title: "Error loading data",
         description: msg,
         variant: "destructive",
       });
     } finally {
       setIsLoading(false);
     }
   }, [selectedNode, searchQuery]);

  // ---------------- Effects ----------------
  // Initial load
  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh charts and nodes periodically (every 30 seconds) for live updates
  useEffect(() => {
    if (!selectedNode) return;

    const interval = setInterval(() => {
      refreshCharts();
      loadNodes();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [selectedNode, refreshCharts, loadNodes]);

  // WebSocket for live logs
  useEffect(() => {
    if (!selectedNode) {
      console.log(`[WS] No selected node, skipping WebSocket connection`);
      return;
    }

    console.log(`[WS] Connecting WebSocket for node ${selectedNode}`);
    const ws = siemApi.connectWebSocket((log: LogEntry & {
      total: number;
      critical: number;
      last24h: number;
      avgPerHour: number;
    }) => {
       console.log(`[WS] Received log from ${log.node_id}: ${log.event_type}`);
       if (log.node_id !== selectedNode) {
         console.log(`[WS] Ignoring log from different node: ${log.node_id} vs ${selectedNode}`);
         return; // filter by node
       }

       // Update logs - add new log to the beginning
       setLogs((prev) => {
         const newLogs = [log, ...prev];
         // Keep only the most recent 1000 logs to prevent memory issues
         return newLogs.slice(0, 1000);
       });

       // Update live stats from WebSocket data
       setLiveStats({
         total: log.total,
         critical: log.critical,
         last24h: log.last24h,
         avgPerHour: log.avgPerHour,
       });

       // Refresh chart data to show live updates
       refreshCharts();

       // Refresh node list to update online status badges
       loadNodes();

       console.log(`[WS] Live update: total=${log.total}, charts and nodes refreshed`);
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
   }, [selectedNode, loadData, loadNodes]);

  // ---------------- Handlers ----------------
  const handleNodeChange = (nodeId: string) => {
    setSelectedNode(nodeId);
  };

  const handleExport = () => {
    window.open(siemApi.getExportUrl({ node_id: selectedNode }), "_blank");
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
            onClick={loadData}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );

  // ---------------- Render ----------------
  return (
    <div className="min-h-screen bg-background">
      <Header
        onExport={handleExport}
        isConnected={true}
        totalEvents={liveStats.total}
        nodes={nodes}
        selectedNode={selectedNode}
        onNodeChange={handleNodeChange}
        showNodeMenu={showNodeMenu}
        setShowNodeMenu={setShowNodeMenu}
      />
      <main className="container mx-auto px-6 py-6 space-y-6">

        {/* Stats */}
        <StatsCards stats={liveStats} />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EventChart data={chartData} />
          <EventTypeChart data={stats?.histogram || []} />
        </div>


        {/* Raw Logs Table */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Raw Logs</h2>
          <EventTable
            data={logs.filter(
              (log) =>
                log.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                log.data.toLowerCase().includes(searchQuery.toLowerCase())
            )}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>
      </main>
    </div>
  );
};

export default Index;
