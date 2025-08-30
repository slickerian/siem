import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart } from "lucide-react";

interface EventTypeChartProps {
  data: Array<{
    event_type: string;
    count: number;
  }>;
}

export function EventTypeChart({ data }: EventTypeChartProps) {
  const getSeverityColor = (eventType: string) => {
    const type = eventType.toUpperCase();
    if (type.includes('ERROR') || type.includes('CRITICAL') || type.includes('FAIL')) {
      return "hsl(var(--siem-critical))";
    }
    if (type.includes('WARN') || type.includes('WARNING')) {
      return "hsl(var(--siem-high))";
    }
    if (type.includes('INFO') || type.includes('NET_CONNECT')) {
      return "hsl(var(--siem-info))";
    }
    if (type.includes('AUTH')) {
      return "hsl(var(--siem-medium))";
    }
    return "hsl(var(--chart-1))";
  };

  const chartData = data.map(item => ({
    ...item,
    fill: getSeverityColor(item.event_type)
  }));

  return (
    <Card className="siem-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <PieChart className="h-5 w-5 text-primary" />
          Event Types Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                type="number"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis 
                type="category"
                dataKey="event_type" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                width={120}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))"
                }}
              />
              <Legend />
              <Bar 
                dataKey="count" 
                name="Count"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}