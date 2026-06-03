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
const USERNAME_KEY = 'adminUsername';
const DEV_TOKEN = 'dev-bypass';
const DEV_USERNAME = 'Vývojový vstup';

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
      localStorage.setItem(USERNAME_KEY, payload.username ?? username);
      onLogin(payload.token, payload.username ?? username);
    } catch {
      setError('Prihlásenie zlyhalo.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDevelopmentAccess() {
    const nextUsername = username.trim() || DEV_USERNAME;
    localStorage.setItem(TOKEN_KEY, DEV_TOKEN);
    localStorage.setItem(USERNAME_KEY, nextUsername);
    onLogin(DEV_TOKEN, nextUsername);
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
                  Prihlásenie
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
                Prihlásiť
              </Button>
              <Button onClick={handleDevelopmentAccess} variant="outlined">
                Pokračovať bez prihlásenia
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
  const [username, setUsername] = useState(() => {
    const storedUsername = localStorage.getItem(USERNAME_KEY) ?? '';
    const storedToken = localStorage.getItem(TOKEN_KEY) ?? '';
    return storedUsername || (storedToken === DEV_TOKEN ? DEV_USERNAME : '');
  });

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
    localStorage.removeItem(USERNAME_KEY);
    setToken('');
    setUsername('');
  }

  if (!token) {
    return (
      <LoginPage
        onLogin={(nextToken, nextUsername) => {
          setToken(nextToken);
          setUsername(nextUsername);
        }}
      />
    );
  }

  return (
    <AirQualityDashboard
      authToken={token}
      username={username || (token === DEV_TOKEN ? DEV_USERNAME : '')}
      isDevelopmentAccess={token === DEV_TOKEN}
      onLogout={handleLogout}
    />
  );
}
