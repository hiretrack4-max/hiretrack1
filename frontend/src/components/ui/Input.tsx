import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ink & Bone text input. Mono uppercase label, well-recessed field, vermilion
 * focus border. `leftIcon` / `rightIcon` keep back-compat with existing forms.
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, leftIcon, rightIcon, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <div className="field">
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-dim">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'inp',
            // `!` beats the `.inp` shorthand padding so the icon never overlaps text.
            leftIcon && '!pl-10',
            rightIcon && '!pr-10',
            error && 'field-err',
            className,
          )}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-dim">
            {rightIcon}
          </span>
        )}
      </div>
      {error ? (
        <p className="field-msg">{error}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
});
