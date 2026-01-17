import React from "react"
import { Outlet, Link, useLocation } from "react-router-dom"
import {
  Activity,
  Database,
  BarChart3,
  AlertTriangle,
  Settings,
} from "lucide-react"

import { cn } from "@/lib/utils"

const navigation = [
  { name: "Dashboard", href: "/", icon: Activity },
  { name: "Events", href: "/events", icon: Database },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Alerts", href: "/alerts", icon: AlertTriangle },
  { name: "Settings", href: "/settings", icon: Settings },
]

function SideNavigation() {
  const location = useLocation()

  return (
    <div className="absolute left-0 top-0 h-full w-16 bg-background border-r border-border flex flex-col items-center py-4 space-y-4 z-50">
      {navigation.map((item) => {
        const active = location.pathname === item.href
        return (
          <Link
            key={item.name}
            to={item.href}
            className={cn(
              "flex items-center justify-center p-3 rounded-md transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/60"
            )}
            title={item.name}
          >
            <item.icon className="h-5 w-5" />
          </Link>
        )
      })}
    </div>
  )
}

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Floating left sidebar */}
      <SideNavigation />

      {/* Page content with left margin for sidebar */}
      <main className="flex-1 ml-16 px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
