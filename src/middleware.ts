import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

/**
 * Cloudflare D1 / Redis / Upstash 实时校验中间件
 * 功能：
 *  - 每次请求都验证登录状态
 *  - 检查用户是否被封禁
 *  - 校验账号是否仍存在（防止删除后继续访问）
 *  - 异常时自动清理 cookie 并跳转登录页
 */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过无需鉴权的路径
  if (shouldSkipAuth(pathname)) return NextResponse.next();

  // 从 cookie 解析登录信息
  const auth = getAuthInfoFromCookie(request);
  if (!auth?.username) {
    return redirectToLogin(request);
  }

  try {
    // 获取后台配置
    const cfg = await getConfig();

    // 查找当前用户配置
    const userEntry = cfg.UserConfig?.Users?.find(
      (u: any) => u.username === auth.username
    );

    // 用户被封禁
    if (userEntry?.banned) {
      console.warn(`[middleware] User "${auth.username}" is banned.`);
      return logoutAndBlock(request, '/login');
    }

    // 校验账号是否仍有效
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

    if (storageType === 'd1' || storageType === 'redis' || storageType === 'upstash') {
      const verified = await db.verifyUser(auth.username, auth.password || '');
      if (!verified) {
        console.warn(`[middleware] User "${auth.username}" no longer valid.`);
        return logoutAndBlock(request, '/login');
      }
    }
  } catch (err) {
    console.error('[middleware] Error during auth check:', err);
    return logoutAndBlock(request, '/login');
  }

  // 一切正常，继续执行
  return NextResponse.next();
}

/**
 * 跳转登录页
 */
function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

/**
 * 清除 cookie 并跳转
 */
function logoutAndBlock(request: NextRequest, to: string) {
  const url = new URL(to, request.url);
  const res = NextResponse.redirect(url);
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
 * 白名单路径（无需登录）
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
 * 中间件匹配范围
 * 排除白名单路径，拦截所有其他请求
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|warning|api/login|api/register|api/logout|api/cron|api/server-config).*)',
  ],
};
