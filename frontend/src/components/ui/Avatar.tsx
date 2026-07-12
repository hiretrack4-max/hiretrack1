import { cn, initials } from '@/lib/utils';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-brand-gradient font-semibold text-white shadow-brand-sm ring-2 ring-card',
        SIZES[size],
        className,
      )}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
