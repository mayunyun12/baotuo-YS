// src/app/api/auth/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
// ⚠️ 请根据您项目的实际路径和导出进行调整
import { IStorage } from '@/lib/types';
import { D1Storage } from '@/lib/d1.db'; 
import { db } from '@/lib/db'; // 假设这是您的 createStorage() 结果

// 假设 getStorageInstance 能够获取到 IStorage 实例
// 如果您的 @/lib/db 已经导出了实例，则可以直接使用 db
const getStorageInstance = () => db; // 确保 db 实例是可用的

export async function GET(request: NextRequest) {
    const username = request.nextUrl.searchParams.get('username');

    // 强制此 API 路由的响应不被缓存
    const headers = { 'Cache-Control': 'no-store, max-age=0' };

    if (!username) {
        return NextResponse.json({ message: 'Missing username' }, { status: 400, headers });
    }

    // 每次请求都使用最新的存储实例
    const dbInstance = getStorageInstance(); 

    try {
        // 1. 校验用户是否存在（被删除）
        // ⚠️ 假设 checkUserExist 方法是可靠的
        const exists = await dbInstance.checkUserExist(username); 
        if (!exists) {
            return NextResponse.json({ message: 'User deleted' }, { status: 404, headers });
        }
        
        // 2. 校验用户是否被封禁（核心问题点）
        // ⚠️ 假设 getAdminConfig 返回最新的 AdminConfig
        const adminConfig = await dbInstance.getAdminConfig();
        
        if (adminConfig?.UserConfig?.Users) {
            const u = adminConfig.UserConfig.Users.find((x: any) => x.username === username);
            
            if (u && u.banned) {
                // 用户已被封禁
                return NextResponse.json({ message: 'User banned' }, { status: 403, headers });
            }
        }

        // 3. 授权通过
        return NextResponse.json({ message: 'User active' }, { status: 200, headers });

    } catch (err) {
        console.error('API Error /api/auth/status:', err);
        return NextResponse.json({ message: 'Internal Server Error' }, { status: 500, headers });
    }
}
