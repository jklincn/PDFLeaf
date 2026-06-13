import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-950 shadow-xs outline-none transition-colors placeholder:text-zinc-500 read-only:bg-zinc-50 focus-visible:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
