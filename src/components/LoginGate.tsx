import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, errorMessage } from '../lib/apiClient';
import { Alert, Field, inputClass, primaryButton } from './ui';

/** What children of LoginGate get: logout and whether the session is admin. */
export type Session = { logout: () => Promise<void>; admin: boolean };

function LoginForm({ onLoggedIn }: { onLoggedIn: (admin: boolean) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLoggedIn((await api<{ admin: boolean }>('/api/auth', 'POST', { password })).admin);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass rounded-xl p-6 space-y-4 max-w-sm mx-auto mt-12">
      <h2 className="text-lg font-semibold tracking-tight">Acceso</h2>
      <Field label="Clave (compartida o de administrador)">
        <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
      </Field>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <button type="submit" className={`${primaryButton} w-full`} disabled={busy}>
        {busy ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}

/** Renders children only with a valid session; children get logout and the admin flag. */
export function LoginGate({ children }: { children: (session: Session) => ReactNode }) {
  /** null while loading, false when logged out, otherwise the role. */
  const [state, setState] = useState<null | false | { admin: boolean }>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ authenticated: boolean; admin: boolean }>('/api/auth')
      .then((session) => setState(session.authenticated ? { admin: session.admin } : false))
      .catch((e) => {
        setState(false);
        setError(errorMessage(e));
      });
  }, []);

  async function logout() {
    await api('/api/auth', 'DELETE').catch(() => undefined);
    setState(false);
  }

  if (state === null) return <p className="text-sm text-ink/60 p-6">Cargando...</p>;
  if (state === false) {
    return (
      <>
        {error && <Alert>{error}</Alert>}
        <LoginForm onLoggedIn={(admin) => setState({ admin })} />
      </>
    );
  }
  return <>{children({ logout, admin: state.admin })}</>;
}
