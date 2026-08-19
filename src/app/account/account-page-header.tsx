import type { ReactNode } from "react";

export function AccountPageHeader({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-[16px] border border-grey-200 bg-surface p-5 min-[769px]:p-6">
      <div className="flex flex-col gap-4 min-[769px]:flex-row min-[769px]:items-start min-[769px]:justify-between">
        <div className="flex flex-col gap-3">
          <h1 className="text-[24px] font-semibold leading-[30px] text-surface-dark">{title}</h1>
          <p className="text-[14px] font-normal leading-5 text-grey-900">{description}</p>
        </div>
        {action}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}
