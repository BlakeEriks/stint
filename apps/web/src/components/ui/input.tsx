import * as React from "react"
import { cn } from '@/lib/cn'

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-edge-default bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-accent-default selection:text-on-accent file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-primary placeholder:text-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-edge-focus focus-visible:ring-[3px] focus-visible:ring-edge-focus",
        "aria-invalid:border-danger aria-invalid:ring-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
