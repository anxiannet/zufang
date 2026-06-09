import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { supabaseRequest } from "@/src/db/pool";
import CommuteActionPanel from "./CommuteActionPanel";

type ListingIndexRow = {
  id: string;
  postal_code: string | null;
  status: string | null;
};

type CommuteCacheRow = {
  listing_index_id: string;
};

type CommuteJobRow = {
  id: string;
  status: string | null;
  postal_code: string | null;
};

type CommuteStats = {
  active: number;
  withPostal: number;
  cached: number;
  theoreticalPending: number;
  queuePending: number;
  queueFailed: number;
  invalidQueue: number;
};

const POSTAL_CODE_PATTERN = /^\d{6}$/;

export default async function AdminCommutePage() {
  noStore();
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <AdminShell>
        <AuthCard title="需要登录" body="后台管理仅管理员可访问。请先登录管理员账号。" href="/auth/login?next=/admin/commute" button="登录" />
      </AdminShell>
    );
  }

  if (profile.role !== "admin") {
    return (
      <AdminShell>
        <AuthCard title="无权限访问后台" body={`当前账号角色为 ${profile.role}，只有 admin 可以运行通勤补齐任务。`} href="/rent" button="返回找房" />
      </AdminShell>
    );
  }

  const stats = await getCommuteStats();

  return (
    <AdminShell>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-muted"><Link href="/admin" className="hover:text-ink">后台</Link> / 真实通勤补齐</div>
          <h1 className="mt-1 text-2xl font-bold text-ink">真实通勤补齐</h1>
          <p className="mt-2 text-sm text-muted">轻量操作页：点击按钮后会立即显示执行状态。</p>
        </div>
        <Link href="/admin" className="btn-secondary">返回后台</Link>
      </div>

      <CommuteStatsPanel stats={stats} />

      <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        建议日常顺序：先点“扫描有邮编房源”，再点“计算 NTU 通勤”。“理论待计算”来自房源与缓存差值；“队列待执行”才是执行器实际会处理的任务数。
      </section>

      <CommuteActionPanel />
    </AdminShell>
  );
}

async function getCommuteStats(): Promise<CommuteStats> {
  try {
    const [activeListings, cachedRows, jobRows] = await Promise.all([
      supabaseRequest<ListingIndexRow[]>("listing_indexes?select=id,postal_code,status&status=eq.active&limit=1000"),
      supabaseRequest<CommuteCacheRow[]>(
        "listing_commute_cache?select=listing_index_id&school_code=eq.NTU&mode=eq.bus&duration_minutes=not.is.null&limit=5000"
      ),
      supabaseRequest<CommuteJobRow[]>("commute_enrichment_jobs?select=id,status,postal_code&limit=5000")
    ]);

    const validPostalListingIds = activeListings
      .filter((row) => POSTAL_CODE_PATTERN.test(String(row.postal_code ?? "").trim()))
      .map((row) => row.id);
    const validPostalSet = new Set(validPostalListingIds);
    const cachedSet = new Set(cachedRows.map((row) => row.listing_index_id).filter((id) => validPostalSet.has(id)));

    return {
      active: activeListings.length,
      withPostal: validPostalListingIds.length,
      cached: cachedSet.size,
      theoreticalPending: Math.max(validPostalListingIds.length - cachedSet.size, 0),
      queuePending: jobRows.filter((row) => row.status === "pending" || row.status === "retry").length,
      queueFailed: jobRows.filter((row) => row.status === "failed").length,
      invalidQueue: jobRows.filter((row) => !POSTAL_CODE_PATTERN.test(String(row.postal_code ?? "").trim())).length
    };
  } catch (error) {
    console.error("Failed to load commute stats", error);
    return {
      active: 0,
      withPostal: 0,
      cached: 0,
      theoreticalPending: 0,
      queuePending: 0,
      queueFailed: 0,
      invalidQueue: 0
    };
  }
}

function CommuteStatsPanel({ stats }: { stats: CommuteStats }) {
  const items = [
    { label: "Active", value: stats.active, description: "当前 active 房源总数" },
    { label: "有邮编", value: stats.withPostal, description: "合法 6 位新加坡邮编" },
    { label: "已缓存", value: stats.cached, description: "已有 NTU bus 通勤缓存" },
    { label: "理论待计算", value: stats.theoreticalPending, description: "有邮编但无 NTU 缓存" },
    { label: "队列待执行", value: stats.queuePending, description: "pending/retry 实际任务" },
    { label: "队列失败", value: stats.queueFailed, description: "failed 任务数量" },
    { label: "无效队列", value: stats.invalidQueue, description: "无效或空邮编任务" }
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-line bg-white p-4 shadow-sm">
          <div className="text-sm text-muted">{item.label}</div>
          <div className="mt-2 text-3xl font-bold text-ink">{item.value}</div>
          <div className="mt-1 text-xs text-muted">{item.description}</div>
        </div>
      ))}
    </section>
  );
}

function AuthCard({ title, body, href, button }: { title: string; body: string; href: string; button: string }) {
  return (
    <div className="card p-6 text-center">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <Link href={href} className="btn-primary mt-4">{button}</Link>
    </div>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">{children}</main>;
}
