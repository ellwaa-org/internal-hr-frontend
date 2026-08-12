import {
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { Menu, PanelLeft, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { SidebarContext, useSidebar, type SidebarContextValue } from './sidebar-context'
import './sidebar.css'

const MOBILE_BREAKPOINT = '(max-width: 768px)'

export function SidebarProvider({
  children,
  defaultCollapsed = false,
}: {
  children: ReactNode
  defaultCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [openMobile, setOpenMobile] = useState(false)

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, openMobile, setOpenMobile }}>
      <div className="sidebar-provider" data-collapsed={collapsed} dir="rtl">
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export function Sidebar({ children, className }: { children: ReactNode; className?: string }) {
  const { openMobile, setOpenMobile, collapsed } = useSidebar()
  const mobileCtx: SidebarContextValue = {
    collapsed: false,
    setCollapsed: () => {},
    openMobile,
    setOpenMobile,
  }

  return (
    <>
      <DialogPrimitive.Root open={openMobile} onOpenChange={setOpenMobile}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="sidebar-overlay" />
          <DialogPrimitive.Content
            className="sidebar-mobile"
            dir="rtl"
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogPrimitive.Title className="sr-only">القائمة الجانبية</DialogPrimitive.Title>
            <SidebarContext.Provider value={mobileCtx}>
              <aside data-mobile dir="rtl" className={cn('sidebar', className)}>
                {children}
              </aside>
            </SidebarContext.Provider>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <aside data-collapsed={collapsed ? 'true' : 'false'} className={cn('sidebar', className)}>
        {children}
      </aside>
    </>
  )
}

export function SidebarHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sidebar-header', className)}>{children}</div>
}

export function SidebarContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sidebar-content', className)}>{children}</div>
}

export function SidebarFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sidebar-footer', className)}>{children}</div>
}

export function SidebarMenu({ children, className }: { children: ReactNode; className?: string }) {
  return <nav className={cn('sidebar-menu', className)}>{children}</nav>
}

export function SidebarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sidebar-group', className)}>{children}</div>
}

export function SidebarGroupLabel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('sidebar-group-label', className)}>{children}</div>
}

export function SidebarMenuItem({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sidebar-menu-item', className)}>{children}</div>
}

export function SidebarMenuButton({
  children,
  className,
  isActive = false,
  tooltip,
  onClick,
}: {
  children: ReactNode
  className?: string
  isActive?: boolean
  tooltip?: string
  onClick?: () => void
}) {
  const { collapsed } = useSidebar()
  const button = (
    <button
      type="button"
      data-active={isActive}
      className={cn('sidebar-menu-button', className)}
      onClick={onClick}
    >
      {children}
    </button>
  )

  if (collapsed && tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="left">{tooltip}</TooltipContent>
      </Tooltip>
    )
  }
  return button
}

export function SidebarSeparator({
  className,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      decorative
      orientation="horizontal"
      className={cn('sidebar-separator', className)}
      {...props}
    />
  )
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { setCollapsed, setOpenMobile } = useSidebar()

  const handleClick = () => {
    if (window.matchMedia(MOBILE_BREAKPOINT).matches) {
      setOpenMobile((v) => !v)
    } else {
      setCollapsed((v) => !v)
    }
  }

  return (
    <button
      type="button"
      className={cn('sidebar-trigger', className)}
      onClick={handleClick}
      aria-label="تبديل القائمة الجانبية"
    >
      <Menu className="sidebar-trigger-icon sidebar-trigger-icon-mobile" />
      <PanelLeft className="sidebar-trigger-icon sidebar-trigger-icon-desktop sidebar-trigger-icon-flip" />
    </button>
  )
}

export function SidebarClose({ className }: { className?: string }) {
  const { setOpenMobile } = useSidebar()

  return (
    <button
      type="button"
      className={cn('sidebar-trigger sidebar-close-btn', className)}
      aria-label="إغلاق القائمة الجانبية"
      onClick={() => setOpenMobile(false)}
    >
      <X className="sidebar-trigger-icon" />
    </button>
  )
}
