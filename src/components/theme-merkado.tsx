export function ThemeMerkado({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`theme-merkado ${className ?? ""}`.trim()}>{children}</div>;
}
