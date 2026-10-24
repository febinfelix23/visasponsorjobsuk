"use client";

import { useRef } from "react";

/**
 * Wraps a GET search form so choosing a filter applies it straight away. The form
 * still works with a plain submit when JavaScript is off.
 */
export function AutoSubmitForm({ children, ...props }: React.ComponentProps<"form">) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      {...props}
      onChange={(e) => {
        const target = e.target;
        if (target instanceof HTMLInputElement && (target.type === "radio" || target.type === "checkbox")) ref.current?.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
