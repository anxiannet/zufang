"use client";

export default function AdminCommuteError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950">
        <h1 className="text-xl font-bold">真实通勤后台加载失败</h1>
        <p className="mt-3 text-sm leading-6">
          页面服务端查询失败。请在 Vercel Logs 中继续查看对应 digest 的完整错误信息。
        </p>
        <div className="mt-4 rounded-xl bg-white p-4 text-sm">
          <div>Digest: {error.digest ?? "无"}</div>
          <div className="mt-2 whitespace-pre-wrap">{error.message || "服务端错误没有返回具体 message"}</div>
        </div>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white"
        >
          重试加载
        </button>
      </section>
    </main>
  );
}
