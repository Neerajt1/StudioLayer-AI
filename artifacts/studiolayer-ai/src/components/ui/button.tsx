import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[3px] font-sans text-sm font-medium tracking-normal text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'sl-control bg-background text-foreground border [border-color:var(--button-outline)] font-medium',
        // Destructive keeps its own semantics — no olive interaction accent.
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm border-destructive-border hover-elevate active-elevate-2',
        outline:
          'sl-control border [border-color:var(--button-outline)]',
        secondary:
          'sl-control border bg-secondary text-secondary-foreground border-secondary-border',
        ghost: 'sl-control-quiet border border-transparent',
        // Links keep their underline affordance; only the colour picks up olive.
        link: 'sl-control-quiet text-foreground underline-offset-4 hover:underline',
      },
      size: {
        // @replit changed sizes
        default: 'min-h-9 px-4 py-2',
        sm: 'min-h-8 px-3 text-xs',
        lg: 'min-h-10 px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
