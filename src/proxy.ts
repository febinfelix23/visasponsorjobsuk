import { type NextRequest } from 'next/server'
import { updateSession } from './lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  // Sessions are only needed on the admin area, accounts and sign-in; public pages skip the proxy.
  matcher: ['/admin', '/admin/:path*', '/account', '/account/:path*', '/auth/:path*'],
}
