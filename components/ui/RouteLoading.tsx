export function RouteLoading({ cards = 3 }: { cards?: number }) {
  return (
    <div className="container-page space-y-5 py-10">
      <div className="card h-36 animate-pulse bg-white/70" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className="card h-48 animate-pulse bg-white/70" />
        ))}
      </div>
    </div>
  );
}
