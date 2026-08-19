import Link from "next/link";

import { MerkadoLogoFooter } from "@/components/merkado/merkado-logo-footer";

const footerLinkClassName =
  "inline cursor-default whitespace-normal text-[14px] font-normal text-grey-600";
const footerLegalClassName =
  "inline-flex cursor-default items-center rounded-[4px] text-[14px] leading-5 font-normal text-grey-700";

function FooterColumn({
  title,
  links,
  className,
}: {
  title: string;
  links: string[];
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-2${className ? ` ${className}` : ""}`}>
      <h3 className="text-[14px] leading-5 font-semibold text-surface">{title}</h3>
      <ul className="flex flex-col gap-2">
        {links.map((label) => (
          <li key={label} className="leading-tight">
            <span aria-disabled="true" className={footerLinkClassName}>
              {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AccountFooter() {
  return (
    <footer
      className="bg-surface-dark mt-2 px-4 text-white md:mt-[48px]"
      role="contentinfo"
      aria-label="Site footer"
    >
      <div className="mx-auto max-w-[998px] py-8 md:py-[72px]">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[auto_1fr] md:items-stretch md:gap-8">
          <div className="flex min-h-0 min-w-[240px] flex-col md:max-w-[240px]">
            <Link
              href="/"
              className="shrink-0 rounded transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-dark focus-visible:outline-none"
              aria-label="Merkado home"
            >
              <MerkadoLogoFooter />
            </Link>
            <div className="min-h-0 flex-1" aria-hidden />
            <div className="mt-auto flex shrink-0 items-center gap-[10px] pt-6 md:pt-0" aria-label="Social links">
              <span aria-disabled="true" className="inline-flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded text-grey-600 [&_svg]:h-6 [&_svg]:w-6" title="Facebook">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M10 1.25C5.1675 1.25 1.25 5.1675 1.25 10C1.25 14.1038 4.075 17.5469 7.88625 18.4925V12.6737H6.08187V10H7.88625V8.84812C7.88625 5.87 9.23375 4.48938 12.1581 4.48938C12.7125 4.48938 13.6687 4.59812 14.06 4.70688V7.13063C13.8538 7.10875 13.495 7.09813 13.0494 7.09813C11.6144 7.09813 11.06 7.64188 11.06 9.05438V10H13.9181L13.4269 12.6737H11.06V18.6856C15.3925 18.1625 18.75 14.4731 18.75 10C18.75 5.1675 14.8325 1.25 10 1.25Z" fill="#BBBBBB" />
                </svg>
              </span>
              <span aria-disabled="true" className="inline-flex h-6 w-6 shrink-0 cursor-default items-center justify-center rounded text-grey-600 [&_svg]:h-6 [&_svg]:w-6" title="Instagram">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path d="M6.37602 1.31119C5.44477 1.35494 4.80914 1.50369 4.25352 1.72182C3.67852 1.94619 3.19102 2.24682 2.70539 2.73369C2.22039 3.22057 1.92164 3.70869 1.69914 4.28431C1.48352 4.84119 1.33789 5.47744 1.29664 6.40932C1.25539 7.34057 1.24664 7.64056 1.25102 10.0162C1.25539 12.3918 1.26602 12.6899 1.31102 13.6237C1.35539 14.5543 1.50352 15.1899 1.72164 15.7462C1.94602 16.3212 2.24664 16.8087 2.73352 17.2943C3.22039 17.7793 3.70789 18.0774 4.28539 18.3006C4.84164 18.5156 5.47852 18.6624 6.40977 18.7031C7.34102 18.7437 7.64102 18.7531 10.0166 18.7487C12.3923 18.7443 12.691 18.7337 13.6248 18.6893C14.5585 18.6449 15.1904 18.4962 15.7466 18.2787C16.3216 18.0537 16.8098 17.7537 17.2948 17.2662C17.7798 16.7787 18.0785 16.2906 18.3004 15.7143C18.516 15.1581 18.6623 14.5212 18.7029 13.5906C18.7435 12.6568 18.7535 12.3587 18.7485 9.98244C18.7435 7.60619 18.7335 7.30869 18.6891 6.37557C18.6448 5.44244 18.4966 4.80869 18.2785 4.25244C18.0535 3.67744 17.7535 3.18994 17.2666 2.70432C16.7798 2.21869 16.291 1.92056 15.7148 1.69869C15.1579 1.48306 14.5216 1.33619 13.5904 1.29619C12.6591 1.25619 12.3591 1.24556 9.98289 1.24994C7.60664 1.25431 7.30914 1.26494 6.37602 1.30994M6.47852 17.1281C5.62539 17.0912 5.16227 16.9493 4.85352 16.8306C4.44477 16.6731 4.15352 16.4824 3.84602 16.1781C3.53852 15.8737 3.34914 15.5812 3.18977 15.1731C3.06977 14.8643 2.92539 14.4018 2.88539 13.5487C2.84227 12.6268 2.83289 12.3499 2.82789 10.0137C2.82289 7.67744 2.83164 7.40119 2.87227 6.47869C2.90852 5.62619 3.05102 5.16244 3.16977 4.85369C3.32727 4.44431 3.51727 4.15369 3.82227 3.84619C4.12727 3.53869 4.41914 3.34932 4.82727 3.18994C5.13539 3.06932 5.59852 2.92619 6.45102 2.88557C7.37352 2.84182 7.65039 2.83307 9.98602 2.82807C12.3216 2.82307 12.5991 2.83182 13.5223 2.87244C14.3748 2.90932 14.8385 3.05057 15.1466 3.16994C15.5554 3.32744 15.8466 3.51681 16.1541 3.82244C16.4616 4.12806 16.651 4.41869 16.811 4.82806C16.9316 5.13556 17.0748 5.59806 17.1148 6.45119C17.1585 7.37369 17.1685 7.65057 17.1729 9.98619C17.1773 12.3218 17.1691 12.5993 17.1285 13.5212C17.091 14.3743 16.9498 14.8374 16.831 15.1468C16.6735 15.5556 16.4835 15.8468 16.1779 16.1543C15.8723 16.4618 15.581 16.6512 15.1729 16.8106C14.8648 16.9306 14.4016 17.0743 13.5498 17.1149C12.6273 17.1581 12.3504 17.1674 10.0141 17.1724C7.67789 17.1774 7.40102 17.1681 6.47852 17.1281ZM13.6116 5.32306C13.6129 5.90306 14.0835 6.37244 14.6635 6.37119C15.2435 6.36994 15.7129 5.89931 15.7116 5.31931C15.7104 4.73931 15.2398 4.26994 14.6598 4.27119C14.0798 4.27244 13.611 4.74306 13.6116 5.32306ZM5.50727 10.0081C5.51227 12.4893 7.52727 14.4968 10.0085 14.4918C12.4898 14.4868 14.4979 12.4718 14.4935 9.99057C14.4885 7.50932 12.4729 5.50119 9.99164 5.50619C7.51039 5.51119 5.50227 7.52682 5.50727 10.0081ZM7.08414 10.0049C7.08102 8.39431 8.38414 7.08557 9.99539 7.08244C11.606 7.07932 12.9148 8.38244 12.9179 9.99369C12.921 11.6043 11.6179 12.9131 10.0066 12.9162C8.39602 12.9193 7.08727 11.6168 7.08414 10.0062" fill="#BBBBBB" />
                </svg>
              </span>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-6 md:grid-cols-4">
            <FooterColumn
              className="order-3 md:order-1"
              title="List"
              links={["List a car", "List a property"]}
            />
            <FooterColumn
              className="order-1 md:order-2"
              title="Cars"
              links={["Browse cars", "SUVs & Crossovers", "Pickups & Trucks", "Sedans", "Hatchbacks"]}
            />
            <FooterColumn
              className="order-2 md:order-3"
              title="Real Estate"
              links={["Browse real estate", "Apartments", "Houses", "Villas", "Land", "Commercial"]}
            />
            <FooterColumn
              className="order-4 md:order-4"
              title="Company"
              links={["Partner with Merkado", "Businesses", "Resources", "Contact us"]}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[998px] border-t border-grey-900">
        <div className="flex flex-col gap-1.5 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="order-1">
            <p className="h-5 text-[14px] leading-5 font-normal text-grey-700">
              © 2026 Merkado.cw · Built for Curaçao
            </p>
          </div>
          <div className="order-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1 sm:gap-y-1.5">
            <span aria-disabled="true" className={footerLegalClassName}>
              Terms and Conditions
            </span>
            <span className="hidden h-5 text-[14px] leading-5 font-normal text-grey-700 sm:inline" aria-hidden>
              ·
            </span>
            <span aria-disabled="true" className={footerLegalClassName}>
              Privacy Policy
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
