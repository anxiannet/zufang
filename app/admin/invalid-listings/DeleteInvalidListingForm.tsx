"use client";

import { useFormStatus } from "react-dom";

type DeleteInvalidListingFormProps = {
  cleanListingId: string;
  title: string;
};

export function DeleteInvalidListingForm({ cleanListingId, title }: DeleteInvalidListingFormProps) {
  return (
    <form
      action="/admin/invalid-listings/delete"
      method="post"
      onSubmit={(event) => {
        const confirmed = window.confirm(`确定删除「${title}」的全部信息吗？这会同时删除采集、清洗和索引数据。`);
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="clean_listing_id" value={cleanListingId} />
      <DeleteButton />
    </form>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="btn-secondary px-3 py-1.5 text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={pending}
    >
      {pending ? "删除中..." : "删除全部"}
    </button>
  );
}
