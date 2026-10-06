import { PageChrome } from '@/components/shell/page-chrome'
import { Skeleton } from '@/components/ui/skeleton'

/** Route transitions (Design System §4): sidebar and top bar stay; only the content area waits. */
export default function AppLoading() {
  return (
    <>
      <PageChrome crumbs={[{ label: 'Loading…' }]} />
      <Skeleton label="Loading page" className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </Skeleton>
    </>
  )
}
