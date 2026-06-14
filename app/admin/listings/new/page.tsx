import Link from "next/link";
import { redirect } from "next/navigation";
import { LandlordListingForm } from "@/components/LandlordListingForm";
import { getCurrentProfile } from "@/lib/auth";

export default async function AdminNewListingPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login?next=/admin/listings/new");
  if (profile.role !== "admin") redirect("/");

  const params = await searchParams;
  const missing = typeof params.missing === "string" ? params.missing : "";
  const missingLabels: Record<string, string> = {
    title: "标题",
    postal_code: "邮编",
    rent_amount: "租金",
    available_from: "可入住日期",
    room_type: "房间类型"
  };
  const errorMessages: Record<string, string> = {
    create_failed: "创建房源失败，请检查表单内容后再提交。",
    image_count: "最多只能上传 6 张图片。",
    image_type: "图片仅支持 JPG、PNG 和 WebP 格式。",
    image_size: "每张图片不能超过 5MB。",
    image_upload: "图片上传失败，请稍后重试。"
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">后台发布房源</h1>
          <p className="mt-2 text-sm text-muted">管理员可设置房源来源与认证状态。</p>
        </div>
        <Link href="/admin/listings" className="btn-secondary">返回房源管理</Link>
      </div>

      {missing ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          请先填写必填项：{missingLabels[missing] ?? missing}
        </div>
      ) : null}
      {typeof params.error === "string" && errorMessages[params.error] ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessages[params.error]}
        </div>
      ) : null}

      <LandlordListingForm role={profile.role} adminMode />
    </div>
  );
}
