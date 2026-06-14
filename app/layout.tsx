import type { Metadata } from "next";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "维界租房 | 新加坡 NTU 周边真实房源数据库",
    template: "%s | 维界租房"
  },
  description: "按通勤、价格、房型和入住条件筛选新加坡 NTU 周边房源，帮助学生与屋主更高效匹配。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Header />
        <main className="min-h-[70vh]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
