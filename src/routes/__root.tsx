import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { title: 'ssr-query WebKit freeze' }] }),
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: PRESSURE }} />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
})

// Optional GC pressure for the repro script, see README. Off unless the URL has
// ?pressure. For 3 s from the first byte, a 1 ms timer allocates 20,000 small
// objects and keeps up to 300,000 alive, so collections run almost constantly
// while the ssr-query stream ends. It never touches streams.
const PRESSURE = `
if (location.search.includes('pressure')) {
  let live = []
  const timer = setInterval(() => {
    for (let i = 0; i < 20000; i++) live.push({ i, pair: [i, i + 1], text: 'g' + i + Math.random() })
    if (live.length > 300000) live = []
  }, 1)
  setTimeout(() => clearInterval(timer), 3000)
}
`
