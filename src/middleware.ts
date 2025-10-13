/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

// ⚠️ 请根据您项目的实际路径进行调整
import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db'; 

// ===============================================================
// 辅助函数区域
// ===============================================================

/**
 * 处理认证或授权失败的情况：清除 Cookie 并重定向到登录页。
 * * @param request NextRequest 对象
 * @param pathname 当前路径
 * @param reason 失败原因
 * @returns NextResponse 对象，用于重定向或返回 401/403
 */
function handleAuthFailure(
    request: NextRequest,
    pathname: string,
    reason: string = 'Auth failed'
): NextResponse {
    console.log(`[AuthN/AuthZ] Check failed for ${pathname}. Reason: ${reason}`);

    // 如果是 API 路由，返回 401/403 JSON 响应
    if (pathname.startsWith('/api')) {
        // 如果失败原因是封禁/权限不足，返回 403；否则返回 401
        const status = reason.includes('banned') || reason.includes('forbidden') ? 403 : 401;
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
 * 验证签名。此函数应与您项目的签名生成逻辑匹配。
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
        // 如果没有设置密码，重定向到警告页面
        const warningUrl = new URL('/warning', request.url);
        return NextResponse.redirect(warningUrl);
    }

    // 2. 从cookie获取认证信息
    const authInfo = getAuthInfoFromCookie(request);

    // 检查是否有基本认证信息和用户名
    if (!authInfo || !authInfo.username) {
        return handleAuthFailure(request, pathname, 'No valid auth info or username found');
    }

    // 3. 实时授权检查 (Edge DB 核心逻辑)
    try {
        // --- 3.1 校验用户是否存在（是否已被删除）---
        const exists = await db.isUserExist?.(authInfo.username); 
        if (!exists) {
            return handleAuthFailure(request, pathname, 'User is deleted');
        }

        // --- 3.2 校验用户是否被封禁 ---
        const adminConfig = await db.getAdminConfig?.();
        
        if (adminConfig?.UserConfig?.Users) {
            const u = adminConfig.UserConfig.Users.find(
                (x: any) => x.username === authInfo.username
            );
            
            if (u && u.banned) {
                return handleAuthFailure(request, pathname, 'User is banned');
            }
        }
    } catch (err) {
        // DB 检查失败，拒绝访问以确保安全
        console.error('Middleware user status check error:', err);
        return handleAuthFailure(request, pathname, 'Server error during auth check');
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

// 配置middleware匹配规则
export const config = {
  matcher: [
    // 匹配所有路径，除了排除列表中的
    '/((?!_next/static|_next/image|favicon.ico|login|warning|api/login|api/register|api/logout|api/cron|api/server-config).*)',
  ],
};
