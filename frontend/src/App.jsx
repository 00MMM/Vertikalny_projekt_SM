import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  CssBaseline,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import AirQualityDashboard from './AirQualityDashboard.jsx';
import AppTheme from './shared-theme/AppTheme';

const TOKEN_KEY = 'adminToken';
const DEV_TOKEN = 'dev-bypass';

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? `Login returned ${response.status}`);
      }

      localStorage.setItem(TOKEN_KEY, payload.token);
      onLogin(payload.token);
    } catch {
      setError('Prihlasenie zlyhalo.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDevelopmentAccess() {
    localStorage.setItem(TOKEN_KEY, DEV_TOKEN);
    onLogin(DEV_TOKEN);
  }

  return (
    <AppTheme>
      <CssBaseline enableColorScheme />
      <Box
        sx={(theme) => ({
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          px: 2,
          background: theme.vars
            ? `linear-gradient(180deg, rgba(${theme.vars.palette.primary.mainChannel} / 0.12), rgba(${theme.vars.palette.background.defaultChannel} / 1) 42%)`
            : `linear-gradient(180deg, ${theme.palette.primary.light}, ${theme.palette.background.default} 42%)`,
        })}
      >
        <Card variant="outlined" sx={{ width: '100%', maxWidth: 420, borderRadius: 2 }}>
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  Prihlasenie
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Admin pristup k zariadeniam
                </Typography>
              </Box>

              {error && <Alert severity="error">{error}</Alert>}

              <TextField
                autoComplete="username"
                fullWidth
                label="Meno"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
              <TextField
                autoComplete="current-password"
                fullWidth
                label="Heslo"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <Button
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={18} /> : <LoginIcon />}
                type="submit"
                variant="contained"
              >
                Prihlasit
              </Button>
              <Button onClick={handleDevelopmentAccess} variant="outlined">
                Pokracovat bez prihlasenia
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </AppTheme>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');

  async function handleLogout() {
    const currentToken = localStorage.getItem(TOKEN_KEY);

    if (currentToken) {
      try {
        await fetch('/api/auth/logout/', {
          method: 'POST',
          headers: { Authorization: `Token ${currentToken}` },
        });
      } catch {
        // Local logout still clears the session when the backend is unavailable.
      }
    }

    localStorage.removeItem(TOKEN_KEY);
    setToken('');
  }

  if (!token) {
    return <LoginPage onLogin={setToken} />;
  }

  return (
    <AirQualityDashboard
      authToken={token}
      isDevelopmentAccess={token === DEV_TOKEN}
      onLogout={handleLogout}
    />
  );
}
