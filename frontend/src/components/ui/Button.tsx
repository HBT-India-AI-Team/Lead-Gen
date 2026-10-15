import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/formatters';

// 'success'/'danger' were added in the theme upgrade; 'primary',
// 'secondary', and 'ghost' keep their exact existing names and meaning so
// every page already calling <Button variant="secondary"> (etc.) keeps
// working unchanged — only the color values underneath were upgraded.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-ink-inverse shadow-sm hover:bg-primary-hover',
  secondary: 'border border-primary bg-surface text-primary hover:bg-primary-tint',
  ghost: 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
  success: 'bg-success text-ink-inverse shadow-sm hover:brightness-95',
  danger: 'bg-danger text-ink-inverse shadow-sm hover:brightness-95',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = 'Button';

export default Button;