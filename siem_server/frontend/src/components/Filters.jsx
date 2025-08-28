import { Button, Grid, TextField } from '@mui/material'

export default function Filters({ value, onChange, onApply, onReset }) {
  return (
    <Grid container spacing={2} alignItems="center">
      <Grid item xs={12} md={3}>
        <TextField
          label="Event Type"
          fullWidth
          placeholder="e.g. INFO/WARN/ERROR"
          value={value.event_type}
          onChange={(e) => onChange({ event_type: e.target.value })}
        />
      </Grid>
      <Grid item xs={12} md={3}>
        <TextField
          label="Search"
          fullWidth
          placeholder="keyword in event/data"
          value={value.q}
          onChange={(e) => onChange({ q: e.target.value })}
        />
      </Grid>
      <Grid item xs={12} md={3}>
        <TextField
          label="Start (YYYY-MM-DD HH:MM:SS)"
          fullWidth
          placeholder="2025-08-21 09:00:00"
          value={value.start}
          onChange={(e) => onChange({ start: e.target.value })}
        />
      </Grid>
      <Grid item xs={12} md={3}>
        <TextField
          label="End (YYYY-MM-DD HH:MM:SS)"
          fullWidth
          placeholder="2025-08-21 18:00:00"
          value={value.end}
          onChange={(e) => onChange({ end: e.target.value })}
        />
      </Grid>
      <Grid item xs={12} md={9} />
      <Grid item xs={12} md={3} display="flex" gap={1} justifyContent="flex-end">
        <Button variant="contained" onClick={onApply}>Apply Filters</Button>
        <Button variant="outlined" onClick={onReset}>Reset</Button>
      </Grid>
    </Grid>
  )
}
