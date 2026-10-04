import { SearchX } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

export default function AppNotFound() {
  return (
    <EmptyState
      className="mx-auto mt-10 max-w-xl"
      icon={SearchX}
      title="We couldn't find that"
      description="It may have been deleted, or it belongs to another account."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      }
    />
  )
}
