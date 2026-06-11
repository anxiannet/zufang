import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container-page py-12">
      <section className="card mx-auto max-w-3xl p-8 text-center md:p-12">
        <p className="text-sm font-semibold text-brand">Singapore Rental Platform</p>
        <h1 className="mt-3 text-3xl font-bold text-ink md:text-4xl">找到适合你生活状态的房间</h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted">
          重点比较租金、地点、入住时间、共住人数、共用浴室人数、屋主是否同住和生活规则。
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/rent" className="btn-primary">浏览正式房源</Link>
          <Link href="/landlord/listings/new" className="btn-secondary">发布房源</Link>
        </div>
      </section>
    </main>
  );
}
