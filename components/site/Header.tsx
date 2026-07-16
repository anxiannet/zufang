"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu, Plus, X } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";

const navigation = [
  { href: "/", label: "首页" },
  { href: "/rent", label: "房源" },
  { href: "/landlord/listings/new", label: "发布房源" },
  { href: "/about", label: "关于我们" }
];

export function Header({ is_admin = false }: { is_admin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/70 bg-white/90 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex h-10 w-12 items-center justify-center">
            <Image src="/brand/weijie-mark.png" alt="维界" width={48} height={30} priority className="h-auto w-12" />
          </span>
          <span>
            <span className="block text-base font-bold leading-none tracking-tight text-ink">NTU租房数据库</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Singapore · NTU</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-lg px-3 py-2 text-sm font-semibold transition",
                  active ? "bg-teal-50 text-brand" : "text-slate-600 hover:bg-slate-50 hover:text-ink"
                )}
              >
                {item.label}
              </Link>
            );
          })}
          {is_admin ? (
            <Link
              href="/admin"
              className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              <LayoutDashboard className="h-4 w-4" /> 管理后台
            </Link>
          ) : (
            <Link href="/auth/login" className="ml-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:text-ink">
              登录
            </Link>
          )}
          <Link href="/landlord/listings/new" className="btn-primary ml-2 min-h-10 px-3.5 py-2">
            <Plus className="h-4 w-4" /> 发布
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Link href="/landlord/listings/new" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand px-3 text-xs font-bold text-white">
            <Plus className="h-4 w-4" /> 发布房源
          </Link>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-ink"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "关闭导航" : "打开导航"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-line bg-white px-4 py-3 shadow-lg md:hidden" aria-label="移动端导航">
          <div className="mx-auto grid max-w-7xl gap-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-ink hover:bg-teal-50"
              >
                {item.label}
              </Link>
            ))}
            {is_admin ? (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
              >
                <LayoutDashboard className="h-4 w-4" /> 管理后台
              </Link>
            ) : (
              <Link href="/auth/login" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-ink hover:bg-teal-50">
                登录 / 注册
              </Link>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
