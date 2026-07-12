import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock, User, Eye, EyeOff, ArrowRight, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button, Input } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Enter both username and password.');
      return;
    }
    setLoading(true);
    try {
      const ok = await login(username, password);
      if (ok) {
        navigate(from, { replace: true });
      } else {
        setError('Invalid credentials. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Is the backend running on :8000?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Left — brand showcase */}
      <div className="relative hidden w-1/2 overflow-hidden bg-midnight lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-sidebar-glow" />
        <div
          className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #EF6A16 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -left-16 top-1/3 h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #FF6B3D 0%, transparent 70%)' }}
        />

        <div className="relative">
          <Logo />
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight text-white">
            Hire smarter, <br />
            <span className="gradient-text">track everything.</span>
          </h1>
          <p className="mt-4 text-midnight-muted">
            The all-in-one recruitment workspace — manage job descriptions, parse resumes, map
            candidates and watch your hiring pipeline in real time.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: Zap, title: 'Automated resume parsing', desc: 'Extract candidate details in seconds.' },
              { icon: Sparkles, title: 'Live hiring dashboard', desc: 'Pipeline, offers & departments at a glance.' },
              { icon: ShieldCheck, title: 'Secure & auditable', desc: 'Every change is logged for you.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-accent-soft">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-sm text-midnight-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-2xs text-midnight-muted/70">
          © {new Date().getFullYear()} HireTrack · HR Talent Acquisition Portal
        </p>
      </div>

      {/* Right — form */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm animate-fade-in-up">
          <div className="mb-8 lg:hidden">
            <div className="inline-flex rounded-2xl bg-midnight p-3">
              <Logo />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-600 dark:text-brand-300">
            <Sparkles className="h-3.5 w-3.5" />
            Welcome back
          </span>
          <h2 className="mt-4 font-display text-2xl font-bold text-ink">Sign in to HireTrack</h2>
          <p className="mt-1.5 text-sm text-muted">
            Enter your HR credentials to access the portal.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Input
              label="Username"
              name="username"
              autoComplete="username"
              placeholder="hr.admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              leftIcon={<User className="h-4 w-4" />}
            />
            <Input
              label="Password"
              name="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="pointer-events-auto text-muted transition-colors hover:text-ink"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            {error && (
              <div className="rounded-xl border border-status-rejected/30 bg-status-rejected/10 px-3.5 py-2.5 text-sm font-medium text-status-rejected animate-fade-in">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full">
              {!loading && (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
              {loading && 'Signing in…'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Single-user portal · authenticated via the HireTrack backend.
          </p>
        </div>
      </div>
    </div>
  );
}
