/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';

// —— 重要：关闭一切静态化/缓存 ——
// App Router 路由级配置
export const runtime = 'edge';
export const revalidate = 0;                 // 关闭 ISR
export const dynamic = 'force-dynamic';      // 强制动态
export const fetchCache = 'force-no-store';  // 路由内 fetch 不缓存

// 统一转换，避免字段命名/大小写/类型差异
function sanitizeUsers(input: any): Array<{ username: string; role?: string; banned: boolean }> {
  const arr: any[] = Array.isArray(input) ? input : [];
  return arr
    .map((u) => {
      const username = String(u?.username ?? u?.name ?? u?.userName ?? '').trim();
      const role = u?.role ?? u?.userRole ?? undefined;
      const raw = u?.banned ?? u?.disabled ?? u?.status ?? false;
      const banned =
        raw === true ||
        raw === 1 ||
        raw === '1' ||
        (typeof raw === 'string' && ['true', 'banned', 'disabled'].includes(raw.toLowerCase()));
      return { username, role, banned };
    })
    .filter((u) => u.username); // 去掉空用户名
}

export async function GET(request: NextRequest) {
  try {
    console.log('server-config called:', request.url);

    const cfg = await getConfig();

    // 兼容多种存放位置：UserConfig.Users / Users / users
    const rawUsers =
      cfg?.UserConfig?.Users ??
      cfg?.Users ??
      cfg?.users ??
      [];

    const users = sanitizeUsers(rawUsers);

    const payload = {
      SiteName: cfg?.SiteConfig?.SiteName ?? 'Site',
      StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
      // middleware 会从这里读取封禁状态
      UserConfig: {
        Users: users, // 仅包含 username/role/banned 三个字段
      },
      updatedAt: Date.now(),
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        // —— 强制禁止缓存（浏览器、CDN、边缘）——
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        // 一些平台/代理会识别以下头部，双保险
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        'Surrogate-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('server-config error:', err);
    // 让 middleware 感知到错误，从而走 fail-closed 拦截
    return NextResponse.json(
      { error: 'server-config unavailable' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'CDN-Cache-Control': 'no-store',
          'Vercel-CDN-Cache-Control': 'no-store',
          'Surrogate-Control': 'no-store',
        },
      }
    );
  }
}
