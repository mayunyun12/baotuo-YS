/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ValidateResult = { key: string; name?: string; status: string };
type LogEvent = { type: string; message: string; ts: number; extra?: any };

function cls(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

async function fetchJSON<T = any>(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function AdminToolsPage() {
  // ---- 数据迁移与订阅 ----
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [subUrl, setSubUrl] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [subPreview, setSubPreview] = useState<any | null>(null);

  // ---- 源校验 ----
  const [validating, setValidating] = useState(false);
  const [validateRows, setValidateRows] = useState<ValidateResult[]>([]);

  // ---- 日志 ----
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // 从本地缓存恢复订阅地址
  useEffect(() => {
    try {
      const saved = localStorage.getItem('admin.tools.subscription.url');
      if (saved) setSubUrl(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (subUrl) localStorage.setItem('admin.tools.subscription.url', subUrl);
    } catch {}
  }, [subUrl]);

  // ---------- 数据导出 ----------
  const onExport = async () => {
    try {
      setExporting(true);
      const res = await fetch('/api/admin/data_migration/export', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();

      const blob = new Blob([JSON.stringify(json, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `baotuo-export-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('导出失败：' + (e?.message || String(e)));
    } finally {
      setExporting(false);
    }
  };

  // ---------- 数据导入 ----------
  const onImport = async (file?: File | null) => {
    try {
      const f = file || fileRef.current?.files?.[0];
      if (!f) return;

      setImporting(true);
      const text = await f.text();
      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('导入文件不是合法的 JSON');
      }

      const res = await fetch('/api/admin/data_migration/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      alert('导入成功');
    } catch (e: any) {
      alert('导入失败：' + (e?.message || String(e)));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ---------- 订阅获取 ----------
  const onFetchSub = async () => {
    if (!subUrl) return alert('请输入订阅地址');
    try {
      setSubLoading(true);
      const data = await fetchJSON<any>(
        `/api/admin/config_subscription/fetch?url=${encodeURIComponent(subUrl)}`,
        { cache: 'no-store' }
      );
      setSubPreview(data);
    } catch (e: any) {
      alert('订阅获取失败：' + (e?.message || String(e)));
    } finally {
      setSubLoading(false);
    }
  };

  // ---------- 订阅应用 ----------
  const onApplySub = async () => {
    if (!subPreview) return alert('请先获取订阅并确认内容');
    try {
      setSubLoading(true);
      const res = await fetch('/api/admin/config_subscription/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(subPreview),
      });
      if (!res.ok) throw new Error(await res.text());
      alert('订阅配置已应用');
    } catch (e: any) {
      alert('订阅应用失败：' + (e?.message || String(e)));
    } finally {
      setSubLoading(false);
    }
  };

  // ---------- 源校验 ----------
  const onValidate = async () => {
    try {
      setValidating(true);
      const data = await fetchJSON<ValidateResult[]>('/api/admin/source/validate', {
        cache: 'no-store',
      });
      setValidateRows(data || []);
    } catch (e: any) {
      alert('源校验失败：' + (e?.message || String(e)));
    } finally {
      setValidating(false);
    }
  };

  // ---------- 日志 ----------
  const onReloadLogs = async () => {
    try {
      setLoadingLogs(true);
      const data = await fetchJSON<LogEvent[]>('/api/admin/logs?limit=200', {
        cache: 'no-store',
      });
      setLogs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      alert('获取日志失败：' + (e?.message || String(e)));
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    onReloadLogs().catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin 扩展工具</h1>
        <p className="text-sm text-gray-500">仅管理员可用 · Cloudflare Pages 兼容</p>
      </header>

      {/* 1. 数据迁移与配置订阅 */}
      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="text-xl font-medium">1. 数据迁移与配置订阅</h2>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onExport}
            disabled={exporting}
            className={cls(
              'px-4 py-2 rounded bg-black text-white',
              exporting && 'opacity-60 cursor-not-allowed'
            )}
          >
            {exporting ? '导出中…' : '导出数据'}
          </button>

          <label className="px-4 py-2 rounded bg-gray-100 border cursor-pointer">
            选择导入 JSON
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => onImport(e.target.files?.[0])}
            />
          </label>

          <div className="flex-1 min-w-[260px] flex items-center gap-2">
            <input
              type="url"
              placeholder="订阅地址 https://…"
              value={subUrl}
              onChange={(e) => setSubUrl(e.target.value)}
              className="flex-1 px-3 py-2 border rounded"
            />
            <button
              onClick={onFetchSub}
              disabled={subLoading || !subUrl}
              className={cls(
                'px-4 py-2 rounded bg-blue-600 text-white',
                (!subUrl || subLoading) && 'opacity-60 cursor-not-allowed'
              )}
            >
              {subLoading ? '获取中…' : '获取订阅'}
            </button>
            <button
              onClick={onApplySub}
              disabled={!subPreview || subLoading}
              className={cls(
                'px-4 py-2 rounded bg-green-600 text-white',
                (!subPreview || subLoading) && 'opacity-60 cursor-not-allowed'
              )}
            >
              应用订阅
            </button>
            {subPreview && (
              <button
                onClick={() => setSubPreview(null)}
                className="px-3 py-2 rounded border bg-white"
                title="清除预览"
              >
                清除
              </button>
            )}
          </div>
        </div>

        {subPreview && (
          <div className="mt-3">
            <div className="text-sm text-gray-500 mb-1">订阅内容预览：</div>
            <pre className="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-sm border">
              {JSON.stringify(subPreview, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* 2. 源校验 */}
      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="text-xl font-medium">2. 源校验</h2>

        <div className="flex items-center gap-3">
          <button
            onClick={onValidate}
            disabled={validating}
            className={cls(
              'px-4 py-2 rounded bg-black text-white',
              validating && 'opacity-60 cursor-not-allowed'
            )}
          >
            {validating ? '校验中…' : '开始校验'}
          </button>
        </div>

        {validateRows.length > 0 && (
          <div className="overflow-auto">
            <table className="mt-3 w-full border text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 border text-left">Key</th>
                  <th className="px-2 py-1 border text-left">Name</th>
                  <th className="px-2 py-1 border text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {validateRows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-2 py-1 border">{r.key}</td>
                    <td className="px-2 py-1 border">{r.name || '-'}</td>
                    <td className="px-2 py-1 border">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. 日志 */}
      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="text-xl font-medium">3. 日志</h2>

        <div className="flex items-center gap-3">
          <button
            onClick={onReloadLogs}
            disabled={loadingLogs}
            className={cls(
              'px-4 py-2 rounded bg-black text-white',
              loadingLogs && 'opacity-60 cursor-not-allowed'
            )}
          >
            {loadingLogs ? '刷新中…' : '刷新'}
          </button>
        </div>

        <ul className="divide-y border rounded">
          {logs.map((l, idx) => (
            <li key={idx} className="p-2 text-sm">
              <div className="text-gray-500">
                {new Date(l.ts).toLocaleString()} • {l.type}
              </div>
              <div className="font-mono whitespace-pre-wrap break-all">{l.message}</div>
              {l.extra ? (
                <pre className="mt-1 bg-gray-50 p-2 rounded border">
                  {JSON.stringify(l.extra, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
          {logs.length === 0 && !loadingLogs && (
            <li className="p-3 text-sm text-gray-500">暂无日志</li>
          )}
        </ul>
      </section>

      <footer className="pt-2 text-xs text-gray-500">
        提示：若遇到“未登录/无权限”，请先在同域名下完成管理员登录再访问本页。
      </footer>
    </div>
  );
}
