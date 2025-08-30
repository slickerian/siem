import { TrendingUp, AlertTriangle, Activity, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatsCardsProps {
  stats: {
    total: number;
    critical: number;
    last24h: number;
    avgPerHour: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card className="siem-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
          <Database className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{stats.total.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">All time events</p>
        </CardContent>
      </Card>

      <Card className="siem-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Critical Events</CardTitle>
          <AlertTriangle className="h-4 w-4 text-siem-critical" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-siem-critical">{stats.critical.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">Require immediate attention</p>
        </CardContent>
      </Card>

      <Card className="siem-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Last 24 Hours</CardTitle>
          <Activity className="h-4 w-4 text-chart-2" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{stats.last24h.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground">Recent activity</p>
        </CardContent>
      </Card>

      <Card className="siem-card border-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Avg/Hour</CardTitle>
          <TrendingUp className="h-4 w-4 text-chart-1" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-foreground">{stats.avgPerHour.toFixed(1)}</div>
          <p className="text-xs text-muted-foreground">Events per hour</p>
        </CardContent>
      </Card>
    </div>
  );
}