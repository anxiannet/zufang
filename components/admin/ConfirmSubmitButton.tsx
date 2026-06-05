"use client";

import { useFormStatus } from "react-dom";

type ConfirmSubmitButtonProps = {
  children: React.ReactNode;
  confirmMessage: string;
  pendingText?: string;
  className?: string;
};

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  pendingText = "处理中...",
  className = "btn-secondary"
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
