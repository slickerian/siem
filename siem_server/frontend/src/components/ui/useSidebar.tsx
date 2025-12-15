import * as React from "react"

type SidebarContextType = {
  open: boolean
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void
}

export const SidebarContext = React.createContext<SidebarContextType | null>(null)

export function useSidebar() {
  const ctx = React.useContext(SidebarContext)
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider")
  }
  return ctx
}
