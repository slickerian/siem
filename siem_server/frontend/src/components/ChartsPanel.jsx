import { Paper, Stack, TextField, Typography } from '@mui/material'
import { Line, Bar } from 'react-chartjs-2'
import 'chart.js/auto'

export default function ChartsPanel({ histogram, timeseries, bucket, onBucketChange }) {
  const histData = {
    labels: (histogram || []).map(h => h.event_type ?? '(none)'),
    datasets: [{
      label: 'Count',
      data: (histogram || []).map(h => h.count),
    }]
  }

  const tsData = {
    labels: (timeseries || []).map(t => t.bucket),
    datasets: [{
      label: 'Events',
      data: (timeseries || []).map(t => t.count),
      fill: true,
      tension: 0.3,
    }]
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Event Types (Count)
        </Typography>
        <Bar data={histData} />
      </Paper>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="subtitle1" fontWeight={600}>
            Events Over Time
          </Typography>
          <TextField
            label="Bucket (minutes)"
            type="number"
            size="small"
            sx={{ width: 160 }}
            inputProps={{ min: 1, max: 1440 }}
            value={bucket}
            onChange={(e) => onBucketChange(Number(e.target.value || 5))}
          />
        </Stack>
        <Line data={tsData} />
      </Paper>
    </Stack>
  )
}
