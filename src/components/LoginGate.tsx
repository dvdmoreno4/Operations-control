import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, errorMessage } from '../lib/apiClient';
import { Alert, Field, inputClass, primaryButton } from './ui';

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth', 'POST', { password });
      onLoggedIn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-xl p-6 space-y-4 max-w-sm mx-auto mt-12">
      <h2 className="text-lg font-semibold tracking-tight">Acceso</h2>
      <Field label="Clave compartida">
        <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
      </Field>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <button type="submit" className={`${primaryButton} w-full`} disabled={busy}>
        {busy ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}

/** Renders children only with a valid session; children get a logout callback. */
export function LoginGate({ children }: { children: (logout: () => Promise<void>) => ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ authenticated: boolean }>('/api/auth')
      .then((session) => setAuthenticated(session.authenticated))
      .catch((e) => {
        setAuthenticated(false);
        setError(errorMessage(e));
      });
  }, []);

  async function logout() {
    await api('/api/auth', 'DELETE').catch(() => undefined);
    setAuthenticated(false);
  }

  if (authenticated === null) return <p className="text-sm text-ink/60 p-6">Cargando...</p>;
  if (!authenticated) {
    return (
      <>
        {error && <Alert>{error}</Alert>}
        <LoginForm onLoggedIn={() => setAuthenticated(true)} />
      </>
    );
  }
  return <>{children(logout)}</>;
}
