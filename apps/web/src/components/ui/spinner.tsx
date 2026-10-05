import * as React from "react"
import { cn } from "@/lib/utils"
import { LoaderCircle } from "lucide-react"

/** In-progress icon (Design System §3 Spinners). Always sits next to words; colour follows text. */
function Spinner({
  className,
  size = 16,
  ...props
}: Omit<React.ComponentProps<typeof LoaderCircle>, "size"> & { size?: 16 | 20 }) {
  return (
    <LoaderCircle
      data-slot="spinner"
      aria-hidden
      className={cn(
        "shrink-0 motion-safe:animate-spin",
        size === 20 ? "size-5" : "size-4",
        className
      )}
      {...props}
    />
  )
}

export { Spinner }
