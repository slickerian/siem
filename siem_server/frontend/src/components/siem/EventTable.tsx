import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export function EventTable({ data, searchQuery }) {
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);

  const getSeverityVariant = (eventType) => {
    const type = eventType?.toUpperCase() || "";
    if (type.includes("ERROR") || type.includes("CRITICAL") || type.includes("FAIL")) {
      return "destructive";
    }
    if (type.includes("WARN") || type.includes("WARNING")) {
      return "secondary";
    }
    if (type.includes("AUTH")) {
      return "outline";
    }
    return "default";
  };

  const columns = [
    {
      accessorKey: "created_at",
      header: "Timestamp",
      cell: (info) => new Date(info.getValue()).toLocaleString(),
    },
    {
      accessorKey: "event_type",
      header: "Event Type",
      cell: (info) => (
        <Badge variant={getSeverityVariant(info.getValue())} className="font-mono">
          {info.getValue()}
        </Badge>
      ),
    },
    {
      accessorKey: "data",
      header: "Message",
    },
  ];

  const filteredData = searchQuery
    ? data.filter((row) =>
        Object.values(row).some((val) =>
          String(val).toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : data;

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
  });

  return (
    <div className="w-full">
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Scrollable table container */}
        <div className="max-h-[500px] overflow-y-auto">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr
                  key={headerGroup.id}
                  className="border-b border-border hover:bg-transparent"
                >
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-2 text-left font-medium text-muted-foreground"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
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
                      <td
                        key={cell.id}
                        className="px-4 py-2 text-sm text-foreground"
                      >
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
