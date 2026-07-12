import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ink & Bone button. `.btn` is a bordered ghost by default; `primary` is the
 * single vermilion voice, `danger` reveals red on hover.
 *
 * Variants kept broad for back-compat with existing call sites:
 *   primary | ghost | danger | secondary(≈outline) | outline
 * Sizes: sm | md | lg | icon.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'primary',
  secondary: '',
  outline: 'ghost',
  ghost: 'ghost',
  danger: 'danger',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'sm',
  md: '',
  lg: '',
  icon: 'icon',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, disabled, children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      className={cn('btn', VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
      {...props}
    >
      {loading && <span className="ib-spin" aria-hidden />}
      {children}
    </button>
  );
});
