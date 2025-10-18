/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

/**
 * 极简热补丁：在已通过签名校验后，二次校验用户是否被封禁（banned）。
 * - 通过 /api/server-config 读取用户配置（已在 matcher 中排除，避免递归）
 * - 命中 banned：清除 auth Cookie，并对 API 返回 403，页面重定向至 /login
 * - 软缓存 15s，避免每个请求都读取配置
 */

const BAN_CACHE_TTL = 15_000; // 15s
let banCache: { at: number; set: Set<string> } | null = null;

async function getBannedSet(request: NextRequest): Promise<Set<string>> {
  if (banCache && Date.now() - banCache.at < BAN_CACHE_TTL) return banCache.set;

  const url = new URL('/api/server-config', request.url);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`server-config unavailable: ${res.status}`);
  }
  const data = await res.json();
  // 期望结构：{ UserConfig: { Users: [{ username, banned }, ...] } }
  const users =
    (data?.UserConfig?.Users as Array<any> | undefined) ||
    (data?.Users as Array<any> | undefined) ||
    (data?.users as Array<any> | undefined) ||
    [];

  const set = new Set<string>();
  for (const u of users) {
    const name = u?.username ?? u?.name ?? u?.userName;
    const isBanned = u?.banned === true || u?.disabled === true || u?.status === 'banned';
    if (name && isBanned) set.add(String(name));
  }
  banCache = { at: Date.now(), set };
  return set;
}

function killAuthAndBlock(request: NextRequest, isApi: boolean) {
  const res = isApi
    ? new NextResponse('Forbidden', { status: 403 })
    : NextResponse.redirect(new URL('/login', request.url));
  // 强制清除 auth Cookie
  res.cookies.set('auth', '', { path: '/', expires: new Date(0), sameSite: 'lax' });
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过不需要认证的路径
  if (shouldSkipAuth(pathname)) {
    return NextResponse.next();
  }

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  if (!process.env.PASSWORD) {
    // 如果没有设置密码，重定向到警告页面
    const warningUrl = new URL('/warning', request.url);
    return NextResponse.redirect(warningUrl);
  }

  // 从cookie获取认证信息
  const authInfo = getAuthInfoFromCookie(request);

  if (!authInfo) {
    return handleAuthFailure(request, pathname);
  }

  // localstorage模式：在middleware中完成验证
  if (storageType === 'localstorage') {
    if (!authInfo.password || authInfo.password !== process.env.PASSWORD) {
      return handleAuthFailure(request, pathname);
    }
    // localstorage 模式无多用户概念，不再检查 banned
    return NextResponse.next();
  }

  // 其他模式：只验证签名
  // 检查是否有用户名（非localStorage模式下密码不存储在cookie中）
  if (!authInfo.username || !authInfo.signature) {
    return handleAuthFailure(request, pathname);
  }

  // 验证签名（如果存在）
  if (authInfo.signature) {
    const isValidSignature = await verifySignature(
      authInfo.username,
      authInfo.signature,
      process.env.PASSWORD || ''
    );

    // 签名验证通过后，新增：banned 二次校验
    if (isValidSignature) {
      try {
        const bannedSet = await getBannedSet(request);
        if (bannedSet.has(authInfo.username)) {
          return killAuthAndBlock(request, pathname.startsWith('/api'));
        }
      } catch (e) {
        // 为保证可用性，配置获取失败时放行（如需更安全，可切换为 fail-closed）
        // return killAuthAndBlock(request, pathname.startsWith('/api'));
      }
      return NextResponse.next();
    }
  }

  // 签名验证失败或不存在签名
  return handleAuthFailure(request, pathname);
}

// 验证签名
async function verifySignature(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  try {
    // 导入密钥
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // 将十六进制字符串转换为Uint8Array
    const signatureBuffer = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    // 验证签名
    return await crypto.subtle.verify('HMAC', key, signatureBuffer, messageData);
  } catch (error) {
    console.error('签名验证失败:', error);
    return false;
  }
}

// 处理认证失败的情况
function handleAuthFailure(request: NextRequest, pathname: string): NextResponse {
  // 如果是 API 路由，返回 401 状态码
  if (pathname.startsWith('/api')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 否则重定向到登录页面
  const loginUrl = new URL('/login', request.url);
  // 保留完整的URL，包括查询参数
  const fullUrl = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('redirect', fullUrl);
  return NextResponse.redirect(loginUrl);
}

// 判断是否需要跳过认证的路径
function shouldSkipAuth(pathname: string): boolean {
  const skipPaths = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.json',
    '/icons/',
    '/logo.png',
    '/screenshot.png',
  ];

  return skipPaths.some((path) => pathname.startsWith(path));
}

// 配置middleware匹配规则
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|warning|api/login|api/register|api/logout|api/cron|api/server-config).*)',
  ],
};
