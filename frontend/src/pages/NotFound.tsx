import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-gradient text-white shadow-brand">
        <Compass className="h-8 w-8" />
      </span>
      <div>
        <p className="font-display text-5xl font-bold gradient-text">404</p>
        <h1 className="mt-2 font-display text-xl font-bold text-ink">Page not found</h1>
        <p className="mt-1 text-sm text-muted">
          The page you're looking for doesn't exist or has moved.
        </p>
      </div>
      <Link to="/">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
