import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase'; // Assuming a client that uses route handlers cookies

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  if (pathname.startsWith('/admin')) {
    const isLoginRoute = pathname === '/admin/login';
    const isApiAdminRoute = pathname.startsWith('/api/admin');
    
    // Retrieve token
    let token = '';
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = request.cookies.get('sb-access-token')?.value || request.cookies.get('supabase-auth-token')?.value || '';
    }

    let isValid = false;
    
    if (token) {
      // Very basic token verify, or ideally hit Supabase RPC / user info if we must, 
      // but usually JWT verify is enough. Here we just assume presence for middleware, 
      // or we can use Supabase client
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        }
      });
      if (res.ok) {
        isValid = true;
      }
    }

    if (isLoginRoute) {
      if (isValid) {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.next();
    }

    if (!isValid) {
      if (isApiAdminRoute) {
        return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
      } else {
        return NextResponse.redirect(new URL('/admin/login', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
