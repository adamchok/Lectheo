'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState, type ReactNode } from 'react'
import { isApiClientError } from '@/client/api'
import { MotionProvider } from '@/components/motion-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const MAX_RETRIES = 2

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 4xx answers won't change on retry; only retry network / 5xx failures.
        retry: (failureCount, error) => {
          if (isApiClientError(error) && error.status >= 400 && error.status < 500) return false
          return failureCount < MAX_RETRIES
        },
      },
      mutations: { retry: false },
    },
  })
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient)
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <MotionProvider>
          <TooltipProvider delayDuration={250}>
            {children}
            <Toaster position="bottom-right" closeButton />
          </TooltipProvider>
        </MotionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
