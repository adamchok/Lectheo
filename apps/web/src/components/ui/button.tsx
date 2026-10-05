import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive data-pending:cursor-progress data-pending:[&>svg:not([data-slot=spinner])]:hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-card shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const ignoreClick = (event: React.MouseEvent) => event.preventDefault()

const stackItem = "col-start-1 row-start-1 inline-flex items-center gap-[inherit]"

/**
 * Pending (Design System §6 Button): a spinner replaces the leading icon, `aria-busy` is set and
 * clicks are ignored while focus stays put. Pass `pendingLabel` ("Grading…") to swap the label;
 * both labels share one grid cell, so the button keeps its width.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending = false,
  pendingLabel,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    pending?: boolean
    pendingLabel?: React.ReactNode
  }) {
  const Comp = asChild ? Slot.Root : "button"

  let content = children
  if (!asChild && pendingLabel !== undefined) {
    content = (
      <span className="grid gap-[inherit]">
        <span className={cn(stackItem, pending && "invisible")}>{children}</span>
        <span className={cn(stackItem, !pending && "invisible")}>
          <Spinner />
          {pendingLabel}
        </span>
      </span>
    )
  } else if (!asChild && pending) {
    content = (
      <>
        <Spinner />
        {children}
      </>
    )
  }

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
      onClick={pending ? ignoreClick : onClick}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }
