import type * as React from "react";

import { cn } from "@/lib/utils";

function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-950 shadow-xs outline-none transition-colors focus-visible:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { NativeSelect };
