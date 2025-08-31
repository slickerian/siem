import { useEffect, useState, useRef } from "react";
import { siemApi, LogEntry } from "@/services/siemApi";
import { EventTable } from "./EventTable";

interface EventTableWrapperProps {
  searchQuery?: string;
  onChartDataUpdate?: (chartData: Array<{ bucket: string; count: number }>) => void;
  onStatsUpdate?: (total: number, critical: number, last24h: number, avgPerHour: number) => void;
}

export function EventTableWrapper({
  searchQuery = "",
  onChartDataUpdate,
  onStatsUpdate,
}: EventTableWrapperProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chartData, setChartData] = useState<Array<{ bucket: string; count: number }>>([]);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  const bufferRef = useRef<LogEntry[]>([]);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Debounce search input ---
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // --- Aggregate logs helper ---
  const aggregateLogs = (logs: LogEntry[], bucketMinutes = 5) => {
    const buckets: Record<string, number> = {};
    logs.forEach(log => {
      const date = new Date(log.created_at);
      const minutes = Math.floor(date.getMinutes() / bucketMinutes) * bucketMinutes;
      const bucketKey = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        minutes
      ).toISOString();
      buckets[bucketKey] = (buckets[bucketKey] || 0) + 1;
    });

    return Object.entries(buckets)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([bucket, count]) => ({ bucket, count }));
  };

  // --- Calculate stats helper ---
  const calculateStats = (logs: LogEntry[]) => {
    const total = logs.length;
    const critical = logs.filter(log =>
      ["ERROR", "CRITICAL", "FAIL"].some(k => log.event_type.toUpperCase().includes(k))
    ).length;

    const now = new Date();
    const last24h = logs.filter(log => now.getTime() - new Date(log.created_at).getTime() <= 24 * 60 * 60 * 1000).length;

    const firstLog = logs.length ? new Date(logs[logs.length - 1].created_at) : now;
    const hoursElapsed = Math.max(1, (now.getTime() - firstLog.getTime()) / (1000 * 60 * 60));
    const avgPerHour = Math.round(total / hoursElapsed);

    if (onStatsUpdate) onStatsUpdate(total, critical, last24h, avgPerHour);
  };

  // --- Fetch logs whenever debouncedSearch changes ---
  useEffect(() => {
    let isMounted = true;

    siemApi.getLogs({ limit: 1000, q: debouncedSearch }).then(res => {
      if (!isMounted) return;
      setLogs(res.items);

      const aggregated = aggregateLogs(res.items);
      setChartData(aggregated);
      if (onChartDataUpdate) onChartDataUpdate(aggregated);
      calculateStats(res.items);
    });

    return () => { isMounted = false; };
  }, [debouncedSearch, onChartDataUpdate, onStatsUpdate]);

  // --- WebSocket with throttled updates & reconnect ---
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closedByUser = false;

    const flushBuffer = () => {
      if (bufferRef.current.length === 0) return;

      setLogs(prev => {
        const updated = [...bufferRef.current, ...prev].slice(0, 1000);
        const aggregated = aggregateLogs(updated);
        setChartData(aggregated);
        if (onChartDataUpdate) onChartDataUpdate(aggregated);
        calculateStats(updated);
        bufferRef.current = [];
        return updated;
      });
    };

    const connect = () => {
      ws = siemApi.connectWebSocket((newLog: LogEntry) => {
        bufferRef.current.push(newLog);
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(() => {
            flushBuffer();
            flushTimerRef.current = null;
          }, 500); // throttle updates every 500ms
        }
      });

      ws.onclose = () => {
        if (!closedByUser) {
          console.warn("WebSocket closed, reconnecting in 2s...");
          setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closedByUser = true;
      ws?.close();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [onChartDataUpdate, onStatsUpdate]);

  return <EventTable data={logs} searchQuery={searchQuery} />;
}
