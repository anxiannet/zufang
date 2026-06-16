import Image from "next/image";
import { CheckCircle2, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { signIn, signUp } from "@/actions/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  const reason = typeof params.reason === "string" ? params.reason : "";

  return (
    <div className="container-page py-10 sm:py-16">
      <div className="grid overflow-hidden rounded-2xl border border-white/80 bg-white shadow-lift lg:grid-cols-[0.9fr_1.1fr]">
        <section className="subtle-grid bg-slate-950 p-7 text-white sm:p-10">
          <Image src="/brand/weijie-logo-full.png" alt="维界 WEIJIE" width={168} height={147} priority className="h-auto w-36 brightness-125" />
          <div className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-teal-300">Weijie Rental Account</div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">登录维界租房</h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-slate-300">
            收藏和咨询房源，或以屋主身份发布结构化房源信息。
          </p>
          <div className="mt-8 space-y-4">
            {["联系方式按房源设置保护", "发布信息进入平台整理流程", "租客与屋主角色清晰分离"].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-slate-200">
                <CheckCircle2 className="h-4 w-4 text-teal-300" /> {item}
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 p-5 sm:p-8 md:grid-cols-2">
          <section>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-brand"><KeyRound className="h-5 w-5" /></div>
            <h2 className="mt-4 text-xl font-bold text-ink">已有账号</h2>
            {reason === "enquiry" ? <Notice>登录后可以向正式房源发送咨询。</Notice> : null}
            {reason === "listing" ? <Notice>登录房东、中介或管理员账号后可以发布房源。</Notice> : null}
            <form action={signIn} className="mt-5 space-y-3">
              <input type="hidden" name="next" value={next} />
              <label className="block">邮箱<input className="mt-1.5" name="email" type="email" required placeholder="name@example.com" /></label>
              <label className="block">密码<input className="mt-1.5" name="password" type="password" required placeholder="输入密码" /></label>
              <button className="btn-primary w-full" type="submit">登录</button>
            </form>
          </section>

          <section className="border-t border-line pt-6 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><UserPlus className="h-5 w-5" /></div>
            <h2 className="mt-4 text-xl font-bold text-ink">创建账号</h2>
            <p className="mt-2 text-sm leading-6 text-muted">根据用途选择租客、房东或代管角色。</p>
            <form action={signUp} className="mt-5 space-y-3">
              <input type="hidden" name="next" value={next} />
              <input name="display_name" required placeholder="显示名称" aria-label="显示名称" />
              <input name="email" type="email" required placeholder="邮箱" aria-label="邮箱" />
              <input name="password" type="password" required placeholder="设置密码" aria-label="设置密码" />
              <select name="role" defaultValue="tenant" aria-label="账号角色">
                <option value="tenant">租客</option>
                <option value="landlord">房东</option>
                <option value="agent">中介 / 代管人</option>
              </select>
              <details className="rounded-xl border border-line bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-ink">补充联系方式，可选</summary>
                <div className="mt-3 space-y-3">
                  <input name="phone" placeholder="电话" aria-label="电话" />
                  <input name="whatsapp" placeholder="WhatsApp，例如 6591234567" aria-label="WhatsApp" />
                  <input name="wechat" placeholder="微信" aria-label="微信" />
                </div>
              </details>
              <button className="btn-secondary w-full" type="submit">创建账号</button>
            </form>
          </section>
        </div>
      </div>
      <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted">
        <ShieldCheck className="h-4 w-4 text-brand" /> 请勿在账号资料中填写身份证件或银行卡信息。
      </p>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">{children}</div>;
}
