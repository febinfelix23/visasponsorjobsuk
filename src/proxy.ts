import { NextResponse, type NextRequest } from 'next/server'
import { isPlausiblePagePath } from './lib/site/slug-shape'
import { updateSession } from './lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  // Job and sponsor pages: refuse addresses that can't be real before they render and get stored.
  if (pathname.startsWith('/jobs/') || pathname.startsWith('/sponsors/')) {
    if (isPlausiblePagePath(pathname)) return NextResponse.next()
    return NextResponse.rewrite(new URL('/_not-found', request.url), { status: 404 })
  }
  return await updateSession(request)
}

export const config = {
  // Sessions are only needed on the admin area, accounts and sign-in. Job and sponsor pages
  // pass through a shape check only; every other public page skips the proxy.
  matcher: ['/admin', '/admin/:path*', '/account', '/account/:path*', '/auth/:path*', '/jobs/:path*', '/sponsors/:path*'],
}
