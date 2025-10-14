/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

// ⚠️ 请根据您项目的实际路径进行调整
import { getAuthInfoFromCookie } from '@/lib/auth';

// ===============================================================
// 辅助函数区域
// ===============================================================

/**
 * 【核心修复】通过内部 API 路由检查用户的实时授权状态。
 * 使用 Cache Buster (时间戳) 来强制绕过所有 Edge 缓存。
 * @param username 用户名
 * @param request NextRequest 对象
 * @returns Promise<boolean> 授权检查是否通过
 */
async function checkUserAuthorization(username: string, request: NextRequest): Promise<boolean> {
    // 增加一个 Cache Buster (时间戳)，确保每次请求 URL 都不同
    const cacheBuster = Date.now(); 
    
    // 构造内部 API 路由 URL，包含用户名和时间戳
    const authStatusUrl = new URL(`/api/auth/status?username=${username}&_t=${cacheBuster}`, request.url);

    try {
        const response = await fetch(authStatusUrl.toString(), {
            method: 'GET',
            // 明确禁用 Edge Runtime 缓存
            cache: 'no-store', 
            // 确保不携带任何可能导致缓存的头信息
            headers: {
                'Cookie': request.headers.get('cookie') || '',
                'Cache-Control': 'no-cache, no-store, must-revalidate', // 额外的防缓存头
            }
        });

        // 期待 API 路由在用户正常时返回 200，在被封禁/删除时返回 403/404
        if (response.ok) {
            return true;
        } else if (response.status === 403 || response.status === 404) {
            // 用户被封禁或删除，授权失败
            return false;
        } else {
            // 其他错误（如 500），出于安全考虑返回失败
            console.error(`[AuthZ] API Error for user ${username}: ${response.status}`);
            return false;
        }

    } catch (error) {
        console.error('[AuthZ] Failed to connect to internal auth API:', error);
        return false;
    }
}

/**
 * 处理认证或授权失败的情况：清除 Cookie 并重定向到登录页。
 */
function handleAuthFailure(
    request: NextRequest,
    pathname: string,
    reason: string = 'Auth failed'
): NextResponse {
    console.log(`[AuthN/AuthZ] Check failed for ${pathname}. Reason: ${reason}`);

    // 如果是 API 路由，返回 401/403 JSON 响应
    if (pathname.startsWith('/api')) {
        const status = reason.includes('banned') || reason.includes('forbidden') || reason.includes('Authorization Failed') ? 403 : 401;
        return new NextResponse(reason, { status: status });
    }

    // 对于普通页面，重定向到登录页面
    const loginUrl = new URL('/login', request.url);
    const fullUrl = `${pathname}${request.nextUrl.search}`;
    
    // 添加错误信息到 URL 参数，方便登录页显示提示
    if (reason.includes('banned')) {
        loginUrl.searchParams.set('error', 'banned');
    } else if (reason.includes('deleted')) {
        loginUrl.searchParams.set('error', 'deleted');
    }
    
    loginUrl.searchParams.set('redirect', fullUrl);
    
    const response = NextResponse.redirect(loginUrl);
    
    // ⚠️ 关键：强制清除认证 Cookie
    response.cookies.delete('auth'); 
    
    return response;
}

/**
 * 验证签名。
 */
async function verifySignature(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBuffer = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      messageData
    );
  } catch (error) {
    console.error('签名验证失败:', error);
    return false;
  }
}

/**
 * 判断是否需要跳过认证的路径。
 */
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


// ===============================================================
// Middleware 主函数
// ===============================================================

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. 跳过不需要认证的路径
    if (shouldSkipAuth(pathname)) {
        return NextResponse.next();
    }

    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

    if (!process.env.PASSWORD) {
        const warningUrl = new URL('/warning', request.url);
        return NextResponse.redirect(warningUrl);
    }

    // 2. 从cookie获取认证信息
    const authInfo = getAuthInfoFromCookie(request);

    if (!authInfo || !authInfo.username) {
        return handleAuthFailure(request, pathname, 'No valid auth info or username found');
    }

    // 3. 【核心修复】实时授权检查：通过调用内部 API 路由
    const isAuthorized = await checkUserAuthorization(authInfo.username, request);

    if (!isAuthorized) {
        // API 路由返回 403/404，表示用户已被封禁/删除
        return handleAuthFailure(request, pathname, 'User is deleted or banned (Authorization Failed)');
    }
    
    // 4. 认证逻辑（在通过授权检查后进行）
    
    // localstorage模式：在middleware中完成密码验证
    if (storageType === 'localstorage') {
        if (!authInfo.password || authInfo.password !== process.env.PASSWORD) {
            return handleAuthFailure(request, pathname, 'Local storage password mismatch');
        }
        return NextResponse.next();
    }

    // 其他模式：只验证签名
    if (!authInfo.signature) {
         return handleAuthFailure(request, pathname, 'Missing signature for non-localstorage mode');
    }

    // 验证签名
    const isValidSignature = await verifySignature(
        authInfo.username,
        authInfo.signature,
        process.env.PASSWORD || ''
    );

    if (isValidSignature) {
        return NextResponse.next();
    }

    // 签名验证失败
    return handleAuthFailure(request, pathname, 'Signature invalid or not found');
}

// ===============================================================
// Config 配置
// ===============================================================

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|warning|api/login|api/register|api/logout|api/cron|api/server-config).*)',
  ],
};

