import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from '@/lib/cn'
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-edge-focus focus-visible:ring-[3px] focus-visible:ring-edge-focus disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Neutral by default, on purpose. The accent marks the running timer;
        // a screen's "Add client" is not competing with that, and before this
        // every page with a primary action put a second green meaning on
        // screen beside the nav rail's timer. Opting in is a decision now.
        /* Carries a border as well as a fill. The fill alone is
           `bg-surface-elevated`, which is also the dialog surface — so inside
           a dialog the button was the same color as the panel behind it and
           read as bare text. A neutral button has to stay legible as a
           control on any surface it lands on, and the edge is what does
           that. */
        default:
          "border border-edge-default bg-surface-elevated text-strong hover:bg-surface-active",
        // The one primary action on a screen that genuinely has one — and
        // only where no running timer is in view. See the accent rule in
        // CLAUDE.md.
        accent: "bg-accent-default text-on-accent hover:bg-accent-hover",
        // The second step of a destructive pair. The first step is a quiet
        // ghost icon — see the action-button tables in components.html.
        destructive:
          "bg-danger text-on-danger hover:bg-danger focus-visible:ring-danger",
        ghost:
          "hover:bg-surface-hover hover:text-strong",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
