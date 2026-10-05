import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Design-system utilities from globals.css. Without this, tailwind-merge reads `text-title-lg` as a
// text colour and drops it next to `text-muted-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-xl',
            'display-lg',
            'display-md',
            'title-lg',
            'title-md',
            'body-lg',
            'body',
            'body-sm',
            'heading',
            'label',
            'caption',
            'overline',
            'mono',
            'mono-sm',
          ],
        },
      ],
      shadow: [{ shadow: ['popover', 'frame'] }],
      z: [{ z: ['sticky', 'overlay', 'toast'] }],
    },
  },
})

/** Merge Tailwind class names, letting later utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
