import Link from "next/link";

// For admins the Platinum Painters logo on any page goes back to the Hub.
// Everyone else keeps whatever the page did before (`fallbackHref`, or no link).
export function HubLogoLink({
  isAdmin,
  fallbackHref,
  className,
  children,
}: {
  isAdmin: boolean;
  fallbackHref?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const href = isAdmin ? "/hub" : fallbackHref;
  if (!href) return <>{children}</>;
  return (
    <Link href={href} className={className} title={isAdmin ? "Back to the Hub" : undefined}>
      {children}
    </Link>
  );
}
