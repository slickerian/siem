import * as React from "react"

const SidebarContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void
} | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

export { useSidebar, SidebarContext }