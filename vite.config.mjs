import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// NO_RELEASE_LOCK=1 builds the client with the change from
// https://github.com/TanStack/router/pull/8796: the `finally { reader.releaseLock() }`
// in @tanstack/router-ssr-query-core is removed. Everything else is identical.
const removeReleaseLock = {
  name: 'remove-ssr-query-release-lock',
  enforce: 'pre',
  transform(code, id) {
    if (process.env.NO_RELEASE_LOCK !== '1') return
    if (!id.includes('router-ssr-query-core')) return
    const patched = code.replace(/\}\s*finally\s*\{\s*reader\.releaseLock\(\);?\s*\}/, '}')
    if (patched === code) return
    console.log(`[remove-ssr-query-release-lock] patched ${id}`)
    return patched
  },
}

export default defineConfig({
  plugins: [removeReleaseLock, tanstackStart(), viteReact()],
})
