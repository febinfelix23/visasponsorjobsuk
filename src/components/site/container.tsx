import { cn } from "@/lib/utils";

/** The page measure: wide enough for a filter rail beside results, with phone-width gutters. */
export function Container({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props} />;
}

/** A standard page body: the measure plus the space between header and footer. */
export function Page({ className, ...props }: React.ComponentProps<"div">) {
  return <Container className={cn("pt-8 pb-16 sm:pt-10", className)} {...props} />;
}
