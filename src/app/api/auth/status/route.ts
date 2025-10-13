// src/app/api/auth/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { IStorage } from '@/lib/types'; // 假设 IStorage 在这里
import { D1Storage } from '@/lib/d1.db'; // 导入 D1Storage 类本身

// ⚠️ 模拟 createStorage 的逻辑，在 Node 环境中实例化 D1
// 实际生产环境可能需要更复杂的实例化，但这里假定 D1Storage 是可用的
function getStorageInstance(): IStorage {
    // 假设 D1Storage 可以在 Node/Serverless 环境中被正确实例化并访问 DB
    return new D1Storage(); 
}

export async function GET(request: NextRequest) {
    const username = request.nextUrl.searchParams.get('username');

    if (!username) {
        return NextResponse.json({ message: 'Missing username' }, { status: 400 });
    }

    // 每次请求都创建一个新的存储实例，以避免可能的实例级缓存
    const db = getStorageInstance(); 

    try {
        // --- 1. 校验用户是否存在（是否已被删除）---
        // 注意：这里使用 checkUserExist，而不是 middleware 中的 isUserExist
        const exists = await db.checkUserExist(username); 
        if (!exists) {
            return NextResponse.json({ message: 'User deleted' }, { status: 404 });
        }

        // --- 2. 校验用户是否被封禁 ---
        const adminConfig = await db.getAdminConfig();
        
        if (adminConfig?.UserConfig?.Users) {
            const u = adminConfig.UserConfig.Users.find((x: any) => x.username === username);
            
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
