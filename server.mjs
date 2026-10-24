// Serves the production build: static files from dist/client, everything else
// through the TanStack Start fetch handler in dist/server/server.js.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { Readable } from 'node:stream'

const { default: app } = await import('./dist/server/server.js')
const CLIENT = join(import.meta.dirname, 'dist/client')
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.html': 'text/html' }
const port = Number(process.env.PORT ?? 3000)

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const file = join(CLIENT, normalize(url.pathname))
  if (file.startsWith(CLIENT) && url.pathname !== '/') {
    const info = await stat(file).catch(() => null)
    if (info?.isFile()) {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      return createReadStream(file).pipe(res)
    }
  }
  const response = await app.fetch(new Request(url, { method: req.method, headers: req.headers }))
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (response.body) Readable.fromWeb(response.body).pipe(res)
  else res.end()
}).listen(port, () => console.log(`listening on http://localhost:${port}`))
