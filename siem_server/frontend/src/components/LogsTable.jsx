import { DataGrid } from '@mui/x-data-grid'
import { Box, Typography } from '@mui/material'

export default function LogsTable({ rows }) {
  const columns = [
    { field: 'id', headerName: 'ID', width: 80 },
    { field: 'created_at', headerName: 'Time', width: 180 },
    { field: 'event_type', headerName: 'Event Type', width: 160 },
    {
      field: 'data',
      headerName: 'Data',
      flex: 1,
      renderCell: (params) => (
        <Box sx={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.25,
        }}>
          {String(params.value ?? '')}
        </Box>
      )
    },
  ]

  return (
    <div style={{ height: 520, width: '100%' }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
        Recent Logs
      </Typography>
      <DataGrid
        density="compact"
        rows={(rows || []).map(r => ({ id: r.id, ...r }))}
        columns={columns}
        pageSizeOptions={[25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25, page: 0 } },
          sorting: { sortModel: [{ field: 'id', sort: 'desc' }] }
        }}
      />
    </div>
  )
}
