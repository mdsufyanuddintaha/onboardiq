"use client";

import type { ReactNode } from "react";
// @ts-ignore useFormStatus ships with the React version bundled in Next 14's app router
import { useFormStatus } from "react-dom";

type Props = {
  children: ReactNode;
  variant?: "primary" | "default" | "danger" | "solid-danger" | "ghost";
  size?: "sm";
  confirm?: string;
  pendingText?: string;
};

// Submit button that disables itself while the server action runs, with an optional confirm prompt.
export default function SubmitButton({ children, variant = "primary", size, confirm, pendingText = "Working…" }: Props) {
  const { pending } = useFormStatus() as { pending: boolean };
  const cls = ["btn", variant === "default" ? "" : variant, size ?? ""].filter(Boolean).join(" ");
  return (
    <button
      type="submit"
      className={cls}
      disabled={pending}
      aria-busy={pending}
      onClick={
        confirm
          ? (e) => {
              if (!window.confirm(confirm)) e.preventDefault();
            }
          : undefined
      }
    >
      {pending ? pendingText : children}
    </button>
  );
}
