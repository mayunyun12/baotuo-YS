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

export default function Page() {
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

  /** —— 渲染 —— */
  return (
    <PageLayout activePath="/admin">
      <div className="px-2 sm:px-10 py-4 sm:py-8">
        <div className="max-w-[1000px] mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin 扩展工具</h1>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{note}</div>
          </div>

          {/* 1. 数据迁移与配置订阅 */}
          <Card title="1. 数据迁移与配置订阅" subtitle="即刻见效 · 逻辑简单">
            <div className="space-y-6">
              {/* 导入 / 导出 */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className={`px-4 py-2 rounded bg-black text-white hover:opacity-90 ${exporting ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {exporting ? '正在导出…' : '导出数据'}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className={`px-4 py-2 rounded bg-gray-700 text-white hover:opacity-90 ${importing ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {importing ? '正在导入…' : '选择导入 JSON'}
                </button>
              </div>

              {/* 订阅配置 */}
              <div className="rounded-lg ring-1 ring-gray-200 dark:ring-gray-700 p-4 bg-gray-50/60 dark:bg-gray-900/40">
                <div className="text-sm font-medium mb-3 text-gray-800 dark:text-gray-200">配置订阅</div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    value={subUrl}
                    onChange={e => setSubUrl(e.target.value)}
                    placeholder="订阅地址（返回 JSON）"
                    className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleFetchSubscription}
                      disabled={!subUrl || subLoading !== null}
                      className={`px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 ${subLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {subLoading === 'fetch' ? '获取中…' : '获取订阅'}
                    </button>
                    <button
                      onClick={handleApplySubscription}
                      disabled={!subPreview || subLoading !== null}
                      className={`px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 ${subLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {subLoading === 'apply' ? '应用中…' : '应用订阅'}
                    </button>
                  </div>
                </div>

                {/* 预览 */}
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  {subPreview ? (
                    <button
                      onClick={() => toast.text('订阅预览', JSON.stringify(subPreview, null, 2))}
                      className="underline underline-offset-4 hover:opacity-80"
                    >
                      查看预览 JSON
                    </button>
                  ) : (
                    <span>未获取预览</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* 2. 源校验 */}
          <div className="mt-6">
            <Card title="2. 源校验" subtitle="方便管理资源站健康">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleValidate}
                  disabled={validating}
                  className={`px-4 py-2 rounded bg-black text-white hover:opacity-90 ${validating ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {validating ? '校验中…' : '开始校验'}
                </button>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {validateList.length > 0
                    ? `可用 ${okCount}/${validateList.length}`
                    : '点击“开始校验”'}
                </div>
              </div>

              {/* 结果表 */}
              {validateList.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400">
                        <th className="py-2 pr-4">Key</th>
                        <th className="py-2 pr-4">名称</th>
                        <th className="py-2 pr-4">状态</th>
                        <th className="py-2 pr-4">耗时</th>
                        <th className="py-2 pr-4">信息</th>
                      </tr>
                    </thead>
                    <tbody className="align-top">
                      {validateList.map(item => (
                        <tr key={item.key} className="border-t border-gray-200 dark:border-gray-700">
                          <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">{item.key}</td>
                          <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">{item.name || '-'}</td>
                          <td className="py-2 pr-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${item.ok
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                }`}
                            >
                              {item.ok ? 'OK' : 'Fail'}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                            {typeof item.latency === 'number' ? `${item.latency} ms` : '-'}
                          </td>
                          <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                            {item.message || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* 3. 日志 */}
          <div className="mt-6 mb-12">
            <Card title="3. 日志" subtitle="完善监控与调试">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => fetchLogs(false)}
                  disabled={logBusy}
                  className={`px-4 py-2 rounded bg-gray-800 text-white hover:opacity-90 ${logBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {logBusy ? '刷新中…' : '刷新'}
                </button>
                <div className="text-xs text-gray-500 dark:text-gray-400">显示最近 200 条</div>
              </div>

              <div className="h-[360px] overflow-auto rounded border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-3">
                {logs.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">暂无日志</div>
                ) : (
                  <pre className="text-xs leading-5 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {logs.join('\n')}
                  </pre>
                )}
              </div>
            </Card>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            提示：若遇到“未登录/无权限”，请先在同域名下完成管理员登录再访问本页。
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
