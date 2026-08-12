"use client";

export function Drawer({
  title,
  children,
  open = false
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <aside aria-label={title} className="drawer-panel">
      <h2>{title}</h2>
      {children}
    </aside>
  );
}
