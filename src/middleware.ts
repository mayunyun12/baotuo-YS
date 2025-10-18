/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie, verifySignature } from '@/lib/auth';

const LOWER = (s?: string) => (s ?? '').trim().toLowerCase();

function clearAuth(res: NextResponse, req: NextRequest) {
  // 清除 auth Cookie（多写几种以确保覆盖不同 Domain/Path）
  const expire = new Date(0);
  res.cookies.set('auth', '', { path: '/', expires: expire, sameSite: 'lax', httpOnly: true });
  const host = req.nextUrl.hostname;
  if (host.includes('.')) {
    res.cookies.set('auth', '', { path: '/', domain: host, expires: expire, sameSite: 'lax', httpOnly: true });
  }
}

function block(req: NextRequest, isApi: boolean) {
  const res = isApi
    ? new NextResponse('Forbidden', { status: 403 })
    : NextResponse.redirect(new URL('/login', req.url));
  clearAuth(res, req);
  return res;
}

function shouldSkip(pathname: string) {
  // 这些路径不做鉴权，避免递归 & 允许登录页访问
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/sitemap') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/warning') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/register') ||
    pathname.startsWith('/api/logout') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/server-config')
  );
}

// 强制每次取最新封禁清单（避免 CDN/ISR 缓存）
async function getBannedSet(req: NextRequest): Promise<Set<string>> {
  const url = new URL('/api/server-config', req.url);
  url.searchParams.set('ts', String(Date.now())); // 缓存穿透
  const res = await fetch(url.toString(), {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
  if (!res.ok) throw new Error(`server-config ${res.status}`);
  const data = await res.json();

  // 兼容不同字段命名
  const users =
    data?.UserConfig?.Users ??
    data?.Users ??
    data?.users ??
    [];

  const set = new Set<string>();
  for (const u of users) {
    const name = LOWER(u?.username ?? u?.name ?? u?.userName);
    const raw = u?.banned ?? u?.disabled ?? u?.status;
    const banned =
      raw === true || raw === 1 || raw === '1' ||
      (typeof raw === 'string' && ['true', 'banned', 'disabled'].includes(raw.toLowerCase()));
    if (name && banned) set.add(name);
  }
  return set;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (shouldSkip(pathname)) return NextResponse.next();

  // 必须配置 PASSWORD
  if (!process.env.PASSWORD) {
    return NextResponse.redirect(new URL('/warning', request.url));
  }

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const isApi = pathname.startsWith('/api');

  // 从 Cookie 读取认证信息
  const auth = getAuthInfoFromCookie(request);
  if (!auth) return block(request, isApi);

  // localstorage：全站口令模式
  if (storageType === 'localstorage') {
    if (auth.password !== process.env.PASSWORD) return block(request, isApi);

    // 如果 Cookie 里带了 username，也尝试二次封禁校验（容错）
    if (auth.username) {
      try {
        const banned = await getBannedSet(request);
        if (banned.has(LOWER(auth.username))) return block(request, isApi);
      } catch {
        // 为安全，拿不到配置直接拒绝（fail-closed）
        return block(request, isApi);
      }
    }
    return NextResponse.next();
  }

  // 多用户模式：校验签名 + 封禁
  if (!auth.username || !auth.signature) return block(request, isApi);

  const ok = await verifySignature(auth.username, auth.signature, process.env.PASSWORD!);
  if (!ok) return block(request, isApi);

  try {
    const banned = await getBannedSet(request);
    if (banned.has(LOWER(auth.username))) return block(request, isApi);
  } catch {
    // 为安全：无法获取配置时一律拦截
    return block(request, isApi);
  }

  return NextResponse.next();
}

// 确保 middleware 覆盖所有页面/API（排除少数公开/静态资源）
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.json|icons/|login|warning|api/server-config|api/login|api/register|api/logout|api/cron).*)',
  ],
};
