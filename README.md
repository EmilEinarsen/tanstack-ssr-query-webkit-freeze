# TanStack Start + router-ssr-query: WebKit freezes when the query stream ends

Reproducer for [TanStack/router#8795](https://github.com/TanStack/router/issues/8795).

A minimal TanStack Start app wired with `setupRouterSsrQueryIntegration`. On
the client, `@tanstack/router-ssr-query-core@1.169.3` reads the dehydrated
query stream and calls `reader.releaseLock()` in a `finally` once the stream
ends, just after `load`. In WebKit, `releaseLock()` runs stream JavaScript
while it holds the reader's lock. A garbage collection that starts there marks
the same reader, waits on that lock in
`JSReadableStreamDefaultReaderOwner::isReachableFromOpaqueRoots`, and the page's
main thread never comes back. WebKit bug:
[326046](https://bugs.webkit.org/show_bug.cgi?id=326046).

## Files

- `src/router.tsx`: `QueryClient` plus `setupRouterSsrQueryIntegration`.
- `src/routes/index.tsx`: a loader that prefetches three queries without
  awaiting them, and three more queries that start during render, so the
  dehydrated query stream carries data and ends after the shell is sent.
- `src/routes/__root.tsx`: the document, plus the optional `?pressure` script.
- `vite.config.mjs`: with `NO_RELEASE_LOCK=1`, removes the
  `finally { reader.releaseLock() }` from the core package at build time. This
  is the change in [PR #8796](https://github.com/TanStack/router/pull/8796).
- `server.mjs`: serves the production build with Node.
- `repro.mjs`: builds, serves, and loads the page in Playwright WebKit.
- `docker.sh`: runs `repro.mjs` in `mcr.microsoft.com/playwright:v1.62.0-noble`.

## Run

The freeze has only been seen in Linux WebKit, so run it in the Playwright
image:

```sh
# as published: releaseLock() runs when the stream ends
ROUNDS=6000 CONCURRENCY=12 PRESSURE=1 ./docker.sh
# with PR #8796's change
ROUNDS=6000 CONCURRENCY=12 PRESSURE=1 NO_RELEASE_LOCK=1 ./docker.sh
```

From Git Bash on Windows, prefix with `MSYS_NO_PATHCONV=1`. On Linux you can
also run `npm install && PRESSURE=1 node repro.mjs` directly.

Each round opens a fresh browser context, loads `/`, waits 1 s after `load`
(the stream has ended by then), and counts the round as frozen when
`page.evaluate(() => 1)` gets no answer within 15 s. The script prints
`RESULT: <frozen> frozen / <rounds> rounds`. `STOP_AFTER=n` stops after n
frozen rounds.

## Expected result

With `releaseLock()`: about 1 round in 1,000 freezes for good. With
`NO_RELEASE_LOCK=1`: none do. Measured numbers are under Results.

## About `PRESSURE=1`

One `releaseLock()` per page load gives a narrow window, and this tiny page
barely allocates, so without help it does not freeze in thousands of rounds.
`PRESSURE=1` loads `/?pressure`, which runs a 1 ms timer for the first 3 s that
allocates 20,000 small objects per tick and keeps up to 300,000 alive. That
keeps the collector busy the way a large real app does. The pressure script
never touches streams. The only `releaseLock()` on the page is the one in
router-ssr-query-core, and the only change between the two variants is
removing that call.

In the app where we found this (a larger TanStack Start app, no added
pressure), about 3 of 400 Playwright WebKit walks froze before the change and
0 of 1,200 after.

## Results

Playwright 1.62.0, WebKit 26.5, in `mcr.microsoft.com/playwright:v1.62.0-noble`
under Docker Desktop (WSL2, 32 cores), `CONCURRENCY=12`. The two variants ran
at the same time in two containers.

| Variant | Pressure | Frozen rounds |
| --- | --- | --- |
| `releaseLock()` as published | `PRESSURE=1` | 5 of 5,636 (stopped by `STOP_AFTER=5`) |
| `releaseLock()` removed (`NO_RELEASE_LOCK=1`) | `PRESSURE=1` | 0 of 6,000 |
| `releaseLock()` as published | none | 0 of 2,000 (earlier script, no 1 s wait after `load`) |

Each run took about 14 minutes. The script also counts a round as frozen
when `load` never fires within 30 s, and does not log which case it was. Every round that answered had rendered all six items.
