import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Briefcase,
  Building2,
  CalendarCheck,
  ChevronUp,
  LogOut,
  MapPin,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { clearToken, getProfile, type Profile } from '@/lib/api'
import { isUnauthorizedError } from '@/lib/errors'
import { NAV_PATHS, NAV_TITLES, canAccessNavPage, firstAllowedPage, navPageFromPath, type NavPage } from '@/lib/nav'
import { roleLabel } from '@/lib/permissions'
import { notify } from '@/lib/toast'
import AttendancePage from '@/features/attendance/AttendancePage'
import DepartmentsPage from '@/features/departments/DepartmentsPage'
import EmployeesPage from '@/features/employees/EmployeesPage'
import OfficesPage from '@/features/offices/OfficesPage'
import RolesPage from '@/features/roles/RolesPage'
import SettingsPage from '@/features/settings/SettingsPage'
import TasksPage from '@/features/tasks/TasksPage'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarClose,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { useSidebar } from '@/components/ui/sidebar-context'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo.webp'

const NAV_ICONS: Record<NavPage, typeof Users> = {
  employees: Users,
  departments: Building2,
  offices: MapPin,
  attendance: CalendarCheck,
  tasks: Briefcase,
  roles: ShieldCheck,
  settings: Settings,
}

const NAV_GROUPS: { label: string; pages: NavPage[] }[] = [
  { label: 'الرئيسية', pages: ['employees', 'departments', 'offices', 'roles'] },
  { label: 'العمليات', pages: ['attendance', 'tasks', 'settings'] },
]

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
}

function UserFooter({
  profile,
  onSignOut,
  onRefreshPermissions,
  refreshingPermissions,
}: {
  profile: Profile | null
  onSignOut: () => void
  onRefreshPermissions: () => void
  refreshingPermissions: boolean
}) {
  const { collapsed } = useSidebar()
  const name = profile?.fullName ?? 'الملف الشخصي'
  const role = roleLabel(profile?.role)

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent p-2 text-start text-inherit transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
          collapsed && 'justify-center',
        )}
      >
        <Avatar>
          <AvatarImage src="" alt={name} />
          <AvatarFallback>{initialsOf(name)}</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-foreground">{name}</span>
              <span className="truncate text-xs text-muted">{role}</span>
            </span>
            <ChevronUp className="ms-auto h-4 w-4 shrink-0 text-muted" />
          </>
        )}
      </button>
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="left">{name}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent side="top" align="end" className="min-w-[220px]">
        <DropdownMenuLabel>الملف الشخصي</DropdownMenuLabel>
        <div className="flex flex-col gap-0.5 px-2.5 pt-1 pb-2.5">
          <span className="text-sm font-semibold text-foreground">{name}</span>
          {role && <span className="text-xs text-muted">{role}</span>}
          {profile && <span className="text-xs text-muted">كود الموظف: {profile.employeeCode}</span>}
          {profile && profile.points > 0 && (
            <span className="text-xs text-muted">النقاط: {profile.points}</span>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={refreshingPermissions} onSelect={onRefreshPermissions}>
          <RefreshCw className={cn(refreshingPermissions && 'animate-spin')} />
          تحديث الصلاحيات
        </DropdownMenuItem>
        <DropdownMenuItem variant="danger" onSelect={onSignOut}>
          <LogOut />
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NoPermissionsScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-white p-6">
      <div className="flex w-full max-w-[460px] flex-col items-center gap-4 rounded-2xl border border-border bg-white px-8 py-10 text-center shadow-card">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="m-0 text-lg font-bold text-foreground">لا تملك أي صلاحيات</h1>
        <p className="m-0 text-sm leading-relaxed text-muted">
          حسابك مسجل في النظام لكن لم يُمنح أي صلاحيات بعد. تواصل مع المسؤول لمنح دور يحتوي على
          الصلاحيات المناسبة.
        </p>
        <Button type="button" variant="secondary" onClick={onSignOut}>
          <LogOut />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  )
}

/** Route guard — hides nothing from the URL bar, but blocks pages without permission. */
function RequirePermission({
  profile,
  page,
  children,
}: {
  profile: Profile
  page: NavPage
  children: ReactNode
}) {
  if (!canAccessNavPage(profile, page)) {
    return (
      <div className="m-6 max-w-[480px] rounded-2xl border border-border bg-white p-7 shadow-card">
        <div className="mb-2 flex items-center gap-2 text-warning">
          <ShieldAlert className="h-5 w-5" />
          <span className="text-sm font-bold">403 — لا تملك صلاحية الوصول</span>
        </div>
        <p className="m-0 text-sm leading-relaxed text-muted">
          لا تملك صلاحية عرض صفحة «{NAV_TITLES[page]}». تواصل مع المسؤول إذا كنت تعتقد أن هذا خطأ.
        </p>
        <a
          className="mt-4 inline-flex h-10 items-center rounded-[10px] bg-neutral-900 px-4 text-sm font-semibold text-white no-underline"
          href={NAV_PATHS[firstAllowedPage(profile)]}
        >
          العودة للصفحة الرئيسية
        </a>
      </div>
    )
  }
  return <>{children}</>
}

function HomeShell({
  profile,
  onSignOut,
  onRefreshPermissions,
  refreshingPermissions,
}: {
  profile: Profile
  onSignOut: () => void
  onRefreshPermissions: () => void
  refreshingPermissions: boolean
}) {
  const { setOpenMobile } = useSidebar()
  const location = useLocation()
  const fallbackPage = firstAllowedPage(profile)
  const page = navPageFromPath(location.pathname) ?? fallbackPage
  const closeMobile = () => setOpenMobile(false)

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <img
            src={logo}
            className="h-[34px] w-[34px] shrink-0 object-contain"
            alt="شعار اللواء للخدمات القانونية"
          />
          <SidebarLabel className="text-[15px] font-bold text-foreground">
            اللواء للخدمات القانونية
          </SidebarLabel>
          <SidebarClose />
        </SidebarHeader>

        <SidebarContent>
          <SidebarMenu>
            {NAV_GROUPS.map((group) => {
              const visible = group.pages.filter((p) => canAccessNavPage(profile, p))
              if (visible.length === 0) return null
              return (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                  {visible.map((item) => {
                    const Icon = NAV_ICONS[item]
                    return (
                      <SidebarMenuItem key={item}>
                        <SidebarMenuButton
                          asChild
                          isActive={page === item}
                          tooltip={NAV_TITLES[item]}
                          onClick={closeMobile}
                        >
                          <NavLink to={NAV_PATHS[item]}>
                            <Icon />
                            <SidebarLabel>{NAV_TITLES[item]}</SidebarLabel>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarGroup>
              )
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator />
          <UserFooter
            profile={profile}
            onSignOut={onSignOut}
            onRefreshPermissions={onRefreshPermissions}
            refreshingPermissions={refreshingPermissions}
          />
        </SidebarFooter>
      </Sidebar>

      <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-5 max-md:gap-2 max-md:px-3">
          <SidebarTrigger />
          <span className="min-w-0 truncate text-base font-semibold text-foreground max-md:text-[15px]">
            {NAV_TITLES[page]}
          </span>
        </header>
        <main className="min-h-0 max-w-full flex-1 overflow-auto p-7 max-md:px-3 max-md:pt-3.5 max-md:pb-5">
          <Outlet />
        </main>
      </div>
    </>
  )
}

function HomePage({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accessChecked, setAccessChecked] = useState(false)
  const [noPermissions, setNoPermissions] = useState(false)
  const [refreshingPermissions, setRefreshingPermissions] = useState(false)

  useEffect(() => {
    let cancelled = false
    getProfile(token)
      .then((data) => {
        if (cancelled) return
        // Access is decided by permissions only — a user with none gets a
        // friendly screen instead of a silent kick back to the login page.
        if (!data.permissions || data.permissions.length === 0) {
          setNoPermissions(true)
          setAccessChecked(true)
          return
        }
        setProfile(data)
        setAccessChecked(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (isUnauthorizedError(err)) {
          notify.error(err, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.')
          clearToken()
          onSignOut()
          return
        }
        notify.error(err, 'تعذر تحميل الملف الشخصي.')
        clearToken()
        onSignOut()
      })
    return () => {
      cancelled = true
    }
  }, [token, onSignOut])

  const handleRefreshPermissions = useCallback(() => {
    if (!token || refreshingPermissions) return
    setRefreshingPermissions(true)
    const toastId = notify.loading('جارٍ تحديث الصلاحيات...')
    getProfile(token)
      .then((data) => {
        notify.dismiss(toastId)
        if (!data.permissions || data.permissions.length === 0) {
          notify.info('لا توجد صلاحيات مرتبطة بحسابك.')
          setNoPermissions(true)
          setProfile(null)
          return
        }
        setProfile(data)
        setNoPermissions(false)
        notify.success('تم تحديث الصلاحيات')
      })
      .catch((err: unknown) => {
        notify.dismiss(toastId)
        if (isUnauthorizedError(err)) {
          notify.error(err, 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.')
          clearToken()
          onSignOut()
          return
        }
        notify.error(err, 'تعذر تحديث الصلاحيات.')
      })
      .finally(() => setRefreshingPermissions(false))
  }, [token, refreshingPermissions, onSignOut])

  const handleSignOut = () => {
    clearToken()
    notify.info('تم تسجيل الخروج', 'نراك قريباً.')
    onSignOut()
  }

  if (!accessChecked) {
    return (
      <div className="m-6 max-w-[480px] rounded-2xl border border-border bg-white p-7 shadow-card">
        <p className="m-0 text-sm text-muted">جارٍ التحقق من الصلاحيات...</p>
      </div>
    )
  }

  if (noPermissions || !profile) {
    return <NoPermissionsScreen onSignOut={handleSignOut} />
  }

  const homePath = NAV_PATHS[firstAllowedPage(profile)]

  return (
    <SidebarProvider>
      <Routes>
        <Route
          element={
            <HomeShell
              profile={profile}
              onSignOut={handleSignOut}
              onRefreshPermissions={handleRefreshPermissions}
              refreshingPermissions={refreshingPermissions}
            />
          }
        >
          <Route
            path={NAV_PATHS.employees}
            element={
              <RequirePermission profile={profile} page="employees">
                <EmployeesPage token={token} permissions={profile.permissions} onUnauthorized={handleSignOut} />
              </RequirePermission>
            }
          />
          <Route
            path={NAV_PATHS.departments}
            element={
              <RequirePermission profile={profile} page="departments">
                <DepartmentsPage token={token} permissions={profile.permissions} onUnauthorized={handleSignOut} />
              </RequirePermission>
            }
          />
          <Route
            path={NAV_PATHS.offices}
            element={
              <RequirePermission profile={profile} page="offices">
                <OfficesPage token={token} permissions={profile.permissions} onUnauthorized={handleSignOut} />
              </RequirePermission>
            }
          />
          <Route
            path={NAV_PATHS.attendance}
            element={
              <RequirePermission profile={profile} page="attendance">
                <AttendancePage token={token} permissions={profile.permissions} onUnauthorized={handleSignOut} />
              </RequirePermission>
            }
          />
          <Route
            path={NAV_PATHS.tasks}
            element={
              <RequirePermission profile={profile} page="tasks">
                <TasksPage token={token} permissions={profile.permissions} onUnauthorized={handleSignOut} />
              </RequirePermission>
            }
          />
          <Route
            path={NAV_PATHS.roles}
            element={
              <RequirePermission profile={profile} page="roles">
                <RolesPage token={token} permissions={profile.permissions} onUnauthorized={handleSignOut} />
              </RequirePermission>
            }
          />
          <Route
            path={NAV_PATHS.settings}
            element={
              <SettingsPage
                token={token}
                profile={profile}
                onUnauthorized={handleSignOut}
                onProfileUpdated={setProfile}
              />
            }
          />
          <Route path="/" element={<Navigate to={homePath} replace />} />
          <Route path="*" element={<Navigate to={homePath} replace />} />
        </Route>
      </Routes>
    </SidebarProvider>
  )
}

export default HomePage
