import Link from "next/link";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-slate-950 text-slate-300">
      <div className="container-page grid gap-8 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Image
            src="/brand/weijie-logo-full.png"
            alt="维界 WEIJIE"
            width={144}
            height={126}
            className="h-auto w-28 brightness-125 sm:w-32"
          />
          <div className="mt-3 text-lg font-bold text-white">NTU租房数据库</div>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
            面向新加坡华人学生与屋主的结构化租房信息平台，重点整理 NTU 通勤、居住关系和真实生活条件。
          </p>
        </div>
        <div>
          <div className="text-sm font-bold text-white">快速入口</div>
          <div className="mt-3 grid gap-2 text-sm">
            <Link href="/rent" className="hover:text-white">浏览房源</Link>
            <Link href="/landlord/listings/new" className="hover:text-white">发布房源</Link>
            <Link href="/about" className="hover:text-white">关于我们</Link>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-teal-400" /> 租房安全提示
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            信息仅供参考，请实地核验屋主身份、房屋状况与租约条件。签约或付款前请勿仅依赖线上信息。
          </p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} NTU租房数据库 · Singapore Rental Platform
      </div>
    </footer>
  );
}
