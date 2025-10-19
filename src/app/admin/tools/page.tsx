/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
'use client';

export const dynamic = 'force-dynamic';
export const revalidate = false;
export const fetchCache = 'force-no-store';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import PageLayout from '@/components/PageLayout';
import { Check, ChevronDown, ChevronUp, CloudUpload, Database, List, RefreshCw, Save, Search, ShieldAlert } from 'lucide-react';

/* ====================== 通用弹窗 ====================== */
const alertError = (message: string) =>
  Swal.fire({ icon: 'error', title: '错误', text: message });

const alertOk = (message: string) =>
  Swal.fire({
    icon: 'success',
    title: '成功',
    text: message,
    timer: 1600,
    showConfirmButton: false,
  });

/* ====================== 折叠面板 ====================== */
function Collapsible({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl shadow-sm mb-4 overflow-hidden bg-white/80 backdrop-blur-md dark:bg-gray-800/50 dark:ring-1 dark:ring-gray-700">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between bg-gray-50/70 dark:bg-gray-800/60 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{title}</h3>
        </div>
        <div className="text-gray-500 dark:text-gray-400">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
      </button>
      {open && <div className="px-6 py-5">{children}</div>}
    </div>
  );
}

/* ====================== 数据迁移与订阅 ====================== */
function SectionMigrateAndSubscription() {
  // 迁移
  const [migrating, setMigrating] = useState(false);
  const [migrationKey, setMigrationKey] = useState<string>('');
  const [migrationNote, setMigrationNote] = useState<string>('');

  // 订阅
  const [subSaving, setSubSaving] = useState(false);
  const [subUrl, setSubUrl] = useState('');
  const [subToken, setSubToken] = useState('');
  const [subOverwrite, setSubOverwrite] = useState(true);

  const canMigrate = useMemo(() => migrationKey.trim().length > 0, [migrationKey]);
  const canSaveSub = useMemo(() => subUrl.trim().length > 0, [subUrl]);

  const runMigrate = async () => {
    try {
      if (!canMigrate) {
        alertError('请输入迁移密钥或导出包标识');
        return;
      }
      setMigrating(true);
      const resp = await fetch('/api/admin/tools/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          key: migrationKey.trim(),
          note: migrationNote.trim() || undefined,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({} as any));
        throw new Error(data.error || `迁移失败：${resp.status}`);
      }
      alertOk('迁移已完成');
    } catch (e) {
      alertError(e instanceof Error ? e.message : '迁移失败');
    } finally {
      setMigrating(false);
    }
  };

  const saveSubscription = async () => {
    try {
      if (!canSaveSub) {
        alertError('请输入订阅地址');
        return;
      }
      setSubSaving(true);
      const resp = await fetch('/api/admin/tools/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: subUrl.trim(),
          token: subToken.trim() || undefined,
          overwrite: subOverwrite,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({} as any));
        throw new Error(data.error || `保存失败：${resp.status}`);
      }
      alertOk('订阅已保存');
    } catch (e) {
      alertError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 数据迁移 */}
      <div>
        <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">数据迁移</h4>
        <div className="p-4 border rounded-xl bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={migrationKey}
              onChange={(e) => setMigrationKey(e.target.value)}
              placeholder="迁移密钥 / 导出包标识"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <input
              value={migrationNote}
              onChange={(e) => setMigrationNote(e.target.value)}
              placeholder="备注（可选）"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={runMigrate}
              disabled={!canMigrate || migrating}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
                !canMigrate || migrating ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <CloudUpload size={16} />
              {migrating ? '迁移中…' : '开始迁移'}
            </button>
          </div>
        </div>
      </div>

      {/* 配置订阅 */}
      <div>
        <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">配置订阅</h4>
        <div className="p-4 border rounded-xl bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 space-y-3">
          <input
            value={subUrl}
            onChange={(e) => setSubUrl(e.target.value)}
            placeholder="订阅地址（必填）"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <input
            value={subToken}
            onChange={(e) => setSubToken(e.target.value)}
            placeholder="访问令牌（可选）"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
            <input
              type="checkbox"
              checked={subOverwrite}
              onChange={(e) => setSubOverwrite(e.target.checked)}
              className="h-4 w-4"
            />
            覆盖现有同名项（推荐）
          </label>
          <div className="flex justify-end">
            <button
              onClick={saveSubscription}
              disabled={!canSaveSub || subSaving}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
                !canSaveSub || subSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <Save size={16} />
              {subSaving ? '保存中…' : '保存订阅'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ====================== 源校验 ====================== */
type SourceHealth = {
  key: string;
  name?: string;
  status: 'ok' | 'warn' | 'error';
  latencyMs?: number;
  message?: string;
};

function SectionSourceCheck() {
  const [checking, setChecking] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState<SourceHealth[]>([]);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return rows;
    const k = keyword.trim().toLowerCase();
    return rows.filter((r) => r.key.toLowerCase().includes(k) || (r.name || '').toLowerCase().includes(k));
  }, [rows, keyword]);

  const runCheckAll = async () => {
    try {
      setChecking(true);
      const resp = await fetch('/api/admin/tools/check-source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'all' }) });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({} as any));
        throw new Error(data.error || `检测失败：${resp.status}`);
      }
      const data = (await resp.json()) as { result: SourceHealth[] };
      setRows(data.result || []);
      alertOk('已完成检测');
    } catch (e) {
      alertError(e instanceof Error ? e.message : '检测失败');
    } finally {
      setChecking(false);
    }
  };

  const runCheckOne = async (key: string) => {
    try {
      const resp = await fetch('/api/admin/tools/check-source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'one', key }) });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({} as any));
        throw new Error(data.error || `检测失败：${resp.status}`);
      }
      const data = (await resp.json()) as { result: SourceHealth };
      setRows((prev) => {
        const copy = [...prev];
        const idx = copy.findIndex((x) => x.key === key);
        if (idx >= 0) copy[idx] = data.result;
        else copy.unshift(data.result);
        return copy;
      });
      alertOk('已完成检测');
    } catch (e) {
      alertError(e instanceof Error ? e.message : '检测失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={runCheckAll}
          disabled={checking}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white ${checking ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        >
          <RefreshCw size={16} />
          {checking ? '检测中…' : '一键检测全部源'}
        </button>
        <div className="flex-1"></div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            placeholder="按 key / 名称过滤"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="pl-9 pr-3 py-2 w-64 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Key</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">名称</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">状态</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">延迟(ms)</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">信息</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filtered.map((r) => (
              <tr key={r.key} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{r.key}</td>
                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{r.name || '-'}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      r.status === 'ok'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                        : r.status === 'warn'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {r.status === 'ok' ? '正常' : r.status === 'warn' ? '异常' : '错误'}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{r.latencyMs ?? '-'}</td>
                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 max-w-[20rem] truncate" title={r.message || ''}>
                  {r.message || '-'}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => runCheckOne(r.key)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100"
                  >
                    <Check size={14} />
                    重新检测
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  暂无数据，请点击「一键检测全部源」
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ====================== 日志页 ====================== */
type LogRow = {
  id: string;
  t: string; // ISO 时间
  level: 'info' | 'warn' | 'error' | 'debug';
  msg: string;
};

function SectionLogs() {
  const [level, setLevel] = useState<'all' | LogRow['level']>('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(true);

  const label = (l: LogRow['level']) =>
    l === 'error' ? '错误' : l === 'warn' ? '警告' : l === 'debug' ? '调试' : '信息';

  const tagClass = (l: LogRow['level']) =>
    l === 'error'
      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
      : l === 'warn'
      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
      : l === 'debug'
      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300'
      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';

  const load = async (reset = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (level !== 'all') params.set('level', level);
      if (q.trim()) params.set('q', q.trim());
      if (!reset && cursor) params.set('cursor', cursor);

      const resp = await fetch(`/api/admin/tools/logs?${params.toString()}`, { method: 'GET' });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({} as any));
        throw new Error(data.error || `获取失败：${resp.status}`);
      }
      const data = (await resp.json()) as { items: LogRow[]; nextCursor?: string | null };
      if (reset) {
        setRows(data.items || []);
      } else {
        setRows((prev) => [...prev, ...(data.items || [])]);
      }
      setCursor(data.nextCursor ?? null);
      setMore(Boolean(data.nextCursor));
    } catch (e) {
      alertError(e instanceof Error ? e.message : '获取日志失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 首次加载
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <List size={18} className="text-gray-500" />
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="all">全部级别</option>
            <option value="error">错误</option>
            <option value="warn">警告</option>
            <option value="info">信息</option>
            <option value="debug">调试</option>
          </select>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="关键词筛选（消息内容）"
            className="pl-9 pr-3 py-2 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          onClick={() => load(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700"
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-[28rem] overflow-y-auto overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">时间</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">级别</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">消息</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                  {new Date(r.t).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${tagClass(r.level)}`}>{label(r.level)}</span>
                </td>
                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{r.msg}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  暂无日志
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {more && (
        <div className="flex justify-center">
          <button
            onClick={() => load(false)}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-800'
            }`}
          >
            加载更多
          </button>
        </div>
      )}
    </div>
  );
}

/* ====================== 页面骨架 ====================== */
function ToolsPageClient() {
  const [open, setOpen] = useState({
    a: true, // 数据迁移与订阅
    b: false, // 源校验
    c: false, // 日志
  });

  return (
    <PageLayout activePath="/admin">
      <div className="px-2 sm:px-10 py-4 sm:py-8">
        <div className="max-w-[1000px] mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">管理员工具</h1>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
              <ShieldAlert size={12} />
              高级
            </span>
          </div>

          <Collapsible
            title="数据迁移与订阅"
            icon={<Database size={18} className="text-gray-600 dark:text-gray-400" />}
            open={open.a}
            onToggle={() => setOpen((p) => ({ ...p, a: !p.a }))}
          >
            <SectionMigrateAndSubscription />
          </Collapsible>

          <Collapsible
            title="源校验"
            icon={<Check size={18} className="text-gray-600 dark:text-gray-400" />}
            open={open.b}
            onToggle={() => setOpen((p) => ({ ...p, b: !p.b }))}
          >
            <SectionSourceCheck />
          </Collapsible>

          <Collapsible
            title="日志页"
            icon={<List size={18} className="text-gray-600 dark:text-gray-400" />}
            open={open.c}
            onToggle={() => setOpen((p) => ({ ...p, c: !p.c }))}
          >
            <SectionLogs />
          </Collapsible>
        </div>
      </div>
    </PageLayout>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ToolsPageClient />
    </Suspense>
  );
}
