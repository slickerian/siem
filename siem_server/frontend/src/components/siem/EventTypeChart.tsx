import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart } from "lucide-react";

interface EventTypeChartProps {
  data: Array<{ event_type: string; count: number }>;
}

export function EventTypeChart({ data }: EventTypeChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card className="siem-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <PieChart className="h-5 w-5 text-primary" />
            Event Types Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground p-4 text-center">
            No event data available.
          </div>
        </CardContent>
      </Card>
    );
  }

  // 🎨 Color logic based on event type
  const getSeverityColor = (eventType: string) => {
    const type = eventType.toUpperCase();
    if (type.includes("ERROR") || type.includes("CRITICAL") || type.includes("FAIL"))
      return "hsl(var(--siem-critical))";
    if (type.includes("WARN") || type.includes("WARNING"))
      return "hsl(var(--siem-high))";
    if (type.includes("INFO") || type.includes("NET_CONNECT"))
      return "hsl(var(--siem-info))";
    if (type.includes("AUTH")) return "hsl(var(--siem-medium))";
    return "hsl(var(--chart-1))";
  };

  const chartData = data.map((item) => ({
    ...item,
    event_type: item.event_type.trim(),
    fill: getSeverityColor(item.event_type),
  }));

  // 📏 Dynamic chart height (~40px per bar)
  const chartHeight = Math.max(chartData.length * 40, 300); // minimum height 300px

  return (
    <Card className="siem-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <PieChart className="h-5 w-5 text-primary" />
          Event Types Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* 🧭 Scrollable container only when hovered (no scrollbar visible) */}
        <div
          className="
            max-h-80
            overflow-hidden
            hover:overflow-y-auto
            scrollbar-none
            transition-all
            duration-200
          "
        >
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                type="category"
                dataKey="event_type"
                interval={0}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                width={140}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
              />
              <Legend />
              <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
