import type { ReactNode } from "react";

export function SettingsDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="space-y-3">
      <summary className="cursor-pointer py-3 text-sm font-medium">{title}</summary>
      <div className="space-y-4">{children}</div>
    </details>
  );
}
