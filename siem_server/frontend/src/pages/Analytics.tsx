// src/pages/Analytics.tsx
import { useState, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

import { StatsCards } from "@/components/siem/StatsCards";
import { EventChart } from "@/components/siem/EventChart";
import { EventTypeChart } from "@/components/siem/EventTypeChart";
import { AnomalyDetection } from "@/components/siem/AnomalyDetection";
import NetworkMap from "@/components/siem/NetworkMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";

import { siemApi, StatsResponse } from "@/services/siemApi";

const Analytics = () => {
  // States
  const [nodes, setNodes] = useState<{ node_id: string; online: boolean }[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>(localStorage.getItem('analytics_selectedNode') || "");

  const [chartData, setChartData] = useState<{ bucket: string; count: number }[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState<string>(localStorage.getItem('analytics_startDate') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // 7 days ago
  const [endDate, setEndDate] = useState<string>(localStorage.getItem('analytics_endDate') || new Date().toISOString().split('T')[0]); // today
  const [bucketMinutes, setBucketMinutes] = useState<number>(parseInt(localStorage.getItem('analytics_bucketMinutes') || '60')); // 1 hour buckets

  // Persist filters
  useEffect(() => {
    localStorage.setItem('analytics_selectedNode', selectedNode);
  }, [selectedNode]);

  useEffect(() => {
    localStorage.setItem('analytics_startDate', startDate);
  }, [startDate]);

  useEffect(() => {
    localStorage.setItem('analytics_endDate', endDate);
  }, [endDate]);

  useEffect(() => {
    localStorage.setItem('analytics_bucketMinutes', bucketMinutes.toString());
  }, [bucketMinutes]);

  // Load Nodes
  const loadNodes = useCallback(async () => {
    try {
      const allNodes = await siemApi.getNodes();
      setNodes(allNodes);
      if (!selectedNode && allNodes.length > 0) setSelectedNode(allNodes[0].node_id);
    } catch (err) {
      console.error("Failed to load nodes:", err);
    }
  }, [selectedNode]);

  // Load Analytics Data
  const loadAnalytics = useCallback(async () => {
    if (!selectedNode) return;

    setIsLoading(true);
    try {
      const params = {
        node_id: selectedNode,
        start: new Date(startDate + 'T00:00:00').toISOString(), // start of day
        end: new Date(endDate + 'T23:59:59').toISOString(), // end of day
        bucket_minutes: bucketMinutes,
      };
      const statsResponse = await siemApi.getStats(params);
      setStats(statsResponse);
      setChartData(statsResponse.timeseries);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load analytics";
      console.error(msg);
      setError(msg);
      toast({
        title: "Error loading analytics",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedNode, startDate, endDate, bucketMinutes]);

  // Effects
  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!selectedNode) return;

    const interval = setInterval(() => {
      loadAnalytics();
      loadNodes();
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [selectedNode, loadAnalytics, loadNodes]);

  // WebSocket for live updates
  useEffect(() => {
    console.log(`[WS] Connecting WebSocket for live analytics`);
    const ws = siemApi.connectWebSocket((log) => {
      console.log(`[WS] Received log from ${log.node_id}: ${log.event_type}`);

      // Check if log matches current filters
      const matchesNode = log.node_id === selectedNode;
      // Date filtering consistent with API
      const startIso = startDate ? new Date(startDate + 'T00:00:00').toISOString() : null;
      const endIso = endDate ? new Date(endDate + 'T23:59:59').toISOString() : null;
      const matchesDate = (!startIso || log.created_at >= startIso) && (!endIso || log.created_at <= endIso);

      if (matchesNode && matchesDate) {
        loadAnalytics(); // Refresh analytics data
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
  }, [selectedNode, startDate, endDate, loadAnalytics]);

  // Handlers
  const handleNodeChange = (nodeId: string) => {
    setSelectedNode(nodeId);
  };

  const handleExport = () => {
    window.open(siemApi.getExportUrl({
      node_id: selectedNode,
      start: startDate,
      end: endDate,
    }), "_blank");
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="text-destructive text-4xl">⚠️</div>
          <h1 className="text-2xl font-bold text-foreground">Error Loading Analytics</h1>
          <p className="text-muted-foreground max-w-md">{error}</p>
          <button
            onClick={() => { setError(null); loadAnalytics(); }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border rounded-lg bg-card">
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
                  <span className={`ml-2 inline-block w-2 h-2 rounded-full ${node.online ? 'bg-green-500' : 'bg-red-500'
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

        <div>
          <Label htmlFor="bucket">Bucket Size</Label>
          <Select value={bucketMinutes.toString()} onValueChange={(v) => setBucketMinutes(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
              <SelectItem value="1440">1 day</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Network Anomalies */}
      <div>
        <h2 className="text-xl font-bold mb-4">🔍 Network Anomalies</h2>
        <AnomalyDetection />
      </div>

      {/* Charts */}
      {stats && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EventChart data={chartData} />
            <EventTypeChart data={stats.histogram || []} />
          </div>


          {/* Network Graph */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm mb-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              Network Map
            </h2>
            <NetworkMap selectedNode={selectedNode} />
          </div>

          {/* Additional Analytics */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Event Distribution</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.histogram.map((item) => (
                <div key={item.event_type} className="p-4 border rounded-lg bg-card">
                  <div className="text-sm font-medium">{item.event_type}</div>
                  <div className="text-2xl font-bold">{item.count}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;