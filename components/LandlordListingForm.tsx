"use client";

import { useState } from "react";
import { createListing } from "@/actions/listings";
import { getSingaporeDateInputValue } from "@/lib/dateTime";
import { facilities, facilityLabels } from "@/lib/types";

const steps = ["核心信息", "居住质量", "规则限制", "设施", "图片"];

export function LandlordListingForm() {
  const [step, setStep] = useState(0);
  const [imageRows, setImageRows] = useState([0]);

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
          <Select name="room_type" label="房型" options={[["common_room", "普通房"], ["master_room", "主人房"], ["studio", "Studio"], ["whole_unit", "整套"]]} />
          <Select name="property_type" label="物业类型" options={[["hdb", "HDB"], ["condo", "Condo"], ["landed", "Landed"], ["apartment", "Apartment"]]} />
          <Field name="rent_amount" label="租金 SGD/月" type="number" />
          <Field name="deposit_amount" label="押金 SGD" type="number" />
          <Field name="postal_code" label="邮编" placeholder="520123" />
          <Field name="available_from" label="可入住日期" type="date" defaultValue={getSingaporeDateInputValue()} />
          <Field name="min_lease_months" label="最短租期（月）" type="number" defaultValue="6" />
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
      </section>

      <section className={step === 2 ? "space-y-4" : "hidden"}>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["cooking_allowed", "可煮"],
              ["registration_allowed", "可报地址"],
              ["visitors_allowed", "允许访客"],
              ["smoking_allowed", "允许吸烟"],
              ["pets_allowed", "允许宠物"]
            ].map(([name, label]) => (
              <label key={name} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                <input className="w-auto" type="checkbox" name={name} /> {label}
              </label>
            ))}
          </div>
          <Select name="gender_preference" label="性别偏好" options={[["any", "不限"], ["male", "男"], ["female", "女"]]} />
          <div>
            <label htmlFor="house_rules">房屋规则</label>
            <textarea id="house_rules" name="house_rules" rows={4} placeholder="例如：晚上 10 点后保持安静，只能简单煮。" />
          </div>
          <div>
            <label htmlFor="description">房源描述</label>
            <textarea id="description" name="description" rows={4} placeholder="补充交通、生活便利、合租氛围等。" />
          </div>
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

function Select({ label, name, options }: { label: string; name: string; options: [string, string][] }) {
  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name}>
        {options.map(([value, labelText]) => (
          <option key={value} value={value}>{labelText}</option>
        ))}
      </select>
    </div>
  );
}
