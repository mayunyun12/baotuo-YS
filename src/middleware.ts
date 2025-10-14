import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

/**
 * Cloudflare D1 / Redis / Upstash 实时校验中间件
 * - 登录用户每次请求时校验：
 *   1. 是否存在于数据库中；
 *   2. 是否被封禁；
 *   3. Cookie 是否有效；
 * - 若被封禁或删除：立即清除 Cookie 并跳转登录页。
 */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过无需鉴权的路由（登录、静态资源、API等）
  if (shouldSkipAuth(pathname)) return NextResponse.next();

  // 从 cookie 解析出用户信息
  const auth = getAuthInfoFromCookie(request);
  if (!auth?.username) {
    return redirectToLogin(request);
  }

  // 读取后台配置，检查用户是否被封禁
  try {
    const cfg = await getConfig();
    const userEntry = cfg.UserConfig?.Users?.find(
      (u: any) => u.username === auth.username
    );

    // 如果用户被封禁
    if (userEntry?.banned) {
      console.warn(`[middleware] User "${auth.username}" is banned.`);
      return logoutAndBlock(request, '/login');
    }

    // 当前存储模式（Cloudflare D1 / Redis / Upstash / localstorage）
    const storageType =
      process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

    // 数据库存储类型：验证用户是否仍存在
    if (storageType === 'd1' || storageType === 'redis' || storageType === 'upstash') {
      const verified = await db.verifyUser(auth.username, auth.password || '');
      if (!verified) {
        console.warn(`[middleware] User "${auth.username}" no longer valid.`);
        return logoutAndBlock(request, '/login');
      }
    }

  } catch (err) {
    console.error('[middleware] Error during auth check:', err);
    // 出现异常时可安全地重定向至登录页
    return logoutAndBlock(request, '/login');
  }

  // 鉴权通过，继续执行
  return NextResponse.next();
}

/**
 * 跳转到登录页
 */
function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

/**
 * 清除 Cookie 并重定向
 */
function logoutAndBlock(request: NextRequest, to: string) {
  const url = new URL(to, request.url);
  const res = NextResponse.redirect(url);
  // 清除 auth cookie
  res.cookies.set('auth', '', {
    path: '/',
    expires: new Date(0),
    sameSite: 'lax',
    httpOnly: false,
    secure: false,
  });
  return res;
}

/**
 * 免鉴权路由白名单
 */
function shouldSkipAuth(pathname: string): boolean {
  const skipList = [
    '/login',
    '/register',
    '/warning',
    '/api/login',
    '/api/register',
    '/api/logout',
    '/api/cron',
    '/api/server-config',
    '/favicon.ico',
    '/_next/static',
    '/_next/image',
    '/icons/',
    '/logo.png',
    '/screenshot.png',
  ];
  return skipList.some((p) => pathname.startsWith(p));
}

/**
 * 配置 Next.js 中间件匹配范围
 * 除白名单外的所有路由都会被鉴权
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|warning|api/login|api/register|api/logout|api/cron|api/server-config).*)',
  ],
};
