import { useState } from 'react';
import { Calendar, Clock, Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface FilterPanelProps {
  filters: {
    eventType: string;
    timeRange: string;
    startDate: string;
    endDate: string;
    bucketMinutes: number;
  };
  onFiltersChange: (filters: any) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  activeFiltersCount: number;
}

export function FilterPanel({ 
  filters, 
  onFiltersChange, 
  onApplyFilters, 
  onResetFilters,
  activeFiltersCount 
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const eventTypes = [
    'NET_CONNECT',
    'NET_DISCONNECT', 
    'AUTH',
    'ERROR',
    'WARNING',
    'INFO',
    'CRITICAL',
    'FAIL'
  ];

  const timeRanges = [
    { value: '', label: 'All Time' },
    { value: '1h', label: 'Last Hour' },
    { value: '6h', label: 'Last 6 Hours' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: 'custom', label: 'Custom Range' }
  ];

  const bucketOptions = [
    { value: 1, label: '1 minute' },
    { value: 5, label: '5 minutes' },
    { value: 15, label: '15 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' },
    { value: 360, label: '6 hours' }
  ];

  return (
    <Card className="siem-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Filter className="h-5 w-5 text-primary" />
            Filters
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFiltersCount}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="hover:bg-accent"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Event Type Filter */}
            <div className="space-y-2">
              <Label htmlFor="eventType" className="text-sm font-medium text-foreground">
                Event Type
              </Label>
              <Select
                value={filters.eventType}
                onValueChange={(value) => onFiltersChange({ eventType: value })}
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="">All Types</SelectItem>
                  {eventTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Range Filter */}
            <div className="space-y-2">
              <Label htmlFor="timeRange" className="text-sm font-medium text-foreground">
                Time Range
              </Label>
              <Select
                value={filters.timeRange}
                onValueChange={(value) => onFiltersChange({ timeRange: value })}
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {timeRanges.map((range) => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Chart Bucket Size */}
            <div className="space-y-2">
              <Label htmlFor="bucket" className="text-sm font-medium text-foreground">
                Chart Granularity
              </Label>
              <Select
                value={filters.bucketMinutes.toString()}
                onValueChange={(value) => onFiltersChange({ bucketMinutes: parseInt(value) })}
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {bucketOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Custom Date Range */}
          {filters.timeRange === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/20 rounded-lg border border-border">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-sm font-medium text-foreground">
                  Start Date & Time
                </Label>
                <Input
                  id="startDate"
                  type="datetime-local"
                  value={filters.startDate}
                  onChange={(e) => onFiltersChange({ startDate: e.target.value })}
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-sm font-medium text-foreground">
                  End Date & Time
                </Label>
                <Input
                  id="endDate"
                  type="datetime-local"
                  value={filters.endDate}
                  onChange={(e) => onFiltersChange({ endDate: e.target.value })}
                  className="bg-input border-border"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button 
              onClick={onApplyFilters}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Apply Filters
            </Button>
            <Button 
              variant="outline" 
              onClick={onResetFilters}
              className="border-border hover:bg-accent"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}