import Link from "next/link";
import { searchDebugListings, SearchDebugResult } from "@/actions/searchDebug";
import { getCurrentProfile } from "@/lib/auth";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SearchDebugAdminPage({ searchParams }: PageProps) {
  const profile = await getCurrentProfile();
  const params = (await searchParams) ?? {};
  const q = field(params.q);

  if (!profile) {
    return (
      <Shell>
        <AccessCard title="需要登录" message="搜索调试仅管理员可访问。请先登录管理员账号。" actionHref="/auth/login?next=/admin/search-debug" actionText="登录" />
      </Shell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <Shell>
        <AccessCard title="无权限访问" message={`当前账号角色为 ${profile.role}，只有 admin 可以使用搜索调试。`} actionHref="/rent" actionText="返回找房" />
      </Shell>
    );
  }

  const results = q ? await searchDebugListings(q) : [];

  return (
    <Shell>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-medium text-muted">
            <Link href="/admin" className="hover:text-ink">后台</Link>
            <span className="px-2">/</span>
            <Link href="/admin/index-listings" className="hover:text-ink">索引房源</Link>
            <span className="px-2">/</span>
            搜索调试
          </div>
          <h1 className="mt-2 text-2xl font-bold text-ink">搜索调试</h1>
          <p className="mt-2 text-sm text-muted">输入自然语言搜索词，查看命中房源、调试得分、匹配原因和索引标签。</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/index-listings" className="btn-secondary">查看索引层</Link>
          <Link href="/admin/ingestion" className="btn-secondary">采集管理</Link>
        </div>
      </div>

      <section className="card p-4">
        <form className="grid gap-3 md:grid-cols-[1fr_auto]" action="/admin/search-debug">
          <div>
            <label htmlFor="q">搜索词</label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="例如：NTU 普通房 可煮 1200以内"
            />
          </div>
          <button className="btn-primary self-end" type="submit">调试搜索</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <Link className="rounded bg-gray-100 px-2 py-1 hover:text-ink" href="/admin/search-debug?q=NTU%20普通房%20可煮%201200以内">NTU 普通房 可煮 1200以内</Link>
          <Link className="rounded bg-gray-100 px-2 py-1 hover:text-ink" href="/admin/search-debug?q=主人房%20可报地址%20裕廊西">主人房 可报地址 裕廊西</Link>
          <Link className="rounded bg-gray-100 px-2 py-1 hover:text-ink" href="/admin/search-debug?q=NUS附近%20单人间">NUS附近 单人间</Link>
        </div>
      </section>

      {q ? (
        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="搜索结果" value={results.length} />
          <Metric label="NTU匹配" value={countDebugReason(results, "NTU_MATCH")} />
          <Metric label="普通房匹配" value={countDebugReason(results, "ROOM_COMMON")} />
          <Metric label="可煮匹配" value={countDebugReason(results, "COOKING_ALLOWED")} />
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">调试结果</h2>
          <p className="mt-1 text-sm text-muted">按 debug_score 和 NTU 分数排序，最多显示 50 条。</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1500px] w-full border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">排名</th>
                <th className="px-4 py-3">房源</th>
                <th className="px-4 py-3">价格/区域</th>
                <th className="px-4 py-3">房型</th>
                <th className="px-4 py-3">分数</th>
                <th className="px-4 py-3">调试原因</th>
                <th className="px-4 py-3">索引原因</th>
                <th className="px-4 py-3">语义标签</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={result.id} className="border-t border-line align-top">
                  <td className="px-4 py-3 text-lg font-bold text-ink">#{index + 1}</td>
                  <td className="max-w-[420px] px-4 py-3">
                    <div className="font-semibold text-ink">{result.title || "未命名房源"}</div>
                    {result.summary ? <p className="mt-2 line-clamp-3 text-muted">{result.summary}</p> : null}
                    <div className="mt-2 text-xs text-muted">{result.source ?? "unknown"} · {result.source_id ?? "-"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{result.price ? `$${result.price}` : "价格未识别"}</div>
                    <div className="mt-1 text-muted">{result.mrt_area ?? "区域未识别"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{result.room_type ?? "-"}</div>
                    <div className="mt-1 text-xs font-semibold text-muted">{formatRoomType(result.normalized_room_type)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-lg font-bold text-ink">{result.debug_score}</div>
                    <div className="mt-1 text-xs text-muted">NTU: {result.ntu_score ?? 0}</div>
                    <div className="mt-1 text-xs text-muted">学生友好: {formatBool(result.student_friendly)}</div>
                  </td>
                  <td className="px-4 py-3"><TagList tags={result.debug_reasons} color="blue" /></td>
                  <td className="px-4 py-3"><TagList tags={result.match_reasons ?? []} /></td>
                  <td className="max-w-[320px] px-4 py-3"><TagList tags={[...(result.school_fit_tags ?? []), ...(result.semantic_tags ?? [])]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q && results.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted">没有命中结果。</div> : null}
        {!q ? <div className="px-4 py-8 text-center text-sm text-muted">请输入搜索词开始调试。</div> : null}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">{children}</div>;
}

function AccessCard({ title, message, actionHref, actionText }: { title: string; message: string; actionHref: string; actionText: string }) {
  return (
    <div className="card p-6 text-center">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <Link href={actionHref} className="btn-primary mt-4">{actionText}</Link>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}

function TagList({ tags, color = "gray" }: { tags: string[]; color?: "gray" | "blue" }) {
  if (!tags.length) return <span className="text-xs text-muted">无</span>;
  const className = color === "blue" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-700";
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className={`rounded px-2 py-1 text-xs font-semibold ${className}`}>
          {tag}
        </span>
      ))}
    </div>
  );
}

function countDebugReason(results: SearchDebugResult[], reason: string) {
  return results.filter((result) => result.debug_reasons.includes(reason)).length;
}

function formatRoomType(value: string | null) {
  if (value === "master_room") return "主人房";
  if (value === "common_room") return "普通房";
  if (value === "partition_room") return "单人间/隔间";
  if (value === "whole_unit") return "整套";
  return value ?? "unknown";
}

function formatBool(value: boolean | null) {
  if (value === true) return "是";
  if (value === false) return "否";
  return "未说明";
}

function field(value: string | string[] | undefined) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}
