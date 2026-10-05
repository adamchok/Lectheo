import { cn } from "@/lib/utils"

const block = "motion-safe:animate-pulse rounded-md bg-muted"

/**
 * Loading placeholder (Design System §3 Skeletons). Plain blocks are `aria-hidden`. Give the one
 * skeleton that stands for a region a `label` ("Loading your concept map"): it becomes a
 * `role="status"` region with sr-only text. With children it wraps them (layout only); without, it
 * is itself a block.
 */
function Skeleton({
  className,
  label,
  children,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  if (label === undefined) {
    return (
      <div
        data-slot="skeleton"
        aria-hidden
        className={cn(block, className)}
        {...props}
      />
    )
  }

  return (
    <div
      data-slot="skeleton"
      role="status"
      className={cn(children === undefined && block, className)}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

export { Skeleton }
