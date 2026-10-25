import { type NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Sessions are only used on the admin area and the sign-in pages; public pages skip the proxy.
  matcher: ['/admin', '/admin/:path*', '/auth/:path*'],
}
