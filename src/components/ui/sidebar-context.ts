import { createContext, useContext } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: Dispatch<SetStateAction<boolean>>
  openMobile: boolean
  setOpenMobile: Dispatch<SetStateAction<boolean>>
}

export const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within <SidebarProvider>')
  return ctx
}
