import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { siemApi } from "@/services/siemApi";

export function EventTable({ data, searchQuery, onSearchChange }) {
  const [sorting, setSorting] = useState([]);
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  const [severities, setSeverities] = useState({ critical: "", warning: "", info: "" });

  // Update local search when prop changes (for external updates)
  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  // Load severities on mount
  useEffect(() => {
    const loadSeverities = async () => {
      try {
        const sev = await siemApi.getLogSeverities();
        setSeverities({
          critical: sev.critical || "",
          warning: sev.warning || "",
          info: sev.info || "",
        });
      } catch (error) {
        console.error("Failed to load severities:", error);
      }
    };
    loadSeverities();
  }, []);

  // Debounce local search query to avoid excessive filtering and parent re-renders
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(localSearchQuery);
      onSearchChange(localSearchQuery); // Only notify parent with debounced value
    }, 150); // Reduced to 150ms for smoother feel

    return () => clearTimeout(timer);
  }, [localSearchQuery, onSearchChange]);

  // Memoize filtered data to avoid re-filtering on every render
  const filteredData = useMemo(() => {
    if (!debouncedSearchQuery) return data;

    const query = debouncedSearchQuery.toLowerCase();
    return data.filter(
      (log) =>
        log.event_type.toLowerCase().includes(query) ||
        log.data.toLowerCase().includes(query)
    );
  }, [data, debouncedSearchQuery]);

  const getSeverityConfig = useCallback((eventType) => {
    const type = eventType?.toUpperCase() || "";
    const criticalTypes = severities.critical.split(',').map(t => t.trim().toUpperCase()).filter(t => t);
    const warningTypes = severities.warning.split(',').map(t => t.trim().toUpperCase()).filter(t => t);
    const infoTypes = severities.info.split(',').map(t => t.trim().toUpperCase()).filter(t => t);

    if (criticalTypes.some(ct => type.includes(ct))) {
      return { variant: "destructive" as const };
    }
    if (warningTypes.some(wt => type.includes(wt))) {
      return { className: "bg-warning text-warning-foreground" };
    }
    if (infoTypes.some(it => type.includes(it))) {
      return { className: "bg-info text-info-foreground" };
    }
    return { variant: "default" as const };
  }, [severities]);

  const columns = useMemo(() => [
    {
      accessorKey: "created_at",
      header: "Timestamp",
      cell: (info) => {
        // The timestamp is already in IST from the server, just format it
        const istDate = new Date(info.getValue());
        return istDate.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      },
    },
    {
      accessorKey: "event_type",
      header: "Event Type",
      cell: (info) => {
        const config = getSeverityConfig(info.getValue());
        const badgeProps: any = { className: `font-mono ${config.className || ""}`.trim() };
        if (config.variant) {
          badgeProps.variant = config.variant;
        }
        return (
          <Badge {...badgeProps}>
            {info.getValue()}
          </Badge>
        );
      },
    },
    {
      accessorKey: "data",
      header: "Message",
    },
  ], [getSeverityConfig]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="w-full relative">
      {/* 🔎 Search bar */}
      <div className="mb-2">
        <input
          type="text"
          value={localSearchQuery}
          onChange={(e) => setLocalSearchQuery(e.target.value)}
          placeholder="Search logs..."
          className="
            w-full p-2 rounded-md border border-border text-sm
            bg-[hsl(var(--input))] text-[hsl(var(--foreground))]
            placeholder-[hsl(var(--muted-foreground))]
            focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]
          "
        />
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        {/* Scrollable container with hidden scrollbar */}
        <div className="max-h-[500px] overflow-y-auto scrollbar-none">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-2 text-left font-medium text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            <tbody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border hover:bg-muted/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2 text-sm text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No events found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
