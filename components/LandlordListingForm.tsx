"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createListing, type CreateListingState } from "@/actions/listings";
import { getSingaporeDateInputValue } from "@/lib/dateTime";
import { facilities, facilityLabels, type UserRole } from "@/lib/types";

const steps = ["核心信息", "租客关心", "照片说明"];
const checkboxCardClass = "flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-3 text-sm transition hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-brand/5";
const initialState: CreateListingState = {
  status: "idle",
  error: null,
  step: null,
  listing_id: null
};
const errorMessages: Record<string, string> = {
  session_expired: "登录状态已失效。你填写的内容仍保留在当前页面，请重新登录后再提交。",
  listing_role: "当前账号角色不能发布房源。",
  missing_title: "请填写标题。",
  missing_postal_code: "请填写邮编。",
  missing_rent_amount: "请填写租金。",
  missing_available_from: "请填写可入住日期。",
  missing_room_type: "房间或床位房源需要选择房间类型。",
  listing_permission: "平台暂时无法写入房源数据，请稍后重试；这不是你填写内容的问题。",
  create_failed: "创建房源失败，请检查表单内容后再提交。你填写的内容已保留。",
  image_count: "最多只能上传 6 张图片。",
  image_type: "图片仅支持 JPG、PNG 和 WebP 格式。",
  image_size: "每张图片不能超过 5MB。",
  image_upload: "图片上传失败，请稍后重试。你填写的内容已保留。"
};

export function LandlordListingForm({
  role,
  adminMode = false
}: {
  role: UserRole;
  adminMode?: boolean;
}) {
  const router = useRouter();
  const [submitState, submitAction, isPending] = useActionState(createListing, initialState);
  const [step, setStep] = useState(0);
  const [imageRows, setImageRows] = useState([0]);
  const [description, setDescription] = useState("");
  const [descriptionClean, setDescriptionClean] = useState("");
  const [cleanEdited, setCleanEdited] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [hideSubmitError, setHideSubmitError] = useState(false);
  const isAdmin = role === "admin";
  const canSetModerationFields = isAdmin && adminMode;

  function validateStepOne(form: HTMLFormElement) {
    const formData = new FormData(form);
    const requiredFields: [string, string][] = [
      ["title", "请填写房源标题。"],
      ["postal_code", "请填写房源邮编。"],
      ["available_from", "请选择可入住日期。"]
    ];

    for (const [name, message] of requiredFields) {
      if (!String(formData.get(name) ?? "").trim()) {
        setStepError(message);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return false;
      }
    }

    if (Number(formData.get("rent_amount")) <= 0) {
      setStepError("请填写有效的每月租金。");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }

    if (formData.get("listing_type") !== "whole_unit" && !String(formData.get("room_type") ?? "").trim()) {
      setStepError("请选择房间类型；只有整套房源可以不选。");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }

    setStepError(null);
    return true;
  }

  function goToStep(nextStep: number, form: HTMLFormElement) {
    setHideSubmitError(true);
    if (step === 0 && nextStep > 0 && !validateStepOne(form)) return;
    setStepError(null);
    setStep(nextStep);
  }

  useEffect(() => {
    if (submitState.status === "error" && submitState.step !== null) {
      setStep(submitState.step);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (submitState.status === "success" && submitState.listing_id) {
      router.push(`/landlord/listings/${submitState.listing_id}/submitted`);
    }
  }, [router, submitState]);

  return (
    <form
      className="card space-y-6 p-5 sm:p-7"
      onSubmit={(event) => {
        event.preventDefault();
        if (step !== steps.length - 1) return;
        setHideSubmitError(false);
        const formData = new FormData(event.currentTarget);
        startTransition(() => submitAction(formData));
      }}
    >
      {canSetModerationFields ? <input type="hidden" name="admin_mode" value="true" /> : null}
      {stepError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {stepError}
        </div>
      ) : null}
      {!hideSubmitError && submitState.status === "error" && submitState.error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessages[submitState.error] ?? "提交失败，请稍后重试。你填写的内容已保留。"}
        </div>
      ) : null}
      <div className="flex gap-2 overflow-x-auto">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              goToStep(index, event.currentTarget.form!);
            }}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${step === index ? "bg-brand text-white" : "bg-gray-100 text-muted"}`}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      <section className={step === 0 ? "grid gap-4 md:grid-cols-2" : "hidden"}>
        <Field name="title" label="标题" placeholder="近 Tampines MRT 普通房，可报地址" />
        <Select name="listing_type" label="房源类型" options={[["room", "房间"], ["whole_unit", "整套"], ["bedspace", "床位"]]} />
        <Select name="room_type" label="房间类型（整套不适用；床位请选择所在房间）" emptyLabel="整套不适用 / 请选择" options={[["master_room", "主人房"], ["common_room", "普通房"], ["partition_room", "隔间"], ["maid_room", "佣人房"], ["studio", "Studio公寓"]]} />
        <Field name="rent_amount" label="租金 SGD/月" type="number" />
        <Field name="deposit_amount" label="押金 SGD" type="number" />
        <Field name="postal_code" label="邮编" placeholder="520123" />
        <Field name="available_from" label="可入住日期" type="date" defaultValue={getSingaporeDateInputValue()} />
        <Field name="min_lease_months" label="最短租期（月）" type="number" defaultValue="6" />
        <Field name="max_occupants" label="最多入住人数" type="number" defaultValue="1" />
        <Select name="contact_visibility" label="联系方式可见范围" defaultValue="private" options={[["private", "不公开"], ["login_only", "登录后可见"], ["public", "公开"], ["group_only", "指定群体可见"]]} />
        <Field name="wechat" label="微信" />
        <Field name="phone" label="电话" />
        {canSetModerationFields ? <Select name="source" label="来源" defaultValue="owner_submit" options={[["owner_submit", "屋主提交"], ["wechat_group", "微信群"], ["zufang", "狮城论坛"], ["xiaohongshu", "小红书"], ["manual", "管理员录入"]]} /> : <input type="hidden" name="source" value="owner_submit" />}
        {canSetModerationFields ? <Select name="verification_status" label="认证状态" defaultValue="unverified" options={[["unverified", "未认证"], ["owner_verified", "屋主已认证"], ["agent_verified", "中介已认证"], ["suspicious", "可疑"], ["rejected", "拒绝"]]} /> : <input type="hidden" name="verification_status" value="unverified" />}
        <p className="text-sm text-muted md:col-span-2">不知道怎么写没关系，平台会帮你整理。</p>
      </section>

      <section className={step === 1 ? "space-y-5" : "hidden"}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="total_bedrooms" label="整套共有几个房间" type="number" />
          <Field name="total_bathrooms" label="整套共有几个浴室" type="number" />
          <Field name="current_occupants_count" label="当前已住几人" type="number" />
          <Field name="bathroom_shared_with_count" label="租客需要和几个人共用浴室" type="number" />
        </div>
        <div>
          <div className="mb-2 text-sm font-medium text-ink">房源身份与居住情况</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className={checkboxCardClass}>
              <input className="w-auto" type="checkbox" name="landlord_staying" /> 房东同住
            </label>
            <label className={checkboxCardClass}>
              <input className="w-auto" type="checkbox" name="is_owner_direct" defaultChecked={role === "landlord"} /> 屋主直租
            </label>
            <label className={checkboxCardClass}>
              <input className="w-auto" type="checkbox" name="is_agent" defaultChecked={role === "agent"} /> 中介房源
            </label>
            <label className={checkboxCardClass}>
              <input className="w-auto" type="checkbox" name="is_sublet" /> 转租
            </label>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Select name="utilities_policy" label="水电政策" emptyLabel="未说明" options={[["included", "包含"], ["shared", "均摊"], ["excluded", "不包含"], ["capped", "限额包含"]]} />
          <Select name="aircon_policy" label="空调政策" emptyLabel="未说明" options={[["included", "包含"], ["extra_charge", "额外收费"], ["limited_hours", "限时使用"], ["not_available", "无空调"]]} />
          <Select name="cooking_policy" label="煮饭政策" emptyLabel="未说明" options={[["full", "可大煮"], ["light", "可小煮"], ["no", "不可煮"]]} />
          <Select name="visitors_policy" label="访客政策" emptyLabel="未说明" options={[["allowed", "允许"], ["limited", "有限制"], ["not_allowed", "不允许"]]} />
          <Select name="smoking_policy" label="吸烟政策" emptyLabel="未说明" options={[["allowed", "允许"], ["not_allowed", "不允许"]]} />
          <Select name="pets_policy" label="宠物政策" emptyLabel="未说明" options={[["allowed", "允许"], ["not_allowed", "不允许"]]} />
          <label className={checkboxCardClass}>
            <input className="w-auto" type="checkbox" name="registration_allowed" /> 可报地址
          </label>
        </div>
        <Select name="gender_preference" label="性别偏好" options={[["any", "不限"], ["male", "男"], ["female", "女"]]} />
        <div>
          <div className="mb-2 text-sm font-medium">租客类型偏好（可多选）</div>
          <div className="flex flex-wrap gap-2">
            {[["student", "学生"], ["professional", "上班族"], ["couple", "情侣"], ["family", "家庭"], ["single", "单人"]].map(([value, label]) => (
              <label key={value} className={`${checkboxCardClass} rounded-full py-2`}>
                <input className="w-auto" type="checkbox" name="tenant_type_preference" value={value} /> {label}
              </label>
            ))}
          </div>
        </div>
        <details className="rounded-2xl border border-line bg-slate-50 p-4">
          <summary className="cursor-pointer font-semibold text-ink">补充设施，可选</summary>
          <div className="mt-4 space-y-3">
            {facilities.map((facility) => (
              <div key={facility} className="grid gap-2 rounded-xl border border-line bg-white p-3 md:grid-cols-[160px_180px_1fr]">
                <div className="font-medium">{facilityLabels[facility]}</div>
                <select name={`facility_${facility}`} defaultValue="not_available">
                  <option value="available">可使用</option>
                  <option value="not_available">不可使用</option>
                  <option value="restricted">限制使用</option>
                </select>
                <input name={`facility_note_${facility}`} placeholder="备注，例如：只能简单煮" />
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className={step === 2 ? "space-y-5" : "hidden"}>
          <div>
            <label htmlFor="description">房源说明</label>
            <textarea
              id="description"
              name="description"
              rows={5}
              value={description}
              onChange={(event) => {
                const value = event.target.value;
                setDescription(value);
                if (!cleanEdited) setDescriptionClean(value.replace(/\s+/g, " ").trimStart());
              }}
              placeholder="补充交通、生活便利、合租氛围等。"
            />
          </div>
          {canSetModerationFields ? (
            <div>
              <label htmlFor="description_clean">清理后的公开描述</label>
              <textarea id="description_clean" name="description_clean" rows={4} value={descriptionClean} onChange={(event) => { setCleanEdited(true); setDescriptionClean(event.target.value); }} />
            </div>
          ) : (
            <input type="hidden" name="description_clean" value={descriptionClean} />
          )}
          <p className="text-sm text-muted">最多上传 6 张图片，每张不超过 5MB，支持 JPG、PNG 和 WebP。</p>
          {imageRows.map((row, index) => (
            <div key={row} className="grid gap-2 rounded-xl border border-line bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]">
              <input
                name="image_file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={`房源图片 ${index + 1}`}
              />
              <input name={`image_caption_${index}`} placeholder="图片说明，例如：主人房" />
              {imageRows.length > 1 ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setImageRows((rows) => rows.filter((item) => item !== row))}
                >
                  移除
                </button>
              ) : null}
            </div>
          ))}
          {imageRows.length < 6 ? (
            <button type="button" className="btn-secondary" onClick={() => setImageRows((rows) => [...rows, Math.max(...rows) + 1])}>
              添加图片
            </button>
          ) : null}
          {canSetModerationFields ? <div><label htmlFor="internal_note">内部备注（仅管理员）</label><textarea id="internal_note" name="internal_note" rows={3} /></div> : null}
          <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 text-sm text-ink">
            联系方式默认不公开。提交后平台会先检查真实性和展示效果，再发布给租客查看。
          </div>
      </section>

      <div className="flex justify-between border-t border-line pt-4">
        <button
          type="button"
          className="btn-secondary"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setHideSubmitError(true);
            setStepError(null);
            setStep((value) => Math.max(0, value - 1));
          }}
        >
          上一步
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            className="btn-primary"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              goToStep(Math.min(steps.length - 1, step + 1), event.currentTarget.form!);
            }}
          >
            下一步
          </button>
        ) : (
          <button type="submit" className="btn-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending}>
            {isPending ? "提交中..." : "提交房源"}
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, name, type = "text", placeholder, defaultValue }: { label: string; name: string; type?: string; placeholder?: string; defaultValue?: string }) {
  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} aria-required={["title", "rent_amount", "postal_code", "available_from"].includes(name)} />
    </div>
  );
}

function Select({ label, name, options, defaultValue, emptyLabel }: { label: string; name: string; options: [string, string][]; defaultValue?: string; emptyLabel?: string }) {
  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue}>
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map(([value, labelText]) => (
          <option key={value} value={value}>{labelText}</option>
        ))}
      </select>
    </div>
  );
}
