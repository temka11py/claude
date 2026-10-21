import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { BrandMark } from '../components/AppShell';
import { Button } from '../components/ui';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'h-11 rounded-xl border border-line bg-surface px-3.5 text-ink outline-none transition-colors placeholder:text-muted focus:border-shu';

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { L } = useI18n();
  const points = [
    L('Хирагана, катаканаас эхлээд N5 хүртэлх 14 модуль', '14 modules from kana to N5'),
    L('Давталтын ухаалаг систем (SRS)', 'Spaced-repetition review'),
    L('Өгүүллэг, сонсгол, ярих дасгал', 'Stories, listening and speaking'),
    L('JLPT N5 загвар шалгалт', 'JLPT N5 mock exam'),
  ];
  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-shu p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10 [&>rect]:fill-white/15" />
          <span className="text-lg font-semibold">Hanamaru</span>
        </div>
        <div>
          <p className="brush text-[9rem] leading-none opacity-95">花丸</p>
          <p className="mt-6 max-w-md text-xl font-medium leading-relaxed">{L('Япон хэлийг монгол тайлбартайгаар, алхам алхмаар JLPT N5 хүртэл.', 'Japanese explained in Mongolian, step by step to JLPT N5.')}</p>
          <ul className="mt-6 flex flex-col gap-2 text-white/85">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-white/80" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="jp text-sm text-white/70">はなまる — よくできました！</p>
        <div className="pointer-events-none absolute -bottom-24 -right-24 size-96 rounded-full border-[28px] border-white/10" />
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="text-lg font-semibold text-ink">Hanamaru</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function errorText(e: unknown, L: (mn: string, en: string) => string) {
  if (e instanceof ApiError) {
    if (e.status === 401) return L('Имэйл эсвэл нууц үг буруу байна.', 'Invalid email or password.');
    if (e.status === 409) return L('Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна.', 'This email is already registered.');
    if (e.status === 429) return L('Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.', 'Too many attempts. Please wait and try again.');
    if (e.status === 400) return L('Мэдээллээ шалгана уу. Нууц үг дор хаяж 8 тэмдэгттэй байх ёстой.', 'Please check your details. Password must be at least 8 characters.');
  }
  return L('Сервертэй холбогдож чадсангүй.', 'Could not reach the server.');
}

export function Login() {
  const { login } = useAuth();
  const { L } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(errorText(err, L));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={L('Тавтай морил', 'Welcome back')} subtitle={L('Сургалтаа үргэлжлүүлэхийн тулд нэвтэрнэ үү.', 'Log in to continue learning.')}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={L('Имэйл', 'Email')}>
          <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label={L('Нууц үг', 'Password')}>
          <input className={inputClass} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-shu-soft px-3 py-2 text-sm text-shu" role="alert">{error}</p>}
        <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
          {L('Нэвтрэх', 'Log in')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {L('Бүртгэлгүй юу?', 'No account yet?')}{' '}
        <Link to="/register" className="font-medium text-shu hover:underline">
          {L('Бүртгүүлэх', 'Create one')}
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-muted">{L('Туршилтын бүртгэл', 'Demo account')}: demo@hanamaru.app / demo12345</p>
    </AuthLayout>
  );
}

export function Register() {
  const { register } = useAuth();
  const { L } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(L('Нууц үг дор хаяж 8 тэмдэгттэй байх ёстой.', 'Password must be at least 8 characters.'));
      return;
    }
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorText(err, L));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={L('Бүртгүүлэх', 'Create your account')} subtitle={L('Өнөөдрөөс япон хэлний аяллаа эхлүүлээрэй.', 'Start your Japanese journey today.')}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={L('Нэр', 'Name')}>
          <input className={inputClass} autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={L('Имэйл', 'Email')}>
          <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label={L('Нууц үг (8+ тэмдэгт)', 'Password (8+ characters)')}>
          <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-shu-soft px-3 py-2 text-sm text-shu" role="alert">{error}</p>}
        <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
          {L('Бүртгүүлэх', 'Create account')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {L('Бүртгэлтэй юу?', 'Already have an account?')}{' '}
        <Link to="/login" className="font-medium text-shu hover:underline">
          {L('Нэвтрэх', 'Log in')}
        </Link>
      </p>
    </AuthLayout>
  );
}
