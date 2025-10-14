import { NextResponse, NextRequest } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { getDetailFromApi } from '@/lib/downstream';
import { db } from '@/lib/db';

export const runtime = 'edge';

/**
 * 视频详情接口（含用户鉴权）
 * - 验证登录状态
 * - 校验用户是否被封禁
 * - 校验账号是否仍然存在（防止删除后仍能访问）
 */
export async function GET(request: NextRequest) {
  // 1️⃣ 鉴权：检查是否已登录
  const auth = getAuthInfoFromCookie(request);
  if (!auth?.username) {
    return NextResponse.json({ error: '未登录或登录已过期' }, { status: 401 });
  }

  // 2️⃣ 检查用户是否被封禁
  const cfg = await getConfig();
  const userEntry = cfg.UserConfig?.Users?.find(
    (u: any) => u.username === auth.username
  );
  if (userEntry?.banned) {
    return NextResponse.json({ error: '该账号已被封禁' }, { status: 403 });
  }

  // 3️⃣ 对于 Cloudflare D1 / Redis / Upstash 等模式，验证用户是否存在
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'd1' || storageType === 'redis' || storageType === 'upstash') {
    try {
      const ok = await db.verifyUser(auth.username, auth.password || '');
      if (!ok) {
        return NextResponse.json({ error: '登录状态无效，请重新登录' }, { status: 401 });
      }
    } catch (err) {
      console.error('[detail] verifyUser error:', err);
      return NextResponse.json({ error: '服务器验证失败' }, { status: 500 });
    }
  }

  // 4️⃣ 解析参数
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const sourceCode = searchParams.get('source');

  if (!id || !sourceCode) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }

  if (!/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: '无效的视频ID格式' }, { status: 400 });
  }

  // 5️⃣ 执行原有逻辑：调用 API 获取详情
  try {
    const apiSites = await getAvailableApiSites();
    const apiSite = apiSites.find((site) => site.key === sourceCode);

    if (!apiSite) {
      return NextResponse.json({ error: '无效的API来源' }, { status: 400 });
    }

    const result = await getDetailFromApi(apiSite, id);
    const cacheTime = await getCacheTime();

    // 返回结果并设置缓存策略
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
      },
    });
  } catch (error) {
    console.error('[detail] getDetailFromApi error:', error);
    return NextResponse.json(
      { error: (error as Error).message || '获取视频详情失败' },
      { status: 500 }
    );
  }
}
