import { Box, Button, Stack, Typography } from '@mui/material'
import PauseRounded from '@mui/icons-material/PauseRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import ClearAllRounded from '@mui/icons-material/ClearAllRounded'

export default function Header({ paused, onTogglePaused, exportHref, total, onClear }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      spacing={2}
    >
      <Box>
        <Typography variant="h5" fontWeight={700}>
          📊 Realtime Log Dashboard
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.7 }}>
          Total matching records: {total}
        </Typography>
      </Box>

      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          startIcon={paused ? <PlayArrowRounded /> : <PauseRounded />}
          onClick={onTogglePaused}
        >
          {paused ? 'Resume Stream' : 'Pause Stream'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<ClearAllRounded />}
          onClick={onClear}
        >
          Clear Table
        </Button>
        <Button
          variant="outlined"
          component="a"
          href={exportHref}
          startIcon={<DownloadRounded />}
        >
          Export CSV
        </Button>
      </Stack>
    </Stack>
  )
}
