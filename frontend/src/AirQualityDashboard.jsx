import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  IconButton,
  ListItemText,
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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LogoutIcon from '@mui/icons-material/Logout';
import SaveIcon from '@mui/icons-material/Save';
import { alpha } from '@mui/material/styles';
import { LineChart } from '@mui/x-charts/LineChart';
import AppTheme from './shared-theme/AppTheme';

const IGNORED_FIELDS = new Set(['id', 'device_id', 'received_at', 'time', 'timestamp']);
const COLORS = ['#2563eb', '#0f766e', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d'];
const API_LIMIT = 30;
const BACKEND_WS_PORT = '8000';
const DEVICE_OFFLINE_AFTER_MS = 20000;
const HIDDEN_DEVICE_IDS = new Set(['django-listener']);
const SELECTED_DEVICE_KEY = 'selectedDashboardDeviceId';

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
      total_measurements: 1,
      measurements: [measurement],
    });
    return nextDevices;
  }

  const device = nextDevices[deviceIndex];
  const currentTotal =
    device.total_measurements ?? device.measurements_count ?? device.measurements?.length ?? 0;
  nextDevices[deviceIndex] = {
    ...device,
    total_measurements: currentTotal + 1,
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
            {card.showTrend && <TrendChip value={card.trend} />}
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
      setError('Registrácia zariadenia zlyhala.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          <Typography variant="h6">Registrácia zariadenia</Typography>

          {disabled && (
            <Alert severity="info">
              Registrácia zariadenia vyžaduje reálne admin prihlásenie.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {createdToken && (
            <Alert severity="success">
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Tento token vidíte iba raz. Uložte si ho, budete ho potrebovať v zariadení.
                </Typography>
                <Typography variant="body2">Token zariadenia</Typography>
                <Typography component="code" sx={{ overflowWrap: 'anywhere' }}>
                  {createdToken}
                </Typography>
              </Stack>
            </Alert>
          )}

          <TextField
            disabled={disabled}
            fullWidth
            label="ID zariadenia"
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
                  label="Názov merania"
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
                  aria-label="Odstrániť pole"
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
              Pole
            </Button>
            <Button
              disabled={disabled || submitting}
              startIcon={submitting ? <CircularProgress size={18} /> : <SaveIcon />}
              type="submit"
              variant="contained"
            >
              Registrovať
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function MeasurementsExplorer({ deviceIds, measurements, selectedDeviceId, onDeviceChange, statusByDeviceId }) {
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
              <Typography variant="h6">Prehľad meraní</Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Select
                displayEmpty
                value={selectedDeviceId}
                onChange={(event) => onDeviceChange(event.target.value)}
                sx={{ minWidth: { sm: 220 } }}
              >
                <MenuItem value="">Všetky zariadenia</MenuItem>
                {deviceIds.map((deviceId) => (
                  <MenuItem key={deviceId} value={deviceId}>
                    {deviceId}
                  </MenuItem>
                ))}
              </Select>
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
                        {formatValue(
                          field.toLowerCase() === 'status' && statusByDeviceId[row.device_id]
                            ? statusByDeviceId[row.device_id]
                            : row[field],
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!measurements.length && (
                  <TableRow>
                    <TableCell colSpan={fields.length + 2}>
                  <Typography color="text.secondary">Žiadne merania.</Typography>
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

export default function AirQualityDashboard({ authToken, username, isDevelopmentAccess, onLogout }) {
  const [devices, setDevices] = useState([]);
  const [liveDeviceIds, setLiveDeviceIds] = useState([]);
  const [selectedChartDeviceId, setSelectedChartDeviceId] = useState(
    () => localStorage.getItem(SELECTED_DEVICE_KEY) ?? '',
  );
  const [selectedChartFields, setSelectedChartFields] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [apiMeasurements, setApiMeasurements] = useState([]);
  const [error, setError] = useState('');
  const [measurementsError, setMeasurementsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

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
          setError('Nepodarilo sa načítať zariadenia z Django backendu.');
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
          setMeasurementsError('Nepodarilo sa načítať prehľad meraní.');
        }
      }
    }

    loadMeasurements();

    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId, refreshKey]);

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

  const visibleDevices = useMemo(
    () => devices.filter((device) => !HIDDEN_DEVICE_IDS.has(device.device_id)),
    [devices],
  );
  const measurements = useMemo(() => sortByTimeDesc(flattenDevices(visibleDevices)), [visibleDevices]);
  const chartDeviceIds = useMemo(
    () => visibleDevices.map((device) => device.device_id).filter(Boolean).sort(),
    [visibleDevices],
  );
  useEffect(() => {
    if (!chartDeviceIds.length) {
      return;
    }

    if (!selectedChartDeviceId || !chartDeviceIds.includes(selectedChartDeviceId)) {
      const storedDeviceId = localStorage.getItem(SELECTED_DEVICE_KEY);
      const nextDeviceId =
        storedDeviceId && chartDeviceIds.includes(storedDeviceId)
          ? storedDeviceId
          : chartDeviceIds[0];
      setSelectedChartDeviceId(nextDeviceId);
      localStorage.setItem(SELECTED_DEVICE_KEY, nextDeviceId);
      return;
    }

    localStorage.setItem(SELECTED_DEVICE_KEY, selectedChartDeviceId);
  }, [chartDeviceIds, selectedChartDeviceId]);

  const chartMeasurements = useMemo(() => {
    if (!selectedChartDeviceId) {
      return [];
    }

    const selectedDevice = visibleDevices.find((device) => device.device_id === selectedChartDeviceId);
    return sortByTimeDesc(
      (selectedDevice?.measurements ?? []).map((measurement) => ({
        device_id: selectedChartDeviceId,
        ...measurement,
      })),
    );
  }, [visibleDevices, selectedChartDeviceId]);
  const latestMeasurement = measurements[0] ?? null;
  const latestActiveMeasurement =
    measurements.find(
      (measurement) =>
        measurement.received_at &&
        currentTime - new Date(measurement.received_at).getTime() <= DEVICE_OFFLINE_AFTER_MS,
    ) ?? null;
  const selectedLatestMeasurement = chartMeasurements[0] ?? null;
  const allFields = useMemo(() => getMeasurementFields(selectedLatestMeasurement), [selectedLatestMeasurement]);
  const chartNumericFields = useMemo(() => getNumericFields(chartMeasurements), [chartMeasurements]);
  const chartFieldColors = useMemo(
    () =>
      chartNumericFields.reduce((result, field, index) => {
        result[field] = COLORS[index % COLORS.length];
        return result;
      }, {}),
    [chartNumericFields],
  );
  useEffect(() => {
    setSelectedChartFields((currentFields) =>
      currentFields.filter((field) => chartNumericFields.includes(field)),
    );
  }, [chartNumericFields]);
  const tableFields = useMemo(() => {
    const fields = new Set();
    chartMeasurements.slice(0, 10).forEach((measurement) => {
      getMeasurementFields(measurement).forEach((field) => fields.add(field));
    });
    return Array.from(fields);
  }, [chartMeasurements]);

  const selectedDeviceIsConnected =
    selectedLatestMeasurement?.received_at &&
    currentTime - new Date(selectedLatestMeasurement.received_at).getTime() <= DEVICE_OFFLINE_AFTER_MS;

  const cards = allFields.slice(0, 4).map((field) => {
    const sameFieldMeasurements = chartMeasurements.filter((measurement) => measurement[field] !== undefined);
    const current =
      field.toLowerCase() === 'status'
        ? selectedDeviceIsConnected
          ? 'connected'
          : 'disconnected'
        : sameFieldMeasurements[0]?.[field];
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
      showTrend: typeof current === 'number',
    };
  });

  const chartFields = selectedChartFields.length
    ? selectedChartFields.filter((field) => chartNumericFields.includes(field))
    : chartNumericFields;
  const chartRows = [...chartMeasurements].reverse().slice(-30);
  const chartSeries = chartFields.map((field) => ({
    id: field,
    label: formatLabel(field),
    data: chartRows.map((measurement) =>
      typeof measurement[field] === 'number' ? measurement[field] : null,
    ),
    color: chartFieldColors[field],
    curve: 'monotoneX',
    showMark: false,
  }));
  const chartLabels = chartRows.map((measurement) =>
    measurement.received_at ? new Date(measurement.received_at).toLocaleTimeString('sk-SK') : '',
  );
  const explorerMeasurements = selectedDeviceId ? apiMeasurements : measurements;
  const deviceIds = useMemo(() => {
    const ids = new Set([
      ...liveDeviceIds.filter((deviceId) => !HIDDEN_DEVICE_IDS.has(deviceId)),
      ...visibleDevices.map((device) => device.device_id),
    ]);
    return Array.from(ids).sort();
  }, [visibleDevices, liveDeviceIds]);
  useEffect(() => {
    if (selectedDeviceId && !deviceIds.includes(selectedDeviceId)) {
      setSelectedDeviceId('');
    }
  }, [deviceIds, selectedDeviceId]);
  const deviceStatuses = useMemo(
    () =>
      deviceIds.map((deviceId) => {
        const device = visibleDevices.find((currentDevice) => currentDevice.device_id === deviceId);
        const latestDeviceMeasurement = sortByTimeDesc(device?.measurements ?? [])[0];
        const latestTime = latestDeviceMeasurement?.received_at
          ? new Date(latestDeviceMeasurement.received_at).getTime()
          : 0;
        const isConnected = latestTime > 0 && currentTime - latestTime <= DEVICE_OFFLINE_AFTER_MS;

        return {
          deviceId,
          isConnected,
          latestTime,
        };
      }),
    [currentTime, deviceIds, visibleDevices],
  );
  const statusByDeviceId = useMemo(
    () =>
      deviceStatuses.reduce((result, status) => {
        result[status.deviceId] = status.isConnected ? 'connected' : 'disconnected';
        return result;
      }, {}),
    [deviceStatuses],
  );
  const connectedDevicesCount = deviceStatuses.filter((status) => status.isConnected).length;
  const connectedDeviceNames = deviceStatuses
    .filter((status) => status.isConnected)
    .map((status) => status.deviceId);
  const connectedDevicesTooltip = connectedDeviceNames.length
    ? connectedDeviceNames.join(', ')
    : 'Žiadne aktívne zariadenia';
  const registeredDevicesTooltip = visibleDevices.length
    ? visibleDevices.map((device) => device.device_id).join(', ')
    : 'Žiadne registrované zariadenia';
  const measurementTypesTooltip = tableFields.length
    ? tableFields.map(formatLabel).join(', ')
    : 'Žiadne typy meraní';
  const totalMeasurementsCount = visibleDevices.reduce(
    (total, device) =>
      total + (device.total_measurements ?? device.measurements_count ?? device.measurements?.length ?? 0),
    0,
  );

  const chartFieldsLabel = selectedChartFields.length
    ? selectedChartFields.map(formatLabel).join(', ')
    : 'Všetky';

  function handleChartFieldsChange(event) {
    const value = event.target.value;
    const nextFields = typeof value === 'string' ? value.split(',') : value;

    setSelectedChartFields(nextFields.includes('__all__') ? [] : nextFields);
  }

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
        <Stack spacing={3} sx={{ maxWidth: 1920, mx: 'auto' }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            gap={2}
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                {username || 'Prihlásený používateľ'}
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
                Odhlásiť
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
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="center"
                  alignItems={{ xs: 'stretch', md: 'center' }}
                  spacing={{ xs: 3, md: 8 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="overline" sx={{ opacity: 0.72 }}>
                      Posledné aktívne zariadenie
                    </Typography>
                    <Typography variant="h3" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>
                      {latestActiveMeasurement?.device_id ?? '--'}
                    </Typography>
                    <Typography sx={{ opacity: 0.76 }}>
                      {latestActiveMeasurement?.received_at
                        ? new Date(latestActiveMeasurement.received_at).toLocaleString('sk-SK')
                        : 'Zatiaľ bez aktívneho zariadenia'}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: { md: '0 0 420px' }, width: { xs: '100%', md: 420 }, maxWidth: '100%' }}>
                    <Typography variant="overline" sx={{ opacity: 0.72 }}>
                      Zobraziť zariadenie
                    </Typography>
                    <Select
                      displayEmpty
                      disabled={!chartDeviceIds.length}
                      value={selectedChartDeviceId}
                      onChange={(event) => {
                        const nextDeviceId = event.target.value;
                        setSelectedChartDeviceId(nextDeviceId);
                        localStorage.setItem(SELECTED_DEVICE_KEY, nextDeviceId);
                      }}
                      sx={{
                        mt: 1,
                        width: '100%',
                        minHeight: 64,
                        bgcolor: 'rgba(255,255,255,0.12)',
                        color: 'white',
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: 'rgba(255,255,255,0.28)',
                        },
                        '& .MuiSelect-select': {
                          py: 1.75,
                        },
                        '& .MuiSvgIcon-root': {
                          color: 'white',
                        },
                      }}
                    >
                      {!chartDeviceIds.length && <MenuItem value="">Žiadne zariadenia</MenuItem>}
                      {chartDeviceIds.map((deviceId) => (
                        <MenuItem key={deviceId} value={deviceId}>
                          {deviceId}
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {loading && !measurements.length && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={20} />
              <Typography>Načítavam dáta...</Typography>
            </Stack>
          )}

          {error && <Alert severity="warning">{error}</Alert>}
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
                <CardContent sx={{ height: '100%' }}>
                  <Stack spacing={1}>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      justifyContent="space-between"
                      alignItems={{ xs: 'stretch', md: 'flex-start' }}
                      gap={{ xs: 2, md: 6 }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h6">Vývoj číselných meraní</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Posledných {chartRows.length} meraní zo zariadenia.
                        </Typography>
                      </Box>
                      <Box sx={{ minWidth: { md: 300 }, ml: { md: 'auto' } }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          Zobrazenie v grafe
                        </Typography>
                        <Select
                          disabled={!chartNumericFields.length}
                          displayEmpty
                          multiple
                          value={selectedChartFields}
                          onChange={handleChartFieldsChange}
                          renderValue={() => chartFieldsLabel}
                          sx={{ minWidth: { xs: '100%', md: 300 } }}
                        >
                          <MenuItem value="__all__">
                            <Checkbox checked={!selectedChartFields.length} size="small" />
                            <ListItemText primary="Všetky" />
                          </MenuItem>
                          {chartNumericFields.map((field) => (
                            <MenuItem key={field} value={field}>
                              <Checkbox checked={selectedChartFields.includes(field)} size="small" />
                              <ListItemText primary={formatLabel(field)} />
                            </MenuItem>
                          ))}
                        </Select>
                      </Box>
                    </Stack>
                  </Stack>
                  <Divider sx={{ my: 2 }} />
                  {chartSeries.length ? (
                    <LineChart
                      height={540}
                      xAxis={[{ scaleType: 'point', data: chartLabels }]}
                      yAxis={[{ width: 52 }]}
                      series={chartSeries}
                      margin={{ top: 20, right: 24, bottom: 20, left: 10 }}
                      grid={{ horizontal: true }}
                    />
                  ) : (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      Zatiaľ nie sú dostupné žiadne číselné merania pre graf.
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
                      <Typography variant="h6">Prehľad</Typography>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Registrované zariadenia
                        </Typography>
                        <Tooltip arrow title={registeredDevicesTooltip}>
                          <Typography variant="h4" sx={{ display: 'inline-block' }}>
                            {visibleDevices.length}
                          </Typography>
                        </Tooltip>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Aktívne zariadenia
                        </Typography>
                        <Tooltip arrow title={connectedDevicesTooltip}>
                          <Typography variant="h4" sx={{ display: 'inline-block' }}>
                            {connectedDevicesCount}
                          </Typography>
                        </Tooltip>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Celkové merania
                        </Typography>
                        <Typography variant="h4">{totalMeasurementsCount}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Typy meraní
                        </Typography>
                        <Tooltip arrow title={measurementTypesTooltip}>
                          <Typography variant="h4" sx={{ display: 'inline-block' }}>
                            {tableFields.length}
                          </Typography>
                        </Tooltip>
                      </Box>
                      <Stack spacing={1.25}>
                        <Typography align="center" variant="body2" color="text.secondary">
                          Stav zariadení
                        </Typography>
                        {deviceStatuses.map((status) => (
                          <Stack
                            key={status.deviceId}
                            direction="row"
                            justifyContent="center"
                            alignItems="center"
                            gap={1.5}
                            sx={{
                              minHeight: 36,
                              px: 1.5,
                              py: 0.75,
                              borderRadius: 1.5,
                              bgcolor: 'action.hover',
                            }}
                          >
                            <Typography
                              sx={{
                                flex: '1 1 auto',
                                minWidth: 0,
                                overflowWrap: 'anywhere',
                                textAlign: 'center',
                              }}
                            >
                              {status.deviceId}
                            </Typography>
                            <Chip
                              color={status.isConnected ? 'success' : 'default'}
                              label={status.isConnected ? 'Connected' : 'Disconnected'}
                              size="small"
                              sx={{ minWidth: 112 }}
                            />
                          </Stack>
                        ))}
                        {!deviceStatuses.length && (
                          <Typography color="text.secondary" variant="body2">
                            Žiadne zariadenia.
                          </Typography>
                        )}
                      </Stack>
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
            measurements={explorerMeasurements}
            selectedDeviceId={selectedDeviceId}
            onDeviceChange={setSelectedDeviceId}
            statusByDeviceId={statusByDeviceId}
          />

        </Stack>
      </Box>
    </AppTheme>
  );
}
