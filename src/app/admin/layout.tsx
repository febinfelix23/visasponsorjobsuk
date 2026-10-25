import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Posting helper",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
