import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { post } from '../lib/api';
import { useAuth } from '../lib/context';
import { Button, Field, Input, Spinner, useDocumentTitle } from '../components/ui';

export default function Login() {
  const { status, loading, refresh } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle('Sign in');

  if (loading || !status) return <Spinner />;
  if (status.user) return <Navigate to={params.get('next') ?? '/'} replace />;
  const setup = status.needsSetup;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (setup) await post('/auth/setup', { username, displayName: displayName || username, password });
      else if (mode === 'register') await post('/auth/register', { username, displayName: displayName || username, password });
      else await post('/auth/login', { username, password });
      await refresh();
    } catch (err) {
      const e2 = err as Error & { details?: { message: string }[] };
      setError(e2.details?.[0]?.message ?? e2.message);
    } finally {
      setBusy(false);
    }
  }

  const creating = setup || mode === 'register';
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-lg">
            <BookOpen className="size-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Fluent Path</h1>
          <p className="mt-1 text-muted">{setup ? 'Welcome! Create your account to begin.' : 'Your English journey from B1 to C1.'}</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-surface p-5 ring-1 ring-border">
          {creating && (
            <Field label="Your name" hint="Shown on your dashboard.">
              {(id) => <Input id={id} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />}
            </Field>
          )}
          <Field label="Username">
            {(id) => <Input id={id} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" required />}
          </Field>
          <Field label="Password" hint={creating ? 'At least 8 characters.' : undefined}>
            {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={creating ? 'new-password' : 'current-password'} required />}
          </Field>
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" block size="lg" loading={busy}>
            {setup ? 'Create account' : mode === 'register' ? 'Create account' : 'Sign in'}
          </Button>
          {setup && <p className="text-xs text-muted">This first account can also manage course content (admin).</p>}
        </form>
        {!setup && status.allowRegistration && (
          <p className="mt-4 text-center text-sm text-muted">
            {mode === 'login' ? 'New here? ' : 'Have an account? '}
            <button type="button" className="font-semibold text-primary" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
