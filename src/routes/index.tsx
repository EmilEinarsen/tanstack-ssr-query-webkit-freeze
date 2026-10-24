import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

const item = (id: number) =>
  queryOptions({
    queryKey: ['item', id],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20 * id))
      return { id, rows: Array.from({ length: 200 }, (_, i) => ({ i, label: `item ${id} row ${i}` })) }
    },
  })

const PREFETCHED = [1, 2, 3]
const RENDER_FETCHED = [4, 5, 6]

export const Route = createFileRoute('/')({
  // Not awaited: 1-3 are dehydrated as pending queries. 4-6 start during render,
  // after dehydration, so they reach the client on the ssr-query stream.
  loader: ({ context }) => {
    for (const id of PREFETCHED) void context.queryClient.prefetchQuery(item(id))
  },
  component: () => (
    <main>
      <h1>ssr-query stream</h1>
      {[...PREFETCHED, ...RENDER_FETCHED].map((id) => (
        <Suspense key={id} fallback={<p>loading {id}</p>}>
          <Item id={id} />
        </Suspense>
      ))}
    </main>
  ),
})

function Item({ id }: { id: number }) {
  const { data } = useSuspenseQuery(item(id))
  return <p>item {data.id}: {data.rows.length} rows</p>
}
