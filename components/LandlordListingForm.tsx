"use client";

import { useState } from "react";
import { createListing } from "@/actions/listings";
import { getSingaporeDateInputValue } from "@/lib/dateTime";
import { facilities, facilityLabels, type UserRole } from "@/lib/types";

const steps = ["核心信息", "居住质量", "规则限制", "设施", "图片"];

export function LandlordListingForm({ role }: { role: UserRole }) {
  const [step, setStep] = useState(0);
  const [imageRows, setImageRows] = useState([0]);
  const [description, setDescription] = useState("");
  const [descriptionClean, setDescriptionClean] = useState("");
  const [cleanEdited, setCleanEdited] = useState(false);
  const isAdmin = role === "admin";

  return (
    <form action={createListing} className="card space-y-6 p-4 md:p-6">
      <div className="flex gap-2 overflow-x-auto">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${step === index ? "bg-brand text-white" : "bg-gray-100 text-muted"}`}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      <section className={step === 0 ? "grid gap-4 md:grid-cols-2" : "hidden"}>
          <Field name="title" label="标题" placeholder="近 Tampines MRT 普通房，可报地址" />
          <Select name="listing_type" label="房源类型" options={[["room", "单间"], ["whole_unit", "整套"], ["bedspace", "床位"]]} />
          <Select name="room_type" label="房间类型（整套不适用；床位请选择所在房间）" emptyLabel="整套不适用 / 请选择" options={[["master_room", "主人房"], ["common_room", "普通房"], ["partition_room", "隔间"], ["maid_room", "佣人房"], ["studio", "Studio公寓"]]} />
          <Field name="rent_amount" label="租金 SGD/月" type="number" />
          <Field name="deposit_amount" label="押金 SGD" type="number" />
          <Field name="postal_code" label="邮编" placeholder="520123" />
          <Field name="available_from" label="可入住日期" type="date" defaultValue={getSingaporeDateInputValue()} />
          <Field name="min_lease_months" label="最短租期（月）" type="number" defaultValue="6" />
          <Field name="available_note" label="入住时间备注" placeholder="例如：日期可协商" />
          <Select name="contact_visibility" label="联系方式可见范围" defaultValue="private" options={[["private", "不公开"], ["login_only", "登录后可见"], ["public", "公开"], ["group_only", "指定群体可见"]]} />
          <Field name="wechat" label="微信" />
          <Field name="phone" label="电话" />
          {isAdmin ? <Select name="source" label="来源" defaultValue="owner_submit" options={[["owner_submit", "屋主提交"], ["wechat_group", "微信群"], ["zufang", "狮城论坛"], ["xiaohongshu", "小红书"], ["manual", "管理员录入"]]} /> : <input type="hidden" name="source" value="owner_submit" />}
          {isAdmin ? <Select name="verification_status" label="认证状态" defaultValue="unverified" options={[["unverified", "未认证"], ["owner_verified", "屋主已认证"], ["agent_verified", "中介已认证"], ["suspicious", "可疑"], ["rejected", "拒绝"]]} /> : <input type="hidden" name="verification_status" value="unverified" />}
      </section>

      <section className={step === 1 ? "grid gap-4 md:grid-cols-2" : "hidden"}>
          <Field name="total_bedrooms" label="整套共有几个房间" type="number" />
          <Field name="total_bathrooms" label="整套共有几个浴室" type="number" />
          <Field name="current_occupants_count" label="当前已住几人" type="number" />
          <Field name="bathroom_shared_with_count" label="租客需要和几个人共用浴室" type="number" />
          <Field name="max_occupants" label="最多入住人数" type="number" defaultValue="1" />
          <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
            <input className="w-auto" type="checkbox" name="landlord_staying" /> 房东同住
          </label>
          <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
            <input className="w-auto" type="checkbox" name="is_owner_direct" defaultChecked={role === "landlord"} /> 屋主直租
          </label>
          <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
            <input className="w-auto" type="checkbox" name="is_agent" defaultChecked={role === "agent"} /> 中介房源
          </label>
          <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
            <input className="w-auto" type="checkbox" name="is_sublet" /> 转租
          </label>
      </section>

      <section className={step === 2 ? "space-y-4" : "hidden"}>
          <div className="grid gap-3 md:grid-cols-2">
            <Select name="utilities_policy" label="水电政策" emptyLabel="未说明" options={[["included", "包含"], ["shared", "均摊"], ["excluded", "不包含"], ["capped", "限额包含"]]} />
            <Select name="aircon_policy" label="空调政策" emptyLabel="未说明" options={[["included", "包含"], ["extra_charge", "额外收费"], ["limited_hours", "限时使用"], ["not_available", "无空调"]]} />
            <Select name="cooking_policy" label="煮饭政策" emptyLabel="未说明" options={[["full", "可大煮"], ["light", "可小煮"], ["no", "不可煮"]]} />
            <Select name="visitors_policy" label="访客政策" emptyLabel="未说明" options={[["allowed", "允许"], ["limited", "有限制"], ["not_allowed", "不允许"]]} />
            <Select name="smoking_policy" label="吸烟政策" emptyLabel="未说明" options={[["allowed", "允许"], ["not_allowed", "不允许"]]} />
            <Select name="pets_policy" label="宠物政策" emptyLabel="未说明" options={[["allowed", "允许"], ["not_allowed", "不允许"]]} />
            <label className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <input className="w-auto" type="checkbox" name="registration_allowed" /> 可报地址
            </label>
          </div>
          <Select name="gender_preference" label="性别偏好" options={[["any", "不限"], ["male", "男"], ["female", "女"]]} />
          <div>
            <div className="mb-2 text-sm font-medium">租客类型偏好（可多选）</div>
            <div className="flex flex-wrap gap-2">
              {[["student", "学生"], ["professional", "上班族"], ["couple", "情侣"], ["family", "家庭"], ["single", "单人"]].map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                  <input className="w-auto" type="checkbox" name="tenant_type_preference" value={value} /> {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="description">房源描述</label>
            <textarea
              id="description"
              name="description"
              rows={4}
              value={description}
              onChange={(event) => {
                const value = event.target.value;
                setDescription(value);
                if (!cleanEdited) setDescriptionClean(value.replace(/\s+/g, " ").trimStart());
              }}
              placeholder="补充交通、生活便利、合租氛围等。"
            />
          </div>
          <div>
            <label htmlFor="description_clean">清理后的公开描述</label>
            <textarea id="description_clean" name="description_clean" rows={4} value={descriptionClean} onChange={(event) => { setCleanEdited(true); setDescriptionClean(event.target.value); }} />
          </div>
          {isAdmin ? <div><label htmlFor="internal_note">内部备注（仅管理员）</label><textarea id="internal_note" name="internal_note" rows={3} /></div> : null}
      </section>

      <section className={step === 3 ? "space-y-3" : "hidden"}>
          {facilities.map((facility) => (
            <div key={facility} className="grid gap-2 rounded-md border border-line p-3 md:grid-cols-[160px_180px_1fr]">
              <div className="font-medium">{facilityLabels[facility]}</div>
              <select name={`facility_${facility}`} defaultValue="not_available">
                <option value="available">可使用</option>
                <option value="not_available">不可使用</option>
                <option value="restricted">限制使用</option>
              </select>
              <input name={`facility_note_${facility}`} placeholder="备注，例如：只能简单煮" />
            </div>
          ))}
      </section>

      <section className={step === 4 ? "space-y-3" : "hidden"}>
          <p className="text-sm text-muted">MVP 支持先填写已上传图片 URL；提交后也可通过 uploadListingImage action 接入 Supabase Storage 上传。</p>
          {imageRows.map((row, index) => (
            <div key={row} className="grid gap-2 rounded-md border border-line p-3 md:grid-cols-[1fr_100px_1fr]">
              <input name="image_url" placeholder="Supabase Storage public URL" />
              <input name={`image_sort_${index}`} type="number" defaultValue={index} />
              <input name={`image_caption_${index}`} placeholder="图片说明" />
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={() => setImageRows((rows) => [...rows, rows.length])}>
            添加图片
          </button>
      </section>

      <div className="flex justify-between border-t border-line pt-4">
        <button type="button" className="btn-secondary" onClick={() => setStep((value) => Math.max(0, value - 1))}>上一步</button>
        {step < steps.length - 1 ? (
          <button type="button" className="btn-primary" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>下一步</button>
        ) : (
          <button type="submit" className="btn-primary">提交审核</button>
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
