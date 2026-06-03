import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LogoutIcon from '@mui/icons-material/Logout';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import { alpha } from '@mui/material/styles';
import { LineChart } from '@mui/x-charts/LineChart';
import AppTheme from './shared-theme/AppTheme';

const IGNORED_FIELDS = new Set(['id', 'device_id', 'received_at', 'time', 'timestamp']);
const COLORS = ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d'];
const API_LIMIT = 30;
const BACKEND_WS_PORT = '8000';

function getBackendHost() {
  return window.location.hostname || '127.0.0.1';
}

function getWebSocketUrl(path) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${getBackendHost()}:${BACKEND_WS_PORT}${path}`;
}

function formatLabel(value) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }
  return String(value);
}

function getMeasurementFields(measurement) {
  return Object.keys(measurement ?? {}).filter((key) => !IGNORED_FIELDS.has(key));
}

function getNumericFields(measurements) {
  const fields = new Set();

  measurements.forEach((measurement) => {
    getMeasurementFields(measurement).forEach((field) => {
      if (typeof measurement[field] === 'number') {
        fields.add(field);
      }
    });
  });

  return Array.from(fields);
}

function flattenDevices(devices) {
  return devices.flatMap((device) =>
    (device.measurements ?? []).map((measurement) => ({
      device_id: device.device_id,
      ...measurement,
    })),
  );
}

function sortByTimeDesc(measurements) {
  return [...measurements].sort((a, b) => {
    const left = new Date(a.received_at ?? 0).getTime();
    const right = new Date(b.received_at ?? 0).getTime();
    return right - left;
  });
}

function mergeMeasurement(devices, deviceId, measurement) {
  const nextDevices = [...devices];
  const deviceIndex = nextDevices.findIndex((device) => device.device_id === deviceId);

  if (deviceIndex === -1) {
    nextDevices.unshift({
      device_id: deviceId,
      measurements: [measurement],
    });
    return nextDevices;
  }

  const device = nextDevices[deviceIndex];
  nextDevices[deviceIndex] = {
    ...device,
    measurements: [measurement, ...(device.measurements ?? [])].slice(0, API_LIMIT),
  };
  return nextDevices;
}

function TrendChip({ value }) {
  const label = value > 0 ? `+${value}` : value < 0 ? String(value) : '0';
  const color = value > 0 ? 'error' : value < 0 ? 'success' : 'default';

  return <Chip size="small" color={color} label={label} />;
}

function SummaryCard({ card }) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 2,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(245,247,250,0.82) 100%)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="overline" sx={{ letterSpacing: 0 }}>
              {card.label}
            </Typography>
            <TrendChip value={card.trend} />
          </Stack>
          <Typography variant="h4" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
            {formatValue(card.value)}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function DeviceRegistration({ authToken, disabled, onCreated }) {
  const [deviceId, setDeviceId] = useState('');
  const [fields, setFields] = useState([{ name: '', type: 'float' }]);
  const [createdToken, setCreatedToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateField(index, key, value) {
    setFields((currentFields) =>
      currentFields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, [key]: value } : field,
      ),
    );
  }

  function addField() {
    setFields((currentFields) => [...currentFields, { name: '', type: 'float' }]);
  }

  function removeField(index) {
    setFields((currentFields) => currentFields.filter((_, fieldIndex) => fieldIndex !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setCreatedToken('');

    const schema = fields.reduce((result, field) => {
      const name = field.name.trim();
      if (name) {
        result[name] = field.type;
      }
      return result;
    }, {});

    try {
      const response = await fetch('/devices/add_device/', {
        method: 'POST',
        headers: {
          Authorization: `Token ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_id: deviceId.trim(), schema }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? `Create device returned ${response.status}`);
      }

      setCreatedToken(payload.token);
      setDeviceId('');
      setFields([{ name: '', type: 'float' }]);
      onCreated();
    } catch {
      setError('Registracia zariadenia zlyhala.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          <Typography variant="h6">Registracia zariadenia</Typography>

          {disabled && (
            <Alert severity="info">
              Registracia zariadenia vyzaduje realne admin prihlasenie.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {createdToken && (
            <Alert severity="success">
              <Stack spacing={0.5}>
                <Typography variant="body2">Device token</Typography>
                <Typography component="code" sx={{ overflowWrap: 'anywhere' }}>
                  {createdToken}
                </Typography>
              </Stack>
            </Alert>
          )}

          <TextField
            disabled={disabled}
            fullWidth
            label="Device ID"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
            required
          />

          <Stack spacing={1.5}>
            {fields.map((field, index) => (
              <Stack
                key={index}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', sm: 'center' }}
              >
                <TextField
                  disabled={disabled}
                  fullWidth
                  label="Field"
                  value={field.name}
                  onChange={(event) => updateField(index, 'name', event.target.value)}
                  required
                />
                <Select
                  disabled={disabled}
                  value={field.type}
                  onChange={(event) => updateField(index, 'type', event.target.value)}
                  sx={{ minWidth: { sm: 130 } }}
                >
                  <MenuItem value="int">int</MenuItem>
                  <MenuItem value="float">float</MenuItem>
                  <MenuItem value="string">string</MenuItem>
                  <MenuItem value="bool">bool</MenuItem>
                </Select>
                <IconButton
                  aria-label="Odstranit field"
                  disabled={disabled || fields.length === 1}
                  onClick={() => removeField(index)}
                >
                  <DeleteIcon />
                </IconButton>
              </Stack>
            ))}
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button disabled={disabled} startIcon={<AddIcon />} onClick={addField} variant="outlined">
              Field
            </Button>
            <Button
              disabled={disabled || submitting}
              startIcon={submitting ? <CircularProgress size={18} /> : <SaveIcon />}
              type="submit"
              variant="contained"
            >
              Registrovat
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function MeasurementsExplorer({ deviceIds, measurements, selectedDeviceId, loading, onDeviceChange, onRefresh }) {
  const fields = useMemo(() => {
    const nextFields = new Set();
    measurements.slice(0, 15).forEach((measurement) => {
      getMeasurementFields(measurement).forEach((field) => nextFields.add(field));
    });
    return Array.from(nextFields);
  }, [measurements]);

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'center' }}
            gap={1.5}
          >
            <Box>
              <Typography variant="h6">Prehlad merani</Typography>
              <Typography variant="body2" color="text.secondary">
                Data z REST endpointu /devices/api/measurements/.
              </Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Select
                displayEmpty
                value={selectedDeviceId}
                onChange={(event) => onDeviceChange(event.target.value)}
                sx={{ minWidth: { sm: 220 } }}
              >
                <MenuItem value="">Vsetky zariadenia</MenuItem>
                {deviceIds.map((deviceId) => (
                  <MenuItem key={deviceId} value={deviceId}>
                    {deviceId}
                  </MenuItem>
                ))}
              </Select>
              <Button
                disabled={loading}
                startIcon={loading ? <CircularProgress size={18} /> : <RefreshIcon />}
                onClick={onRefresh}
                variant="outlined"
              >
                Obnovit
              </Button>
            </Stack>
          </Stack>

          <Divider />

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Cas</TableCell>
                  <TableCell>Zariadenie</TableCell>
                  {fields.map((field) => (
                    <TableCell key={field} align="right">
                      {formatLabel(field)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {measurements.slice(0, 15).map((row, index) => (
                  <TableRow key={`${row.device_id}-${row.received_at}-${index}`} hover>
                    <TableCell>
                      {row.received_at ? new Date(row.received_at).toLocaleString('sk-SK') : '--'}
                    </TableCell>
                    <TableCell>{row.device_id}</TableCell>
                    {fields.map((field) => (
                      <TableCell key={field} align="right">
                        {formatValue(row[field])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!measurements.length && (
                  <TableRow>
                    <TableCell colSpan={fields.length + 2}>
                      <Typography color="text.secondary">Ziadne merania.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function AirQualityDashboard({ authToken, isDevelopmentAccess, onLogout }) {
  const [devices, setDevices] = useState([]);
  const [liveDeviceIds, setLiveDeviceIds] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [apiMeasurements, setApiMeasurements] = useState([]);
  const [error, setError] = useState('');
  const [measurementsError, setMeasurementsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [measurementsLoading, setMeasurementsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [measurementsRefreshKey, setMeasurementsRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let socket = null;
    let reconnectTimeoutId = null;

    async function loadDevices() {
      try {
        setLoading(true);
        const headers = isDevelopmentAccess ? {} : { Authorization: `Token ${authToken}` };
        const response = await fetch(`/devices/api/?limit=${API_LIMIT}`, { headers });
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        const payload = await response.json();
        if (!cancelled) {
          setDevices(payload.devices ?? []);
          setError('');
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Nepodarilo sa nacitat zariadenia z Django backendu.');
          setLoading(false);
        }
      }
    }

    function connectSocket() {
      socket = new WebSocket(getWebSocketUrl('/ws/devices/measurements/'));

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (cancelled) return;

        if (payload.type === 'initial') {
          setDevices(payload.devices ?? []);
        }

        if (payload.type === 'new_measurement') {
          setDevices((currentDevices) =>
            mergeMeasurement(currentDevices, payload.device_id, payload.measurement ?? {}),
          );
        }

        setError('');
        setLoading(false);
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

    loadDevices();
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
  }, [authToken, isDevelopmentAccess, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    let socket = null;
    let reconnectTimeoutId = null;

    function connectSocket() {
      socket = new WebSocket(getWebSocketUrl('/ws/devices/'));

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (cancelled) return;

        if (payload.type === 'initial' || payload.type === 'device_list_update') {
          setLiveDeviceIds(payload.devices ?? []);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimeoutId = window.setTimeout(connectSocket, 1500);
      };
    }

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
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadMeasurements() {
      setMeasurementsLoading(true);
      setMeasurementsError('');

      const params = new URLSearchParams({ limit: String(API_LIMIT) });
      if (selectedDeviceId) {
        params.set('device_id', selectedDeviceId);
      }

      try {
        const response = await fetch(`/devices/api/measurements/?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Measurements API returned ${response.status}`);
        }
        const payload = await response.json();
        if (!cancelled) {
          setApiMeasurements(payload.measurements ?? []);
        }
      } catch {
        if (!cancelled) {
          setMeasurementsError('Nepodarilo sa nacitat prehlad merani.');
        }
      } finally {
        if (!cancelled) {
          setMeasurementsLoading(false);
        }
      }
    }

    loadMeasurements();

    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId, measurementsRefreshKey, refreshKey]);

  useEffect(() => {
    if (!selectedDeviceId) return undefined;

    let cancelled = false;
    let socket = null;
    let reconnectTimeoutId = null;

    function connectSocket() {
      socket = new WebSocket(getWebSocketUrl(`/ws/devices/${encodeURIComponent(selectedDeviceId)}/measurements/`));

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (cancelled) return;

        if (payload.type === 'initial') {
          setApiMeasurements(
            (payload.measurements ?? []).map((measurement) => ({
              device_id: payload.device_id,
              ...measurement,
            })),
          );
        }

        if (payload.type === 'new_measurement') {
          setApiMeasurements((currentMeasurements) => [
            { device_id: payload.device_id, ...(payload.measurement ?? {}) },
            ...currentMeasurements,
          ].slice(0, API_LIMIT));
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimeoutId = window.setTimeout(connectSocket, 1500);
      };
    }

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
  }, [selectedDeviceId]);

  const measurements = useMemo(() => sortByTimeDesc(flattenDevices(devices)), [devices]);
  const latestMeasurement = measurements[0] ?? null;
  const allFields = useMemo(() => getMeasurementFields(latestMeasurement), [latestMeasurement]);
  const numericFields = useMemo(() => getNumericFields(measurements), [measurements]);
  const tableFields = useMemo(() => {
    const fields = new Set();
    measurements.slice(0, 10).forEach((measurement) => {
      getMeasurementFields(measurement).forEach((field) => fields.add(field));
    });
    return Array.from(fields);
  }, [measurements]);

  const cards = allFields.slice(0, 4).map((field) => {
    const sameFieldMeasurements = measurements.filter((measurement) => measurement[field] !== undefined);
    const current = sameFieldMeasurements[0]?.[field];
    const previous = sameFieldMeasurements[1]?.[field] ?? current;
    const trend =
      typeof current === 'number' && typeof previous === 'number'
        ? Number((current - previous).toFixed(2))
        : 0;

    return {
      key: field,
      label: formatLabel(field),
      value: current,
      trend,
    };
  });

  const chartFields = numericFields.slice(0, 5);
  const chartRows = [...measurements].reverse().slice(-30);
  const chartSeries = chartFields.map((field, index) => ({
    id: field,
    label: formatLabel(field),
    data: chartRows.map((measurement) =>
      typeof measurement[field] === 'number' ? measurement[field] : null,
    ),
    color: COLORS[index % COLORS.length],
    curve: 'monotoneX',
    showMark: false,
  }));
  const chartLabels = chartRows.map((measurement) =>
    measurement.received_at ? new Date(measurement.received_at).toLocaleTimeString('sk-SK') : '',
  );
  const deviceIds = useMemo(() => {
    const ids = new Set([...liveDeviceIds, ...devices.map((device) => device.device_id)]);
    return Array.from(ids).sort();
  }, [devices, liveDeviceIds]);

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
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            gap={2}
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Admin panel
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Zariadenia a merania
              </Typography>
            </Box>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              justifyContent="flex-end"
              alignItems={{ xs: 'stretch', sm: 'center' }}
              sx={{ ml: { sm: 'auto' } }}
            >
              <Button startIcon={<LogoutIcon />} onClick={onLogout} variant="outlined">
                Odhlasit
              </Button>
            </Stack>
          </Stack>

          <Card
            variant="outlined"
            sx={{
              borderRadius: 2,
              overflow: 'hidden',
              background:
                'radial-gradient(circle at top left, rgba(37,99,235,0.18), transparent 35%), linear-gradient(135deg, #0f172a 0%, #11243d 55%, #16324f 100%)',
              color: 'white',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack spacing={2}>
                <Chip
                  label="Live zariadenia"
                  sx={{
                    alignSelf: 'flex-start',
                    bgcolor: 'rgba(255,255,255,0.12)',
                    color: 'white',
                    borderRadius: 2,
                  }}
                />
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  spacing={3}
                >
                  <Box>
                    <Typography variant="h3" sx={{ fontWeight: 800, mb: 1 }}>
                      Dashboard merani
                    </Typography>
                    <Typography sx={{ maxWidth: 760, color: 'rgba(255,255,255,0.78)' }}>
                      Zobrazuje polia dynamicky podla JSON dat zo zariadeni.
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: { md: 260 } }}>
                    <Typography variant="overline" sx={{ opacity: 0.72 }}>
                      Posledne zariadenie
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>
                      {latestMeasurement?.device_id ?? '--'}
                    </Typography>
                    <Typography sx={{ opacity: 0.76 }}>
                      {latestMeasurement?.received_at
                        ? new Date(latestMeasurement.received_at).toLocaleString('sk-SK')
                        : 'Zatial bez dat'}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {loading && !measurements.length && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={20} />
              <Typography>Nacitavam data...</Typography>
            </Stack>
          )}

          {error && <Alert severity="warning">{error}</Alert>}
          {isDevelopmentAccess && (
            <Alert severity="info">
              Bezi vyvojovy vstup bez admin tokenu. Dashboard funguje, registracia zariadeni je vypnuta.
            </Alert>
          )}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
              gap: 2.5,
            }}
          >
            {cards.map((card) => (
              <Box key={card.key}>
                <SummaryCard card={card} />
              </Box>
            ))}
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(320px, 1fr)' },
              gap: 2.5,
              alignItems: 'start',
            }}
          >
            <Box>
              <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="h6">Vyvoj ciselnych poli</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Poslednych {chartRows.length} merani napriec zariadeniami.
                    </Typography>
                  </Stack>
                  <Divider sx={{ my: 2 }} />
                  {chartSeries.length ? (
                    <LineChart
                      height={320}
                      xAxis={[{ scaleType: 'point', data: chartLabels }]}
                      yAxis={[{ width: 52 }]}
                      series={chartSeries}
                      margin={{ top: 20, right: 24, bottom: 20, left: 10 }}
                      grid={{ horizontal: true }}
                    />
                  ) : (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      Zatial nie su dostupne ziadne ciselne polia pre graf.
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Box>

            <Box>
              <Stack spacing={2.5}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent>
                    <Stack spacing={2}>
                      <Typography variant="h6">Prehlad</Typography>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Pocet zariadeni REST
                        </Typography>
                        <Typography variant="h4">{devices.length}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Live zariadenia WS
                        </Typography>
                        <Typography variant="h4">{liveDeviceIds.length}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Merania v dashboarde
                        </Typography>
                        <Typography variant="h4">{measurements.length}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Detegovane polia
                        </Typography>
                        <Typography variant="h4">{tableFields.length}</Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
                <DeviceRegistration
                  authToken={authToken}
                  disabled={isDevelopmentAccess}
                  onCreated={() => setRefreshKey((currentKey) => currentKey + 1)}
                />
              </Stack>
            </Box>
          </Box>

          {measurementsError && <Alert severity="warning">{measurementsError}</Alert>}
          <MeasurementsExplorer
            deviceIds={deviceIds}
            measurements={apiMeasurements}
            selectedDeviceId={selectedDeviceId}
            loading={measurementsLoading}
            onDeviceChange={setSelectedDeviceId}
            onRefresh={() => setMeasurementsRefreshKey((currentKey) => currentKey + 1)}
          />

          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="h6">Posledne zaznamy</Typography>
                <Typography variant="body2" color="text.secondary">
                  Tabulka sa sklada z poli, ktore realne prisli v JSON meraniach.
                </Typography>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Cas</TableCell>
                      <TableCell>Zariadenie</TableCell>
                      {tableFields.map((field) => (
                        <TableCell key={field} align="right">
                          {formatLabel(field)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {measurements.slice(0, 10).map((row, index) => (
                      <TableRow key={`${row.device_id}-${row.received_at}-${index}`} hover>
                        <TableCell>
                          {row.received_at ? new Date(row.received_at).toLocaleString('sk-SK') : '--'}
                        </TableCell>
                        <TableCell>{row.device_id}</TableCell>
                        {tableFields.map((field) => (
                          <TableCell key={field} align="right">
                            {formatValue(row[field])}
                          </TableCell>
                        ))}
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
