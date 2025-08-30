import { useState, useEffect, useCallback } from 'react';
import { toast } from "@/hooks/use-toast";

// SIEM Components
import { Header } from '@/components/siem/Header';
import { StatsCards } from '@/components/siem/StatsCards';
import { EventChart } from '@/components/siem/EventChart';
import { EventTypeChart } from '@/components/siem/EventTypeChart';
import { EventTableWrapper } from '@/components/siem/EventTableWrapper';
import { FilterPanel } from '@/components/siem/FilterPanel';

// Services
import { siemApi, type StatsResponse } from '@/services/siemApi';

const Index = () => {
  // -----------------------------
  // State management
  // -----------------------------
  const [chartData, setChartData] = useState<{ bucket: string; count: number }[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const [liveStats, setLiveStats] = useState({
    total: 0,
    critical: 0,
    last24h: 0,
    avgPerHour: 0,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    eventType: '',
    timeRange: '24h',
    startDate: '',
    endDate: '',
    bucketMinutes: 5,
  });

  // -----------------------------
  // Load initial logs/stats from API
  // -----------------------------
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const apiParams: any = { limit: 1000 };
      if (filters.eventType) apiParams.event_type = filters.eventType;

      if (filters.timeRange && filters.timeRange !== 'custom') {
        const now = new Date();
        let startTime: Date;

        switch (filters.timeRange) {
          case '1h': startTime = new Date(now.getTime() - 60 * 60 * 1000); break;
          case '6h': startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000); break;
          case '24h': startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
          case '7d': startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
          default: startTime = new Date(0);
        }

        apiParams.start = startTime.toISOString().replace('T', ' ').slice(0, 19);
        apiParams.end = now.toISOString().replace('T', ' ').slice(0, 19);
      } else if (filters.timeRange === 'custom' && filters.startDate && filters.endDate) {
        apiParams.start = filters.startDate.replace('T', ' ');
        apiParams.end = filters.endDate.replace('T', ' ');
      }

      const statsResponse = await siemApi.getStats({
        ...apiParams,
        bucket_minutes: filters.bucketMinutes,
      });

      setStats(statsResponse);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMessage);
      toast({
        title: "Error loading data",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  // -----------------------------
  // Load initial data on mount
  // -----------------------------
  useEffect(() => {
    loadData();
  }, [loadData]);

  // -----------------------------
  // Filters & Export handlers
  // -----------------------------
  const handleFiltersChange = (newFilters: Partial<typeof filters>) =>
    setFilters(prev => ({ ...prev, ...newFilters }));

  const handleApplyFilters = () => loadData();

  const handleResetFilters = () =>
    setFilters({
      eventType: '',
      timeRange: '24h',
      startDate: '',
      endDate: '',
      bucketMinutes: 5,
    });

  const handleExport = () => {
    const exportParams: any = {};
    if (filters.eventType) exportParams.event_type = filters.eventType;
    if (searchQuery.trim()) exportParams.q = searchQuery.trim();
    window.open(siemApi.getExportUrl(exportParams), '_blank');
  };

  // Count active filters
  const activeFiltersCount = Object.values(filters).filter(
    v => v !== '' && v !== 5 && v !== '24h'
  ).length;

  // -----------------------------
  // Error UI
  // -----------------------------
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="text-destructive text-4xl">⚠️</div>
          <h1 className="text-2xl font-bold text-foreground">Connection Error</h1>
          <p className="text-muted-foreground max-w-md">
            Unable to connect to the SIEM server. Please ensure the Python backend is running on localhost:8000.
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
  }

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="min-h-screen bg-background">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onExport={handleExport}
        isConnected={true} // always true now, or add from wrapper if you expose it
        totalEvents={liveStats.total}
      />

      <main className="container mx-auto px-6 py-6 space-y-6">
        <FilterPanel
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onApplyFilters={handleApplyFilters}
          onResetFilters={handleResetFilters}
          activeFiltersCount={activeFiltersCount}
        />

        <StatsCards stats={liveStats} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EventChart data={chartData} />
          <EventTypeChart data={stats?.histogram || []} />
        </div>

        <EventTableWrapper
          searchQuery={searchQuery}
          onChartDataUpdate={setChartData}
          onStatsUpdate={(total, critical, last24h, avgPerHour) =>
            setLiveStats({ total, critical, last24h, avgPerHour })
          }
        />
      </main>
    </div>
  );
};

export default Index;
