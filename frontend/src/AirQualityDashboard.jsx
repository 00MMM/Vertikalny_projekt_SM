import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { LineChart } from '@mui/x-charts/LineChart';
import AppTheme from './shared-theme/AppTheme';

const metricMeta = {
  aqi: { label: 'AQI', color: '#d97706' },
  pm10: { label: 'PM10', color: '#0f766e' },
  o3: { label: 'O3', color: '#2563eb' },
  no2: { label: 'NO2', color: '#7c3aed' },
};

function formatValue(value, unit = '') {
  if (value === null || value === undefined) {
    return '--';
  }
  return `${value}${unit ? ` ${unit}` : ''}`;
}

function TrendChip({ value }) {
  const label = value > 0 ? `+${value}` : value < 0 ? `${value}` : '0';
  const color = value > 0 ? 'error' : value < 0 ? 'success' : 'default';

  return <Chip size="small" color={color} label={label} />;
}

function SummaryCard({ card }) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 4,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,247,250,0.82) 100%)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="overline" sx={{ letterSpacing: 1.2 }}>
              {card.label}
            </Typography>
            <TrendChip value={card.trend} />
          </Stack>
          <Typography variant="h3" sx={{ fontWeight: 700 }}>
            {formatValue(card.value, card.unit)}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function AirQualityDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let socket = null;
    let reconnectTimeoutId = null;

    async function loadDashboard() {
      try {
        setLoading(true);
        const response = await fetch('/api/dashboard/');
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        const payload = await response.json();
        if (!cancelled) {
          setData(payload);
          setError('');
          setLoading(false);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError('Nepodarilo sa nacitat data z Django backendu. Skontroluj, ci bezi server na porte 8000.');
          setLoading(false);
        }
      }
    }

    function connectSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.hostname || '127.0.0.1';
      socket = new WebSocket(`${protocol}://${host}:8000/ws/data/`);

      socket.onmessage = (event) => {
        const newData = JSON.parse(event.data);
        if (!cancelled) {
          setData(newData);
          setError('');
          setLoading(false);
        }
      };

      socket.onopen = () => {
        if (!cancelled) {
          setError('');
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (cancelled) return;
        setError('Realtime spojenie sa prerusilo. Skusam obnovit pripojenie...');
        reconnectTimeoutId = window.setTimeout(connectSocket, 1000);
      };
    }

    loadDashboard();
    connectSocket();

    return () => {
      cancelled = true;
      if (reconnectTimeoutId) {
        window.clearTimeout(reconnectTimeoutId);
      }
      if (socket) {
        socket.close();
      }
    };
  }, []);

  const chartSeries = useMemo(() => {
    if (!data?.history?.length) return [];

    return Object.entries(metricMeta).map(([key, meta]) => ({
      id: key,
      label: meta.label,
      data: data.history.map((point) => point[key]),
      color: meta.color,
      curve: 'monotoneX',
      showMark: false,
    }));
  }, [data]);

  const chartLabels = data?.history?.map((point) => point.label) ?? [];

  return (
    <AppTheme>
      <CssBaseline enableColorScheme />
      <Box
        sx={(theme) => ({
          minHeight: '100vh',
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 5 },
          background: theme.vars
            ? `linear-gradient(180deg, rgba(${theme.vars.palette.primary.mainChannel} / 0.12) 0%, rgba(${theme.vars.palette.background.defaultChannel} / 1) 35%)`
            : `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${theme.palette.background.default} 35%)`,
        })}
      >
        <Stack spacing={3} sx={{ maxWidth: 1400, mx: 'auto' }}>
          <Card
            variant="outlined"
            sx={{
              borderRadius: 6,
              overflow: 'hidden',
              background:
                'radial-gradient(circle at top left, rgba(37,99,235,0.18), transparent 35%), linear-gradient(135deg, #0f172a 0%, #11243d 55%, #16324f 100%)',
              color: 'white',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack spacing={2}>
                <Chip
                  label={data?.summary?.status ?? 'Air quality'}
                  sx={{
                    alignSelf: 'flex-start',
                    bgcolor: 'rgba(255,255,255,0.12)',
                    color: 'white',
                    borderRadius: 999,
                  }}
                />
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  spacing={3}
                >
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 800, mb: 1 }}>
                      Kvalita ovzdusia - {data?.city ?? 'Bratislava'}
                    </Typography>
                    <Typography sx={{ maxWidth: 760, color: 'rgba(255,255,255,0.78)' }}>
                      Frontend uz bezi na nasich datach z databazy. Zobrazuje posledne meranie,
                      trendy pollutantov a historiu zaznamov z Django aplikacie.
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: { md: 260 } }}>
                    <Typography variant="overline" sx={{ opacity: 0.72 }}>
                      Posledne meranie
                    </Typography>
                    <Typography variant="h2" sx={{ fontWeight: 800 }}>
                      {formatValue(data?.latest?.aqi)}
                    </Typography>
                    <Typography sx={{ opacity: 0.76 }}>
                      {data?.latest?.time
                        ? new Date(data.latest.time).toLocaleString('sk-SK')
                        : 'Zatial bez dat'}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {loading && !data && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={20} />
              <Typography>Nacitavam data...</Typography>
            </Stack>
          )}

          {error && <Alert severity="warning">{error}</Alert>}

          <Grid container spacing={2.5}>
            {(data?.cards ?? []).map((card) => (
              <Grid key={card.key} item xs={12} sm={6} lg={3}>
                <SummaryCard card={card} />
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={2.5}>
            <Grid item xs={12} lg={8}>
              <Card variant="outlined" sx={{ borderRadius: 5, height: '100%' }}>
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="h6">Vyvoj merani</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Poslednych {data?.history?.length ?? 0} zaznamov z databazy.
                    </Typography>
                  </Stack>
                  <Divider sx={{ my: 2 }} />
                  {chartSeries.length ? (
                    <LineChart
                      height={320}
                      xAxis={[
                        {
                          scaleType: 'point',
                          data: chartLabels,
                          tickInterval: (value, index) =>
                            index === 0 || index === chartLabels.length - 1 || index % 4 === 0,
                        },
                      ]}
                      yAxis={[{ width: 52 }]}
                      series={chartSeries}
                      margin={{ top: 20, right: 24, bottom: 20, left: 10 }}
                      grid={{ horizontal: true }}
                    />
                  ) : (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      V databaze zatial nie su ziadne merania.
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} lg={4}>
              <Card variant="outlined" sx={{ borderRadius: 5, height: '100%' }}>
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="h6">Prehlad</Typography>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Pocet merani
                      </Typography>
                      <Typography variant="h4">{data?.summary?.measurements ?? 0}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Priemer AQI
                      </Typography>
                      <Typography variant="h4">
                        {formatValue(data?.summary?.average_aqi)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Max AQI za posledne zaznamy
                      </Typography>
                      <Typography variant="h4">
                        {formatValue(data?.summary?.max_aqi)}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card variant="outlined" sx={{ borderRadius: 5 }}>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="h6">Posledne zaznamy</Typography>
                <Typography variant="body2" color="text.secondary">
                  Tabulka poslednych merani z modelu `AirQuality`.
                </Typography>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cas</TableCell>
                      <TableCell>Mesto</TableCell>
                      <TableCell align="right">AQI</TableCell>
                      <TableCell align="right">SO2</TableCell>
                      <TableCell align="right">O3</TableCell>
                      <TableCell align="right">PM10</TableCell>
                      <TableCell align="right">NO2</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(data?.table ?? []).map((row) => (
                      <TableRow key={`${row.time}-${row.id}`} hover>
                        <TableCell>{row.time}</TableCell>
                        <TableCell>{row.city}</TableCell>
                        <TableCell align="right">{row.aqi}</TableCell>
                        <TableCell align="right">{row.so2}</TableCell>
                        <TableCell align="right">{row.o3}</TableCell>
                        <TableCell align="right">{row.pm10}</TableCell>
                        <TableCell align="right">{row.no2}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </AppTheme>
  );
}
