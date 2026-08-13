import {
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { Menu, PanelLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'
import { SidebarContext, useSidebar, type SidebarContextValue } from './sidebar-context'

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
      <div
        className="flex h-svh overflow-hidden bg-background text-muted max-md:max-w-screen max-md:flex-col max-md:overflow-x-hidden"
        data-collapsed={collapsed ? 'true' : 'false'}
        dir="rtl"
      >
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
          <DialogPrimitive.Overlay className="fixed inset-0 z-[9998] bg-black/55 data-[state=open]:animate-overlay-in" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 start-0 z-[9999] flex w-[264px] max-w-[min(264px,92svw)] flex-col border-e border-border bg-white shadow-[-8px_0_30px_rgba(0,0,0,0.2)] outline-none data-[state=closed]:animate-drawer-out-rtl data-[state=open]:animate-drawer-in-rtl"
            dir="rtl"
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogPrimitive.Title className="sr-only">القائمة الجانبية</DialogPrimitive.Title>
            <SidebarContext.Provider value={mobileCtx}>
              <aside
                data-mobile
                dir="rtl"
                className={cn('flex h-full w-full flex-col bg-white text-foreground', className)}
              >
                {children}
              </aside>
            </SidebarContext.Provider>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <aside
        data-collapsed={collapsed ? 'true' : 'false'}
        className={cn(
          'group flex h-full w-[264px] shrink-0 flex-col border-e border-border bg-white text-foreground transition-[width] duration-200 data-[collapsed=true]:w-16 max-md:hidden',
          className,
        )}
      >
        {children}
      </aside>
    </>
  )
}

export function SidebarHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-3.5 group-data-[collapsed=true]:justify-center group-data-[collapsed=true]:px-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SidebarContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto p-3', className)}>{children}</div>
}

export function SidebarFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('shrink-0 border-t border-border p-3', className)}>{children}</div>
}

export function SidebarMenu({ children, className }: { children: ReactNode; className?: string }) {
  return <nav className={cn('flex flex-col gap-0.5', className)}>{children}</nav>
}

export function SidebarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex flex-col gap-0.5', className)}>{children}</div>
}

export function SidebarGroupLabel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'px-3 pt-2 pb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase group-data-[collapsed=true]:hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SidebarMenuItem({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(className)}>{children}</div>
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
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-3 py-2.5 text-start text-sm font-medium text-foreground transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent data-[active=true]:bg-accent data-[active=true]:text-accent-foreground group-data-[collapsed=true]:justify-center group-data-[collapsed=true]:px-2.5 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0',
        className,
      )}
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
      className={cn('mb-2.5 h-px bg-border', className)}
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
      className={cn(
        'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-0 text-foreground transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        className,
      )}
      onClick={handleClick}
      aria-label="تبديل القائمة الجانبية"
    >
      <Menu className="h-5 w-5 md:hidden" />
      <PanelLeft className="hidden h-5 w-5 scale-x-[-1] md:block" />
    </button>
  )
}

export function SidebarClose({ className }: { className?: string }) {
  const { setOpenMobile } = useSidebar()

  return (
    <button
      type="button"
      className={cn(
        'ms-auto inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-0 text-foreground transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent md:hidden',
        className,
      )}
      aria-label="إغلاق القائمة الجانبية"
      onClick={() => setOpenMobile(false)}
    >
      <X className="h-5 w-5" />
    </button>
  )
}

export function SidebarLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('min-w-0 truncate group-data-[collapsed=true]:hidden', className)}>
      {children}
    </span>
  )
}
