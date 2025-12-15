import React from "react"
import { Outlet, Link, useLocation } from "react-router-dom"
import {
  Activity,
  Database,
  BarChart3,
  AlertTriangle,
  Settings,
} from "lucide-react"
import { Sidebar, SidebarContent } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

const navigation = [
  { name: "Dashboard", href: "/", icon: Activity },
  { name: "Events", href: "/events", icon: Database },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Alerts", href: "/alerts", icon: AlertTriangle },
  { name: "Settings", href: "/settings", icon: Settings },
]

function TopNavigation() {
  const location = useLocation()

  return (
    <Sidebar>
      <SidebarContent>
        {navigation.map((item) => {
          const active = location.pathname === item.href
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{item.name}</span>
            </Link>
          )
        })}
      </SidebarContent>
    </Sidebar>
  )
}

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      {/* Floating top nav */}
      <TopNavigation />

      {/* Page content scrolls underneath */}
      <main className="px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
