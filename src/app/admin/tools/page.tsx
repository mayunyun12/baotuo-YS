/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import PageLayout from '@/components/PageLayout';

/** 统一弹窗 */
const toast = {
  ok: (msg: string) =>
    Swal.fire({ icon: 'success', title: '成功', text: msg, timer: 1800, showConfirmButton: false }),
  err: (msg: string) => Swal.fire({ icon: 'error', title: '错误', text: msg }),
  text: (title: string, content: string) =>
    Swal.fire({
      icon: 'info',
      title,
      html: `<pre style="white-space:pre-wrap;text-align:left;max-height:60vh;overflow:auto;">${content
        .replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s] as string))
        }</pre>`,
      confirmButtonText: '确定',
      width: 900,
    }),
};

/** 更健壮的 fetch：不自动跟随 302，且校验 content-type */
async function fetchJSON<T = any>(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, {
    cache: 'no-store',
    redirect: 'manual',
    headers: { Accept: 'application/json', ...(init?.headers || {}) },
    ...init,
  });

  if (res.status === 302 || res.status === 401 || res.status === 403) {
    throw new Error('未登录或无权限，请先在本站完成管理员登录后再重试。');
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error('接口返回非 JSON（可能被登录页/HTML拦截）：\n' + text.slice(0, 800));
  }

  return (await res.json()) as T;
}

/** 卡片容器 */
function Card(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { title, subtitle, children } = props;
  return (
    <div className="rounded-xl bg-white/80 dark:bg-gray-800/60 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700 p-6">
      <div className="mb-4">
        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</div>
        {subtitle ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

type ValidateItem = {
  key: string;
  name?: string;
  ok: boolean;
  message?: string;
  latency?: number; // ms
};

export default function AdminToolsPage() {
  /** —— 订阅配置 —— */
  const [subUrl, setSubUrl] = useState('');
  const [subPreview, setSubPreview] = useState<any | null>(null);
  const [subLoading, setSubLoading] = useState<'fetch' | 'apply' | null>(null);

  /** —— 源校验 —— */
  const [validating, setValidating] = useState(false);
  const [validateList, setValidateList] = useState<ValidateItem[]>([]);
  const okCount = useMemo(() => validateList.filter(i => i.ok).length, [validateList]);

  /** —— 日志 —— */
  const [logs, setLogs] = useState<string[]>([]);
  const [logBusy, setLogBusy] = useState(false);
  const logTimerRef = useRef<NodeJS.Timeout | null>(null);

  /** —— 数据迁移 —— */
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** 页面提示：仅管理员可用 + Cloudflare Pages 兼容 */
  const note = useMemo(
    () => '仅管理员可用 · Cloudflare Pages 兼容',
    []
  );

  /** ------- 订阅：获取/应用 ------- */
  const handleFetchSubscription = async () => {
    if (!subUrl.trim()) {
      toast.err('请先填写订阅地址');
      return;
    }
    try {
      setSubLoading('fetch');
      const data = await fetchJSON<any>(`/api/admin/config_subscription/fetch?url=${encodeURIComponent(subUrl.trim())}`);
      setSubPreview(data);
      toast.ok('获取订阅成功');
    } catch (e) {
      toast.err(e instanceof Error ? e.message : '获取订阅失败');
    } finally {
      setSubLoading(null);
    }
  };

  const handleApplySubscription = async () => {
    if (!subPreview) {
      toast.err('请先获取订阅预览');
      return;
    }
    try {
      setSubLoading('apply');
      const res = await fetchJSON<{ ok: boolean; message?: string }>(`/api/admin/config_subscription/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subPreview),
      });
      if (res.ok) {
        toast.ok('订阅已应用');
      } else {
        toast.err(res.message || '应用订阅失败');
      }
    } catch (e) {
      toast.err(e instanceof Error ? e.message : '应用订阅失败');
    } finally {
      setSubLoading(null);
    }
  };

  /** ------- 源校验 ------- */
  const handleValidate = async () => {
    try {
      setValidating(true);
      setValidateList([]);
      const data = await fetchJSON<{ items: ValidateItem[] }>(`/api/admin/source/validate`);
      setValidateList(Array.isArray(data.items) ? data.items : []);
      toast.ok('校验完成');
    } catch (e) {
      toast.err(e instanceof Error ? e.message : '校验失败');
    } finally {
      setValidating(false);
    }
  };

  /** ------- 日志：拉取/轮询 ------- */
  const fetchLogs = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLogBusy(true);
        const data = await fetchJSON<{ lines: string[] }>(`/api/admin/logs?limit=200`);
        setLogs(Array.isArray(data.lines) ? data.lines : []);
      } catch (e) {
        // 不弹 error，改为展示在模态里，避免把 HTML 淋到页面
        toast.text(
          `${location.host} 显示`,
          `获取日志失败：\n${e instanceof Error ? e.message : '未知错误'}`
        );
      } finally {
        if (!silent) setLogBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    // 初次拉一次日志
    fetchLogs(true).catch(() => undefined);
    // 每 30s 刷新一次
    logTimerRef.current = setInterval(() => fetchLogs(true), 30_000);
    return () => {
      if (logTimerRef.current) clearInterval(logTimerRef.current);
    };
  }, [fetchLogs]);

  /** ------- 数据迁移：导出 ------- */
  const handleExport = async () => {
    try {
      setExporting(true);
      // 返回 {fileName, content} 或 直接返回可下载的 JSON 字符串
      const data = await fetchJSON<{ fileName?: string; content?: any; ok?: boolean; message?: string }>(
        `/api/admin/data_migration/export`
      );

      const fileName = data.fileName || `baotuo-ys-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const contentStr =
        data && typeof data === 'object' && 'content' in data
          ? JSON.stringify(data.content, null, 2)
          : JSON.stringify(data, null, 2);

      const blob = new Blob([contentStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.ok('已导出为 JSON');
    } catch (e) {
      toast.err(e instanceof Error ? e.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  /** ------- 数据迁移：导入 ------- */
  const handleImport = async (file: File) => {
    try {
      setImporting(true);
      const text = await file.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        toast.err('文件不是有效的 JSON');
        return;
      }
      const res = await fetchJSON<{ ok: boolean; message?: string }>(`/api/admin/data_migration/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      if (res.ok) {
        toast.ok('导入成功');
      } else {
        toast.err(res.message || '导入失败');
      }
    } catch (e) {
      toast.err(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <PageLayout activePath="/admin">
      <div className="px-2 sm:px-10 py-4 sm:py-8">
        <div className="max-w-[1000px] mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold te
