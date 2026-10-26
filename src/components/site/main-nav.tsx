"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Jobs" },
  { href: "/junior-doctors", label: "Junior doctors" },
  { href: "/how-we-check", label: "How we check" },
];

const isCurrent = (pathname: string, href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/jobs/") : pathname.startsWith(href));

/** Header navigation: inline from tablet width, a menu panel on phones. */
export function MainNav() {
  const pathname = usePathname();
  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
        {NAV.map((item) => {
          const current = isCurrent(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-[0.94rem] font-semibold transition-colors",
                current ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Sheet>
        <SheetTrigger
          className="order-last -mr-2 inline-flex size-11 items-center justify-center rounded-md text-white/90 hover:bg-white/10 sm:hidden"
          aria-label="Open menu"
        >
          <MenuIcon className="size-6" />
        </SheetTrigger>
        <SheetContent side="right" className="w-[min(20rem,85vw)] bg-paper p-0 text-ink">
          <SheetHeader className="border-b border-line px-5 py-4">
            <SheetTitle className="font-expanded text-base font-extrabold">Menu</SheetTitle>
          </SheetHeader>
          <nav aria-label="Main" className="flex flex-col px-2">
            {[...NAV, { href: "/account/jobs", label: "Your jobs" }, { href: "/account", label: "Your account" }, { href: "/privacy", label: "Privacy" }, { href: "/terms", label: "Terms" }].map((item) => (
              // Closing on tap: the panel would otherwise stay open over the new page.
              <SheetClose
                key={item.href}
                nativeButton={false}
                render={<Link href={item.href} aria-current={isCurrent(pathname, item.href) ? "page" : undefined} />}
                className="rounded-md px-3 py-3 text-[1.05rem] font-semibold aria-[current=page]:bg-teal-wash aria-[current=page]:text-teal"
              >
                {item.label}
              </SheetClose>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
