// src/pages/Dashboard.tsx
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

import { StatsCards } from "@/components/siem/StatsCards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, BarChart3, AlertTriangle, Settings } from "lucide-react";

import { siemApi, LogsResponse } from "@/services/siemApi";

const isCritical = (eventType: string) => ['ERROR','CRITICAL','FAIL','ACTION_FAILED'].includes(eventType.toUpperCase().trim());

const Dashboard = () => {
  // ---------------- States ----------------
  const [nodes, setNodes] = useState<{ node_id: string; online: boolean }[]>([]);

  const [globalStats, setGlobalStats] = useState({
    totalNodes: 0,
    onlineNodes: 0,
    totalEvents: 0,
    criticalEvents: 0,
    last24h: 0,
    avgPerHour: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------- Load Nodes ----------------
  const loadNodes = useCallback(async () => {
    try {
      console.log("[NODES] Refreshing node list and online status");
      const allNodes = await siemApi.getNodes();
      setNodes(allNodes);
      console.log(`[NODES] Loaded ${allNodes.length} nodes, ${allNodes.filter(n => n.online).length} online`);
    } catch (err) {
      console.error("Failed to load nodes:", err);
    }
  }, []);

  // ---------------- Load Global Stats ----------------
  const loadGlobalStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log(`[PERF] Fetching global logs stats...`);
      const logsResponse: LogsResponse = await siemApi.getLogs({ limit: 1 }); // Get global totals

      const onlineNodes = nodes.filter(n => n.online).length;
      setGlobalStats({
        totalNodes: nodes.length,
        onlineNodes,
        totalEvents: logsResponse.total,
        criticalEvents: logsResponse.critical,
        last24h: logsResponse.last24h,
        avgPerHour: logsResponse.avgPerHour,
      });

      console.log(`[PERF] Global stats loaded`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load global stats";
      console.error(`[ERROR] Global stats load failed: ${msg}`);
      setError(msg);
      toast({
        title: "Error loading data",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [nodes]);

  // ---------------- Effects ----------------
  // Initial load
  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  useEffect(() => {
    if (nodes.length > 0) {
      loadGlobalStats();
    }
  }, [loadGlobalStats, nodes]);

  // Refresh nodes and stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      loadNodes();
      loadGlobalStats();
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [loadNodes, loadGlobalStats]);

  // WebSocket for live global updates
  useEffect(() => {
    console.log(`[WS] Connecting WebSocket for global updates`);
    const ws = siemApi.connectWebSocket((log) => {
      console.log(`[WS] Received log from ${log.node_id}: ${log.event_type}`);
      // Update global stats
      setGlobalStats(prev => ({
        ...prev,
        totalEvents: prev.totalEvents + 1,
        criticalEvents: prev.criticalEvents + (isCritical(log.event_type) ? 1 : 0),
      }));
      // Refresh nodes
      loadNodes();
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
  }, [loadNodes]);

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
            onClick={() => { setError(null); loadGlobalStats(); }}
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
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {/* Global Stats */}
      <StatsCards stats={{
        total: globalStats.totalEvents,
        critical: globalStats.criticalEvents,
        last24h: globalStats.last24h,
        avgPerHour: globalStats.avgPerHour,
      }} />

      {/* Node Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Node Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-lg font-bold">{globalStats.totalNodes}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">{globalStats.onlineNodes}</div>
                <div className="text-xs text-muted-foreground">Online</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-600">{globalStats.totalNodes - globalStats.onlineNodes}</div>
                <div className="text-xs text-muted-foreground">Offline</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-orange-600">{globalStats.criticalEvents}</div>
                <div className="text-xs text-muted-foreground">Alerts</div>
              </div>
            </div>
            <div className="w-48 h-12 overflow-hidden border rounded-md">
              <div className="flex gap-2 p-2 overflow-x-auto scrollbar-hide">
                {nodes.map((node) => (
                  <span
                    key={node.node_id}
                    className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                      node.online ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {node.node_id}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              View detailed charts and trends for security events.
            </p>
            <Button asChild className="w-full">
              <Link to="/analytics">Go to Analytics</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Browse and search through all security events.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/events">Go to Events</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Monitor critical alerts and security threats.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/alerts">Go to Alerts</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Settings Quick Access */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            System Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Configure SIEM settings and node management.
          </p>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/settings">Go to Settings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;