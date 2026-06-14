export default function ListingDetailLoading() {
  return (
    <div className="container-page py-8">
      <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
      <div className="mt-5 grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div className="aspect-[16/9] animate-pulse rounded-2xl bg-slate-200" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <div className="animate-pulse rounded-2xl bg-slate-100" />
          <div className="animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </div>
      <div className="card mx-4 -mt-5 h-48 animate-pulse" />
      <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="card h-56 animate-pulse" />)}
        </div>
        <div className="card h-96 animate-pulse" />
      </div>
    </div>
  );
}
