import { useState, useEffect, useCallback } from "react";
import { toast } from "@/hooks/use-toast";

import { Header } from "@/components/siem/Header";
import { StatsCards } from "@/components/siem/StatsCards";
import { EventChart } from "@/components/siem/EventChart";
import { EventTypeChart } from "@/components/siem/EventTypeChart";
import { FilterPanel } from "@/components/siem/FilterPanel";
import { EventTable } from "@/components/siem/EventTable";

import { siemApi, StatsResponse, LogsResponse, LogEntry } from "@/services/siemApi";

const Index = () => {
  const [chartData, setChartData] = useState<{ bucket: string; count: number }[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [liveStats, setLiveStats] = useState({
    total: 0,
    critical: 0,
    last24h: 0,
    avgPerHour: 0,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    eventType: "",
    timeRange: "",
    startDate: "",
    endDate: "",
    bucketMinutes: 5,
  });
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const apiParams: any = { limit: 1000 };
      if (filters.eventType) apiParams.event_type = filters.eventType;
      if (searchQuery) apiParams.q = searchQuery;

      // Time range handling
      if (filters.timeRange && filters.timeRange !== "custom") {
        const now = new Date();
        let startTime = new Date(0);
        switch (filters.timeRange) {
          case "1h":
            startTime = new Date(now.getTime() - 60 * 60 * 1000);
            break;
          case "6h":
            startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
            break;
          case "24h":
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case "7d":
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        }
        apiParams.start = startTime.toISOString().replace("T", " ").slice(0, 19);
        apiParams.end = now.toISOString().replace("T", " ").slice(0, 19);
      } else if (filters.timeRange === "custom" && filters.startDate && filters.endDate) {
        apiParams.start = filters.startDate.replace("T", " ");
        apiParams.end = filters.endDate.replace("T", " ");
      }

      const statsResponse = await siemApi.getStats({
        ...apiParams,
        bucket_minutes: filters.bucketMinutes,
      });
      setStats(statsResponse);

      const logsResponse: LogsResponse = await siemApi.getLogs(apiParams);
      setLiveStats({
        total: logsResponse.total,
        critical: logsResponse.critical,
        last24h: logsResponse.last24h,
        avgPerHour: logsResponse.avgPerHour,
      });
      setChartData(statsResponse.timeseries);
      setLogs(logsResponse.items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load data";
      setError(msg);
      toast({
        title: "Error loading data",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [filters, searchQuery ]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadData();
    }, 400); // debounce for smoother typing

    return () => clearTimeout(timeout);
  }, [loadData, searchQuery]);


  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData, searchQuery]);

  // WebSocket for live logs
  useEffect(() => {
    const ws = siemApi.connectWebSocket((log: LogEntry & {
      total: number;
      critical: number;
      last24h: number;
      avgPerHour: number;
    }) => {
      // 🧠 Respect current filters and search
      const matchesEventType =
        !filters.eventType ||
        log.event_type.toLowerCase() === filters.eventType.toLowerCase();

      const matchesSearch =
        !searchQuery ||
        log.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.data.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesEventType || !matchesSearch) return; // ignore unrelated logs

      // ✅ Update log list
      setLogs((prev) => [log, ...prev.slice(0, 999)]);

      // ✅ Update stats cards
      setLiveStats({
        total: log.total,
        critical: log.critical,
        last24h: log.last24h,
        avgPerHour: log.avgPerHour,
      });

      // ✅ Update time-series graph (for visible logs only)
      setChartData((prev) => {
        const nowBucket = new Date().toISOString().slice(0, 16) + ":00";
        const updated = [...prev];
        const idx = updated.findIndex((p) => p.bucket === nowBucket);

        if (idx >= 0) {
          updated[idx] = { ...updated[idx], count: updated[idx].count + 1 };
        } else {
          updated.push({ bucket: nowBucket, count: 1 });
        }

        return updated.slice(-200); // keep only recent points
      });

      // ✅ Update event-type histogram
      setStats((prev) => {
        if (!prev) return prev;
        const updatedHisto = [...prev.histogram];
        const idx = updatedHisto.findIndex((h) => h.event_type === log.event_type);
        if (idx >= 0) {
          updatedHisto[idx] = {
            ...updatedHisto[idx],
            count: updatedHisto[idx].count + 1,
          };
        } else {
          updatedHisto.push({ event_type: log.event_type, count: 1 });
        }
        return { ...prev, histogram: updatedHisto };
      });
    });

    return () => ws.close();
  }, [filters.eventType, searchQuery]);



  const handleFiltersChange = (newFilters: Partial<typeof filters>) =>
    setFilters((prev) => ({ ...prev, ...newFilters }));
  const handleApplyFilters = () => loadData();
  const handleResetFilters = () =>
    setFilters({ eventType: "", timeRange: "24h", startDate: "", endDate: "", bucketMinutes: 5 });
  const handleExport = () =>
    window.open(siemApi.getExportUrl({ event_type: filters.eventType }), "_blank");

  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== "" && v !== 5 && v !== "24h"
  ).length;

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

  return (
    <div className="min-h-screen bg-background">
      <Header onExport={handleExport} isConnected={true} totalEvents={liveStats.total} />
      <main className="container mx-auto px-6 py-6 space-y-6">
        {/* Filters */}
        <FilterPanel
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onApplyFilters={handleApplyFilters}
          onResetFilters={handleResetFilters}
          activeFiltersCount={activeFiltersCount}
        />

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
