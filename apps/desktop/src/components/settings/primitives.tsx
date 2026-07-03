import { type ReactElement, type ReactNode } from "react";

interface PaneHeaderProps {
  title: string;
  subtitle: string;
}

export function PaneHeader({ title, subtitle }: PaneHeaderProps): ReactElement {
  return (
    <header className="mb-4">
      <h2 className="text-ink mb-0.5 text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="text-ink-3 text-[12.5px] leading-[1.5]">{subtitle}</p>
    </header>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

export function SettingsRow({ label, description, children }: SettingsRowProps): ReactElement {
  return (
    <div className="border-line flex items-center justify-between gap-6 border-b py-[15px] last:border-b-0">
      <div className="min-w-0">
        <div className="text-ink text-[13.5px] font-medium">{label}</div>
        {description !== undefined ? (
          <div className="text-ink-3 mt-0.5 max-w-[330px] text-[12px] leading-[1.45]">
            {description}
          </div>
        ) : null}
      </div>
      <div className="flex flex-none items-center gap-2">{children}</div>
    </div>
  );
}
