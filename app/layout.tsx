import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "声レジ",
  description: "注文の会話を写真付きの伝票に。",
  icons: { icon: "/koereji-logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
