'use client'

import { CircleX, RotateCw } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { isApiClientError } from '@/client/api'
import { quotaMessage } from '@/client/format'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  title?: ReactNode
  /** Any thrown value; ApiClientError messages are user-facing and shown as-is. */
  error?: unknown
  description?: ReactNode
  onRetry?: () => void
  action?: ReactNode
  /** The page failed as a whole: the title is its h1. */
  pageTitle?: boolean
  className?: string
}

/** Turns an unknown error into calm, user-facing copy. */
export function errorMessage(error: unknown): string {
  if (isApiClientError(error)) {
    switch (error.code) {
      case 'network_error':
        return "We couldn't reach Lectheo. Check your connection and try again."
      case 'unauthenticated':
        return 'Your session has ended. Please sign in again.'
      case 'not_found':
        return "This page doesn't exist, or you don't have access to it."
      case 'quota_exceeded':
        return quotaMessage(error.details)
      case 'ai_paused':
      case 'intake_paused':
        return error.message || 'New AI work is paused for now. Prepared practice still works.'
      default:
        return error.message
    }
  }
  return 'Something went wrong. Please try again.'
}

export function ErrorState({
  title = "Something didn't load",
  error,
  description,
  onRetry,
  action,
  pageTitle = false,
  className,
}: ErrorStateProps) {
  const Title = pageTitle ? 'h1' : 'p'
  const requestId = isApiClientError(error) ? error.requestId : undefined
  // A missing (or someone else's) resource won't load on retry: offer a way out instead.
  const notFound = isApiClientError(error) && error.code === 'not_found'
  const retry = notFound ? undefined : onRetry
  const shownAction =
    action ??
    (notFound && (
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard">Back to Home</Link>
      </Button>
    ))
  return (
    <div
      role="alert"
      className={cn(
        'border-border bg-card flex flex-col items-center gap-3 rounded-xl border px-6 py-10 text-center',
        className,
      )}
    >
      <span className="bg-mastery-red-bg text-mastery-red flex size-10 items-center justify-center rounded-full">
        <CircleX aria-hidden className="size-5" />
      </span>
      <div className="max-w-md space-y-1">
        <Title className="font-medium">{title}</Title>
        <p className="text-muted-foreground text-sm text-pretty">
          {description ?? errorMessage(error)}
        </p>
        {requestId && (
          <p className="text-muted-foreground/80 pt-1 font-mono text-[0.6875rem]">
            Reference {requestId}
          </p>
        )}
      </div>
      {(retry || shownAction) && (
        <div className="flex gap-2 pt-1">
          {retry && (
            <Button variant="outline" size="sm" onClick={retry}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          )}
          {shownAction}
        </div>
      )}
    </div>
  )
}
