// src/components/siem/AnomalyDetection.tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Anomaly {
  type: string;
  timestamp: number;
  node_ip: string;
  hostname?: string;
  mac?: string;
  baseline?: number;
  current?: number;
  multiplier?: number;
  severity: string;
  // ML fields
  port?: number;
  process?: string;
  dst_ip?: string;
}

interface AnomalyStats {
  total: number;
  new_nodes: number;
  excessive_requests: number;
}

export const AnomalyDetection = () => {
  const { toast } = useToast();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [stats, setStats] = useState<AnomalyStats>({
    total: 0,
    new_nodes: 0,
    excessive_requests: 0,
  });
  const [loading, setLoading] = useState(false);
  const [relearning, setRelearning] = useState(false);

  // Fetch anomalies on mount
  useEffect(() => {
    console.log("[ANOMALY] Component mounted, fetching anomalies...");
    fetchAnomalies();

    // Refresh every 30 seconds
    const interval = setInterval(fetchAnomalies, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAnomalies = async () => {
    try {
      setLoading(true);
      console.log("[ANOMALY] Fetching from http://localhost:8000/api/anomalies/report?limit=20");
      const response = await fetch("http://localhost:8000/api/anomalies/report?limit=20");

      console.log("[ANOMALY] Response status:", response.status, response.statusText);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const data: Anomaly[] = await response.json();
      console.log("[ANOMALY] Received data:", data);
      setAnomalies(data);

      // Calculate stats
      const newNodesCount = data.filter((a) => a.type === "NEW_NODE").length;
      const excessiveCount = data.filter((a) => a.type === "EXCESSIVE_REQUESTS" || a.type === "ML_ANOMALY").length;

      setStats({
        total: data.length,
        new_nodes: newNodesCount,
        excessive_requests: excessiveCount,
      });
      console.log("[ANOMALY] Stats updated - Total:", data.length, "New Nodes:", newNodesCount, "Excessive:", excessiveCount);
    } catch (error) {
      console.error("[ANOMALY] Failed to fetch anomalies:", error);
      toast({
        title: "Connection Error",
        description: "Could not fetch network anomalies. Check if backend is running.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRelearn = async () => {
    try {
      setRelearning(true);
      const response = await fetch("http://localhost:8000/api/ai/relearn", {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to reset AI");

      toast({
        title: "AI Reset Successful",
        description: "The anomaly detector has been reset and is now in learning mode.",
      });

      // Clear local state immediately
      setAnomalies([]);
      setStats({ total: 0, new_nodes: 0, excessive_requests: 0 });
      fetchAnomalies(); // Verify with backend

    } catch (error) {
      toast({
        title: "Relearn Failed",
        description: "Could not reset the AI model. Please try again.",
        variant: "destructive",
      });
      console.error("Relearn failed:", error);
    } finally {
      setRelearning(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-500 text-white";
      case "HIGH":
        return "bg-orange-500 text-white";
      case "MEDIUM":
        return "bg-yellow-500 text-white";
      case "LOW":
        return "bg-blue-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getSeverityBgColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-card border-red-500/50 hover:bg-red-500/10";
      case "HIGH":
        return "bg-card border-orange-500/50 hover:bg-orange-500/10";
      case "MEDIUM":
        return "bg-card border-yellow-500/50 hover:bg-yellow-500/10";
      default:
        return "bg-card border-border hover:bg-accent/50";
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };

  return (
    <div className="space-y-6">
      {/* Header with Relearn Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Anomaly Detection</h2>
        <Button
          variant="outline"
          onClick={handleRelearn}
          disabled={relearning}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${relearning ? "animate-spin" : ""}`} />
          {relearning ? "Client Relearning..." : "Relearn AI"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Anomalies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              New Nodes Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.new_nodes}</div>
            <p className="text-xs text-muted-foreground mt-1">First-time devices</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Excessive Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.excessive_requests}</div>
            <p className="text-xs text-muted-foreground mt-1">Traffic spikes & AI patterns</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {anomalies.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Network Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className="bg-green-50 border-green-200">
              <Zap className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                ✓ No anomalies detected. Network operating normally.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Anomalies</CardTitle>
            <Badge variant="outline" className="bg-yellow-50">
              {stats.total} detected
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {anomalies.slice(0, 20).map((anomaly, idx) => (
                <div
                  key={idx}
                  className={`p-4 border rounded-lg ${getSeverityBgColor(anomaly.severity)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Header: Type & IP */}
                      <div className="flex items-center gap-2 mb-2">
                        {anomaly.type === "NEW_NODE" ? (
                          <AlertTriangle className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Zap className="h-4 w-4 text-orange-600" />
                        )}
                        <span className="font-semibold text-foreground">
                          {anomaly.type === "NEW_NODE" ? "🆕 New Node" : "⚡ Traffic Spike"}
                        </span>
                        <Badge className={getSeverityColor(anomaly.severity)}>
                          {anomaly.severity}
                        </Badge>
                      </div>

                      {/* Details */}
                      <div className="ml-6 space-y-1 text-sm">
                        <p className="font-mono text-foreground">{anomaly.node_ip}</p>

                        {anomaly.type === "NEW_NODE" ? (
                          <>
                            {anomaly.hostname && (
                              <p className="text-muted-foreground">
                                Hostname: <span className="text-foreground">{anomaly.hostname}</span>
                              </p>
                            )}
                            {anomaly.mac && (
                              <p className="text-muted-foreground">
                                MAC: <span className="font-mono text-foreground">{anomaly.mac}</span>
                              </p>
                            )}
                          </>
                        ) : anomaly.type === "ML_ANOMALY" ? (
                          <>
                            <p className="text-muted-foreground">
                              Destination: <span className="text-foreground">{anomaly.dst_ip}</span>
                            </p>
                            <p className="text-muted-foreground">
                              Port: <span className="text-foreground">{anomaly.port}</span>
                            </p>
                            <p className="text-muted-foreground">
                              Process: <span className="text-foreground font-mono">{anomaly.process}</span>
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-muted-foreground">
                              Current: <span className="text-foreground font-semibold">{anomaly.current}</span> requests
                            </p>
                            <p className="text-muted-foreground">
                              Baseline: <span className="text-foreground">{anomaly.baseline?.toFixed(1)}</span> requests
                            </p>
                            <p className="text-muted-foreground">
                              Multiplier: <span className="text-foreground font-semibold">{anomaly.multiplier?.toFixed(2)}x</span>
                            </p>
                          </>
                        )}

                        <p className="text-xs text-muted-foreground pt-1">
                          {formatTime(anomaly.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Refresh Note */}
      <p className="text-xs text-muted-foreground text-center">
        {loading ? "Updating..." : "Auto-refreshes every 30 seconds"}
      </p>
    </div >
  );
};
