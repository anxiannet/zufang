import Link from "next/link";
import { BusFront, Database, Home, ShieldCheck } from "lucide-react";

const values = [
  { icon: Database, title: "结构化整理", description: "把价格、入住条件、共住人数和居住规则拆成可筛选的信息。" },
  { icon: BusFront, title: "NTU 通勤参考", description: "结合邮编与路线缓存，帮助学生更快判断每天通勤成本。" },
  { icon: Home, title: "居住体验优先", description: "不仅看装修，也看共住人数、共浴人数、屋主是否同住。" },
  { icon: ShieldCheck, title: "透明与核验", description: "明确标注信息状态，同时持续提醒租客线下核验身份与租约。" }
];

export default function AboutPage() {
  return (
    <div className="container-page py-12 sm:py-16">
      <section className="card subtle-grid overflow-hidden px-6 py-12 text-center sm:px-12">
        <div className="eyebrow">About Weijie Rental</div>
        <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-5xl">
          让新加坡租房信息，更接近真实生活
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted">
          维界租房不是简单的房源列表。我们希望把散落的信息整理成一套可比较、可搜索、可持续更新的居住关系数据库。
        </p>
      </section>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {values.map(({ icon: Icon, title, description }) => (
          <div key={title} className="card p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-brand">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="mt-4 font-bold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          </div>
        ))}
      </section>
      <section className="mt-8 rounded-2xl bg-slate-900 px-6 py-8 text-white sm:flex sm:items-center sm:justify-between sm:px-8">
        <div>
          <h2 className="text-xl font-bold">正在找 NTU 周边房源？</h2>
          <p className="mt-2 text-sm text-slate-300">从通勤、预算和居住条件开始筛选。</p>
        </div>
        <Link href="/rent" className="btn-primary mt-5 sm:mt-0">查看最新房源</Link>
      </section>
    </div>
  );
}
