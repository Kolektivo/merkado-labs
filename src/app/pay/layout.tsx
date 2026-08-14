import { PayerLocaleProvider } from "./payer-locale";

export default function PayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PayerLocaleProvider>{children}</PayerLocaleProvider>;
}
