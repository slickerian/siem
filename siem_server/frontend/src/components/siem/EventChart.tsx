import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EventChartProps {
  data: Array<{
    bucket: string;
    count: number;
  }>;
}

export function EventChart({ data }: EventChartProps) {
  const MIN_VISIBLE = 10; // never show fewer than this many points
  const chartRef = useRef<HTMLDivElement | null>(null);

  const [scale, setScale] = useState<number>(1); // 1 === full range, >1 zoomed in
  const [offset, setOffset] = useState<number>(0); // start index (can be fractional)
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef<number | null>(null);

  const formatTime = (bucket: string) => {
    try {
      // Parse UTC time and convert to Kolkata time (IST, UTC+5:30)
      const utcDate = new Date(bucket + (bucket.includes('Z') ? '' : 'Z')); // Ensure UTC
      const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000)); // Add 5.5 hours

      return istDate.toLocaleTimeString("en-IN", {
        timeZone: 'Asia/Kolkata',
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return bucket;
    }
  };

  // compute visible counts and clamp helpers
  const visibleCount = Math.max(Math.floor(data.length / Math.max(scale, 1)), MIN_VISIBLE);
  const maxOffset = Math.max(data.length - visibleCount, 0);
  const startIndex = Math.min(Math.max(Math.floor(offset), 0), maxOffset);
  const visibleData = data.slice(startIndex, startIndex + visibleCount);

  // Reset
  const handleReset = useCallback(() => {
    setScale(1);
    setOffset(0);
  }, []);

  // Native wheel handler (attached with passive: false) to reliably prevent page scroll
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // only act when pointer is over the chart container
      // preventDefault is required to stop the page scrolling
      e.preventDefault();
      e.stopPropagation();

      setScale((prevScale) => {
        const prevVisible = Math.max(Math.floor(data.length / prevScale), MIN_VISIBLE);

        const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12; // scroll up to zoom in
        let newScale = prevScale * zoomFactor;
        newScale = Math.min(Math.max(newScale, 1), 20); // clamp scale

        const newVisible = Math.max(Math.floor(data.length / newScale), MIN_VISIBLE);

        // keep viewport center roughly stable: compute center index then recenter for newVisible
        setOffset((prevOffset) => {
          const centerIndex = prevOffset + prevVisible / 2;
          const newStart = Math.floor(centerIndex - newVisible / 2);
          return Math.min(Math.max(newStart, 0), Math.max(data.length - newVisible, 0));
        });

        return newScale;
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [data.length]);

  // Mouse drag to pan: convert pixel delta -> index delta using container width
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startX.current = e.clientX;
  };

  const stopDrag = () => {
    setIsDragging(false);
    startX.current = null;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || startX.current == null) return;
    const deltaX = e.clientX - startX.current;
    startX.current = e.clientX;

    const el = chartRef.current;
    if (!el) return;
    const width = Math.max(el.clientWidth, 1);

    const currentVisible = Math.max(Math.floor(data.length / Math.max(scale, 1)), MIN_VISIBLE);
    const pixelsPerIndex = width / currentVisible;
    const deltaIndex = deltaX / pixelsPerIndex;

    setOffset((prev) => {
      const next = prev - deltaIndex; // dragging right should move viewport left (hence minus)
      return Math.min(Math.max(next, 0), Math.max(data.length - currentVisible, 0));
    });
  };

  return (
    <Card className="siem-card border-border select-none">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <TrendingUp className="h-5 w-5 text-primary" />
          Event Timeline
        </CardTitle>

        <Button variant="outline" size="sm" onClick={handleReset} className="flex items-center gap-1">
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
      </CardHeader>

      <CardContent>
        {/* copied the same scroll-container approach you used:
            - overflow hidden by default, shows internal scrollbar on hover
            - we also attach a native wheel handler to prevent page scroll and do zoom
        */}
        <div
          ref={chartRef}
          className="
            h-80
            max-h-80
            overflow-hidden
            hover:overflow-y-auto
            scrollbar-none
            transition-all
            duration-200
            cursor-grab
            active:cursor-grabbing
          "
          onMouseDown={handleMouseDown}
          onMouseUp={stopDrag}
          onMouseMove={handleMouseMove}
          onMouseLeave={stopDrag}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visibleData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={formatTime} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  color: "hsl(var(--foreground))",
                }}
                labelFormatter={(value) => `Time: ${formatTime(value as string)}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: "hsl(var(--primary))", strokeWidth: 2 }}
                name="Events"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
