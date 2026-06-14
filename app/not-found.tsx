import Link from "next/link";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="container-page py-20">
      <div className="card mx-auto max-w-xl px-6 py-14 text-center">
        <div className="text-sm font-bold uppercase tracking-[0.18em] text-brand">404</div>
        <h1 className="mt-3 text-2xl font-bold text-ink">这个页面或房源不存在</h1>
        <p className="mt-3 text-sm leading-6 text-muted">房源可能已下架、已出租，或链接已经失效。</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/rent" className="btn-primary"><Search className="h-4 w-4" /> 继续找房</Link>
          <Link href="/" className="btn-secondary"><Home className="h-4 w-4" /> 返回首页</Link>
        </div>
      </div>
    </div>
  );
}
