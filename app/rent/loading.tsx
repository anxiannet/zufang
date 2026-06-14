export default function RentLoading() {
  return (
    <>
      <section className="border-b border-line bg-white">
        <div className="container-page py-14 sm:py-20">
          <div className="h-4 w-40 animate-pulse rounded bg-teal-100" />
          <div className="mt-5 h-12 max-w-2xl animate-pulse rounded-xl bg-slate-200" />
          <div className="mt-3 h-6 max-w-xl animate-pulse rounded bg-slate-100" />
          <div className="card mt-8 h-32 animate-pulse bg-white/80" />
        </div>
      </section>
      <div className="container-page py-10">
        <div className="mb-5 h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card overflow-hidden">
              <div className="aspect-[16/10] animate-pulse bg-slate-200" />
              <div className="space-y-3 p-5">
                <div className="h-7 w-28 animate-pulse rounded bg-slate-200" />
                <div className="h-5 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
