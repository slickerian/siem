import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface DropdownMenuProps<T> {
  label: string;
  items: T[];
  selectedValue: string;
  onSelect: (value: string) => void;
  valueKey?: keyof T;
  labelKey?: keyof T;
  showBadge?: boolean;
  badgeValue?: number;
}

export function DropdownMenu<T>({
  label,
  items,
  selectedValue,
  onSelect,
  valueKey,
  labelKey,
  showBadge = false,
  badgeValue,
}: DropdownMenuProps<T>) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="siem-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-foreground">
            {label}
            {showBadge && badgeValue !== undefined && (
              <Badge variant="secondary" className="ml-2">
                {badgeValue}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="hover:bg-accent"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          <Select
            value={selectedValue}
            onValueChange={(value) => onSelect(value)}
          >
            <SelectTrigger className="bg-input border-border w-full">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              {items.map((item) => {
                const val = valueKey ? item[valueKey] : (item as unknown as string);
                const lbl = labelKey ? item[labelKey] : (item as unknown as string);
                return (
                  <SelectItem key={String(val)} value={String(val)}>
                    {String(lbl)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </CardContent>
      )}
    </Card>
  );
}
