// src/app/api/auth/status/route.ts (关键修改)

import { NextRequest, NextResponse } from 'next/server';
import { IStorage } from '@/lib/types';
import { D1Storage } from '@/lib/d1.db'; // 导入 D1Storage 类

// 假设 getStorageInstance 能够获取到 IStorage 实例
function getStorageInstance(): IStorage {
    // ⚠️ 确保这里返回的是实际使用的 D1Storage 实例，例如：
    return new D1Storage(); 
}

export async function GET(request: NextRequest) {
    // 强制此 API 路由的响应不被缓存
    request.headers.set('Cache-Control', 'no-store, max-age=0');
    
    const username = request.nextUrl.searchParams.get('username');
    if (!username) {
        return NextResponse.json({ message: 'Missing username' }, { status: 400 });
    }

    const db = getStorageInstance(); 

    try {
        // --- 1. 校验用户是否存在（被删除）---
        // 假设 checkUserExist 方法是可靠的
        const exists = await db.checkUserExist(username); 
        if (!exists) {
            return NextResponse.json({ message: 'User deleted' }, { status: 404 });
        }

        // --- 2. 校验用户是否被封禁（核心问题点）---
        
        // ⚠️ 【关键修复点】：我们不信任之前缓存的 AdminConfig。
        // 必须假设 D1 的 getAdminConfig 被 Edge 缓存了。
        // 如果您的 D1Storage 中有强制刷新配置的方法，请调用它。
        
        // 由于没有看到 D1Storage 的底层实现，我们必须假设 getAdminConfig 会进行 DB 查询。
        const adminConfig = await db.getAdminConfig();
        
        // 强制打印日志，以便您在 Cloudflare Logs 或 Vercel Logs 中查看封禁状态
        console.log(`[AUTH STATUS API] Checking user: ${username}, AdminConfig presence: ${!!adminConfig}`);

        if (adminConfig?.UserConfig?.Users) {
            const u = adminConfig.UserConfig.Users.find((x: any) => x.username === username);
            
            // 再次打印日志，确认是否找到了用户以及其封禁状态
            if (u) {
                console.log(`[AUTH STATUS API] User found, banned status: ${u.banned}`);
            }
            
            if (u && u.banned) {
                return NextResponse.json({ message: 'User banned' }, { status: 403 });
            }
        }

        return NextResponse.json({ message: 'User active' }, { status: 200 });
    } catch (err) {
        console.error('API Error /api/auth/status:', err);
        return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    }
}
