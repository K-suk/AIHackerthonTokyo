"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 全画面へのナビゲーション。
const links = [
  { href: "/", label: "注文" },
  { href: "/orders", label: "本日の注文" },
  { href: "/report", label: "日報" },
  { href: "/inventory", label: "在庫" },
  { href: "/admin/menu", label: "メニュー" },
] as const;

export default function AppHeader() {
  const pathname = usePathname();
  return <nav className="app-nav" aria-label="主要メニュー">
    {links.map(({ href, label }) => {
      const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
      return <Link key={href} href={href} aria-current={active ? "page" : undefined}>{label}</Link>;
    })}
  </nav>;
}
