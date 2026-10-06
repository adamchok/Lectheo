import { SearchX } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

/** notFound() inside the signed-in area: rendered in the content column, shell intact. */
export default function AppNotFound() {
  return (
    <EmptyState
      className="mx-auto mt-10 max-w-xl"
      icon={SearchX}
      title="Page not found"
      description="This page doesn't exist, or you don't have access to it."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to Home</Link>
        </Button>
      }
    />
  )
}
