import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "NTU租房数据库",
  description: "面向新加坡华人的租房发布、搜索和审核平台"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-ink">
              NTU租房数据库
            </Link>
            <nav className="flex items-center gap-3 text-sm font-medium text-muted">
              <Link href="/" className="hover:text-ink">找房</Link>
              <Link href="/landlord/listings/new" className="hover:text-ink">发布房源</Link>
              <Link href="/admin" className="hover:text-ink">后台</Link>
              <Link href="/auth/login" className="hover:text-ink">登录</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
