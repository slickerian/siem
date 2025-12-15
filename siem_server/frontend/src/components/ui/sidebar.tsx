import * as React from "react"
import { cn } from "@/lib/utils"

/* =========================================================
   FLOATING TOP BAR (COMPACT)
   ========================================================= */

export const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "fixed z-50",
        "bg-card/80 dark:bg-neutral-900/60 backdrop-blur-xl",
        "border shadow-lg rounded-xl",
        "flex items-center",
        "transition-all duration-200 ease-out",
        className
      )}
      style={{
        /* ===== POSITION ===== */
        top: 12,
        left: "63%",
        transform: "translateX(-50%)",

        /* ===== SIZE ===== */
        height: 44,
        paddingInline: 12,
      }}
      {...props}
    >
      {children}
    </div>
  )
})

Sidebar.displayName = "Sidebar"

/* =========================================================
   CONTENT WRAPPER
   ========================================================= */

export function SidebarContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm font-medium",
        className
      )}
    >
      {children}
    </div>
  )
}
