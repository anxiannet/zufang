import { signIn, signUp } from "@/actions/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "";
  const reason = typeof params.reason === "string" ? params.reason : "";

  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-8 md:grid-cols-2">
      <section className="card p-5">
        <h1 className="text-xl font-bold">登录</h1>
        {reason === "enquiry" ? <p className="mt-2 text-sm text-muted">登录后可以向房东发送咨询。</p> : null}
        {reason === "listing" ? <p className="mt-2 text-sm text-muted">登录房东、中介或管理员账号后可以发布房源。</p> : null}
        <form action={signIn} className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <input name="email" type="email" required placeholder="Email" />
          <input name="password" type="password" required placeholder="密码" />
          <button className="btn-primary w-full" type="submit">登录</button>
        </form>
      </section>
      <section className="card p-5">
        <h2 className="text-xl font-bold">注册</h2>
        <form action={signUp} className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next} />
          <input name="display_name" required placeholder="显示名称" />
          <input name="email" type="email" required placeholder="Email" />
          <input name="password" type="password" required placeholder="密码" />
          <select name="role" defaultValue="tenant">
            <option value="tenant">租客</option>
            <option value="landlord">房东</option>
            <option value="agent">中介 / 代管人</option>
          </select>
          <input name="phone" placeholder="电话" />
          <input name="whatsapp" placeholder="WhatsApp，例：6591234567" />
          <input name="wechat" placeholder="微信" />
          <button className="btn-primary w-full" type="submit">创建账号</button>
        </form>
      </section>
    </div>
  );
}
