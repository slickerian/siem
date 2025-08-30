import { useEffect, useState } from "react";
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

  // Helper: aggregate logs into timeline buckets
  const aggregateLogs = (logs: LogEntry[], bucketMinutes = 5) => {
    const buckets: Record<string, number> = {};
    logs.forEach((log) => {
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

  // Helper: calculate live stats
  const calculateStats = (logs: LogEntry[]) => {
    const total = logs.length;

    const critical = logs.filter((log) =>
      ["ERROR", "CRITICAL", "FAIL"].some((k) =>
        log.event_type.toUpperCase().includes(k)
      )
    ).length;

    const now = new Date();
    const last24h = logs.filter((log) => {
      const logTime = new Date(log.created_at);
      return now.getTime() - logTime.getTime() <= 24 * 60 * 60 * 1000;
    }).length;

    const firstLog = logs.length ? new Date(logs[logs.length - 1].created_at) : now;
    const hoursElapsed = Math.max(
      1,
      (now.getTime() - firstLog.getTime()) / (1000 * 60 * 60)
    );
    const avgPerHour = Math.round(total / hoursElapsed);

    if (onStatsUpdate) onStatsUpdate(total, critical, last24h, avgPerHour);
  };

  // Fetch initial logs
  useEffect(() => {
    let isMounted = true;
    siemApi.getLogs({ limit: 1000 }).then((res) => {
      if (!isMounted) return;
      setLogs(res.items);
      const aggregated = aggregateLogs(res.items);
      setChartData(aggregated);
      if (onChartDataUpdate) onChartDataUpdate(aggregated);
      calculateStats(res.items);
    });
    return () => {
      isMounted = false;
    };
  }, [onChartDataUpdate, onStatsUpdate]);

  // WebSocket subscription for live updates (with throttle)
  useEffect(() => {
    let buffer: LogEntry[] = [];
    let flushTimer: NodeJS.Timeout | null = null;

    const ws = siemApi.connectWebSocket((newLog: LogEntry) => {
      buffer.push(newLog);

      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          setLogs((prevLogs) => {
            const updatedLogs = [...buffer, ...prevLogs].slice(0, 1000); // keep 1000
            const aggregated = aggregateLogs(updatedLogs);
            setChartData(aggregated);
            if (onChartDataUpdate) onChartDataUpdate(aggregated);
            calculateStats(updatedLogs);
            return updatedLogs;
          });

          buffer = [];
          flushTimer = null;
        }, 1000); // flush every 1s
      }
    });

    return () => {
      ws.close();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [onChartDataUpdate, onStatsUpdate]);

  return <EventTable data={logs} searchQuery={searchQuery} />;
}
