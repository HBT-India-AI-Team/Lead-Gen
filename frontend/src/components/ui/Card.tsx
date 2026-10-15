import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/formatters';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // When true, draws the signature ledger accent bar down the card's left
  // edge (echoing a passbook/ledger rule) — reserved for key surfaces like
  // headline stat cards, not every card, so the motif stays meaningful.
  accent?: boolean;
}

// Banking-dashboard surface: hairline border + soft resting shadow (never a
// heavy border AND shadow together), consistent 12px rounding, and a subtle
// elevation lift on hover so a dense grid of cards still reads as distinct,
// interactive surfaces rather than flat panels. All values come from the
// index.css design tokens.
function Card({ className, children, accent = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card border border-hairline bg-surface shadow-card',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-primary-tint-2 hover:shadow-card-hover',
        accent && 'pl-1',
        className
      )}
      {...props}
    >
      {accent && (
        <span className="absolute left-0 top-0 bottom-0 w-1 bg-secondary" aria-hidden="true" />
      )}
      {children}
    </div>
  );
}

export default Card;
