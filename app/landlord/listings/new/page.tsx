import { LandlordListingForm } from "@/components/LandlordListingForm";
import { getCurrentProfile } from "@/lib/auth";
import Link from "next/link";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

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
  const errorMessages: Record<string, string> = {
    create_failed: "创建房源失败，请检查表单内容后再提交。",
    image_count: "最多只能上传 6 张图片。",
    image_type: "图片仅支持 JPG、PNG 和 WebP 格式。",
    image_size: "每张图片不能超过 5MB。",
    image_upload: "图片上传失败，请稍后重试。"
  };

  return (
    <div className="container-page max-w-5xl space-y-5 py-8 sm:py-10">
      <PageHeader
        eyebrow="Landlord Submission"
        title="发布房源"
        description="先填写核心信息，平台会帮你整理成更适合租客阅读的结构化房源页。"
        actions={<div className="flex items-center gap-2 text-xs font-semibold text-muted"><ShieldCheck className="h-4 w-4 text-brand" /> 联系方式默认受保护</div>}
      />
      {!profile ? (
        <div className="card p-8 text-center">
          <FileCheck2 className="mx-auto h-8 w-8 text-brand" />
          <h2 className="mt-4 text-xl font-bold text-ink">登录后发布房源</h2>
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              请先填写必填项：{missingLabels[missing] ?? missing}
            </div>
          ) : null}
          {typeof params.error === "string" && errorMessages[params.error] ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMessages[params.error]}
            </div>
          ) : null}
          {params.error === "listing_role" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">当前账号角色不能发布房源。</div>
          ) : null}
          <LandlordListingForm role={profile.role} />
        </>
      )}
    </div>
  );
}
