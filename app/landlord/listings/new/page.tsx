import { LandlordListingForm } from "@/components/LandlordListingForm";
import { getCurrentProfile } from "@/lib/auth";
import Link from "next/link";

export default async function NewListingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await getCurrentProfile();
  const params = await searchParams;
  const missing = typeof params.missing === "string" ? params.missing : "";
  const missingLabels: Record<string, string> = {
    title: "标题",
    postal_code: "邮编",
    rent_amount: "租金",
    available_from: "可入住日期"
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">发布房源</h1>
        <p className="mt-2 text-sm text-muted">按步骤填写核心信息、居住质量、规则、设施和图片。提交后进入 pending_review，等待平台审核。</p>
      </div>
      {!profile ? (
        <div className="card p-6 text-center">
          <h2 className="text-xl font-bold text-ink">需要登录</h2>
          <p className="mt-2 text-sm text-muted">发布房源需要房东、中介或管理员账号。</p>
          <Link href="/auth/login?next=/landlord/listings/new&reason=listing" className="btn-primary mt-4">登录后发布</Link>
        </div>
      ) : !["landlord", "agent", "admin"].includes(profile.role) ? (
        <div className="card p-6 text-center">
          <h2 className="text-xl font-bold text-ink">当前账号不能发布房源</h2>
          <p className="mt-2 text-sm text-muted">当前账号角色为 {profile.role}，请使用房东、中介或管理员账号。</p>
          <Link href="/rent" className="btn-secondary mt-4">返回找房</Link>
        </div>
      ) : (
        <>
          {missing ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              请先填写必填项：{missingLabels[missing] ?? missing}
            </div>
          ) : null}
          {params.error === "create_failed" ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              创建房源失败，请检查表单内容后再提交。
            </div>
          ) : null}
          {params.error === "listing_role" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">当前账号角色不能发布房源。</div>
          ) : null}
          <LandlordListingForm role={profile.role} />
        </>
      )}
    </div>
  );
}
