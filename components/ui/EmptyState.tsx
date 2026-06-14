import Link from "next/link";
import { SearchX } from "lucide-react";

export function EmptyState() {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-brand">
        <SearchX className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-lg font-bold text-ink">暂时没有匹配的房源</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">
        可以放宽价格、入住日期或居住条件。维界会持续整理 NTU 周边新房源。
      </p>
      <Link href="/rent" className="btn-secondary mt-5">清除筛选条件</Link>
    </div>
  );
}
