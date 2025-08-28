import { useEffect, useMemo, useRef, useState } from 'react'
import { Container, Box, Grid, Paper } from '@mui/material'
import Header from './components/Header.jsx'
import Filters from './components/Filters.jsx'
import ChartsPanel from './components/ChartsPanel.jsx'
import LogsTable from './components/LogsTable.jsx'
import { buildQuery, fetchJSON } from './utils/api.js'

export default function App() {
  const [filters, setFilters] = useState({
    event_type: '',
    q: '',
    start: '',
    end: '',
    bucket_minutes: 5,
  })
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [histogram, setHistogram] = useState([])
  const [timeseries, setTimeseries] = useState([])
  const [paused, setPaused] = useState(false)

  const wsRef = useRef(null)

  // Load table + stats
  const loadTable = async () => {
    const qs = buildQuery({
      limit: 250,
      offset: 0,
      event_type: filters.event_type,
      q: filters.q,
      start: filters.start,
      end: filters.end,
    })
    const data = await fetchJSON(`/api/logs?${qs}`)
    setLogs(data.items || [])
    setTotal(data.total || 0)
  }

  const loadStats = async () => {
    const qs = buildQuery({
      event_type: filters.event_type,
      q: filters.q,
      start: filters.start,
      end: filters.end,
      bucket_minutes: filters.bucket_minutes || 5,
    })
    const data = await fetchJSON(`/api/stats?${qs}`)
    setHistogram(data.histogram || [])
    setTimeseries(data.timeseries || [])
  }

  useEffect(() => {
    loadTable()
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.event_type, filters.q, filters.start, filters.end, filters.bucket_minutes])

  // WebSocket live updates
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
    wsRef.current = ws
    ws.onmessage = (ev) => {
      if (paused) return
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'log' && msg.payload) {
          setLogs((prev) => [msg.payload, ...prev].slice(0, 250))
          setTotal((t) => t + 1)
        }
      } catch (err) {
        // ignore parse errors
      }
    }
    ws.onclose = () => { /* auto reconnect handled by page reloads */ }
    return () => ws.close()
  }, [paused])

  const exportHref = useMemo(() => {
    const qs = buildQuery({
      event_type: filters.event_type,
      q: filters.q,
      start: filters.start,
      end: filters.end,
    })
    return `/export.csv${qs ? `?${qs}` : ''}`
  }, [filters])

  return (
    <Box sx={{ py: 2 }}>
      <Container maxWidth="xl">
        <Header
          paused={paused}
          onTogglePaused={() => setPaused((p) => !p)}
          exportHref={exportHref}
          total={total}
          onClear={() => setLogs([])}
        />

        <Paper sx={{ p: 2, mt: 2 }}>
          <Filters
            value={filters}
            onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            onApply={() => { loadTable(); loadStats(); }}
            onReset={() =>
              setFilters({ event_type: '', q: '', start: '', end: '', bucket_minutes: 5 })
            }
          />
        </Paper>

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <ChartsPanel
              histogram={histogram}
              timeseries={timeseries}
              bucket={filters.bucket_minutes}
              onBucketChange={(v) => setFilters((f) => ({ ...f, bucket_minutes: v }))}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <LogsTable rows={logs} />
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  )
}
