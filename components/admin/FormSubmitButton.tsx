"use client";

import { useFormStatus } from "react-dom";

type FormSubmitButtonProps = {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
};

export function FormSubmitButton({ children, pendingText = "处理中...", className = "btn-primary" }: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
      type="submit"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? pendingText : children}
    </button>
  );
}
