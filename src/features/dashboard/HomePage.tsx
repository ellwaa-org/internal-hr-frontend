import { useEffect, useState } from 'react'
import {
  Building2,
  Briefcase,
  CalendarCheck,
  ChevronUp,
  LogOut,
  MapPin,
  Settings,
  Users,
} from 'lucide-react'
import { clearToken, getProfile, type Profile, type Role } from '@/lib/api'
import { isUnauthorizedError } from '@/lib/errors'
import { notify } from '@/lib/toast'
import AttendancePage from '@/features/attendance/AttendancePage'
import DepartmentsPage from '@/features/departments/DepartmentsPage'
import EmployeesPage from '@/features/employees/EmployeesPage'
import OfficesPage from '@/features/offices/OfficesPage'
import SettingsPage from '@/features/settings/SettingsPage'
import TasksPage from '@/features/tasks/TasksPage'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'مدير النظام',
  HR: 'موارد بشرية',
  EMPLOYEE: 'موظف',
}

type NavPage = 'employees' | 'departments' | 'offices' | 'attendance' | 'tasks' | 'settings'

const NAV_TITLES: Record<NavPage, string> = {
  employees: 'الموظفون',
  departments: 'الإدارات',
  offices: 'المكاتب',
  attendance: 'الحضور والانصراف',
  tasks: 'المهام الخارجية',
  settings: 'الإعدادات',
}

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
}: {
  profile: Profile | null
  onSignOut: () => void
}) {
  const { collapsed } = useSidebar()
  const name = profile?.fullName ?? 'الملف الشخصي'
  const role = profile ? ROLE_LABELS[profile.role] : ''

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
        <DropdownMenuItem variant="danger" onSelect={onSignOut}>
          <LogOut />
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function HomeShell({
  token,
  profile,
  page,
  onNavigate,
  onSignOut,
  onProfileUpdated,
}: {
  token: string
  profile: Profile
  page: NavPage
  onNavigate: (page: NavPage) => void
  onSignOut: () => void
  onProfileUpdated: (profile: Profile) => void
}) {
  const { setOpenMobile } = useSidebar()

  const goTo = (next: NavPage) => {
    onNavigate(next)
    setOpenMobile(false)
  }

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
            <SidebarGroup>
              <SidebarGroupLabel>الرئيسية</SidebarGroupLabel>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'employees'}
                  tooltip="الموظفون"
                  onClick={() => goTo('employees')}
                >
                  <Users />
                  <SidebarLabel>الموظفون</SidebarLabel>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'departments'}
                  tooltip="الإدارات"
                  onClick={() => goTo('departments')}
                >
                  <Building2 />
                  <SidebarLabel>الإدارات</SidebarLabel>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'offices'}
                  tooltip="المكاتب"
                  onClick={() => goTo('offices')}
                >
                  <MapPin />
                  <SidebarLabel>المكاتب</SidebarLabel>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>العمليات</SidebarGroupLabel>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'attendance'}
                  tooltip="الحضور والانصراف"
                  onClick={() => goTo('attendance')}
                >
                  <CalendarCheck />
                  <SidebarLabel>الحضور والانصراف</SidebarLabel>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'tasks'}
                  tooltip="المهام الخارجية"
                  onClick={() => goTo('tasks')}
                >
                  <Briefcase />
                  <SidebarLabel>المهام الخارجية</SidebarLabel>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'settings'}
                  tooltip="الإعدادات"
                  onClick={() => goTo('settings')}
                >
                  <Settings />
                  <SidebarLabel>الإعدادات</SidebarLabel>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarGroup>
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter>
          <SidebarSeparator />
          <UserFooter profile={profile} onSignOut={onSignOut} />
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
          {page === 'employees' ? (
            <EmployeesPage token={token} onUnauthorized={onSignOut} />
          ) : page === 'departments' ? (
            <DepartmentsPage token={token} onUnauthorized={onSignOut} />
          ) : page === 'offices' ? (
            <OfficesPage token={token} onUnauthorized={onSignOut} />
          ) : page === 'attendance' ? (
            <AttendancePage token={token} onUnauthorized={onSignOut} />
          ) : page === 'tasks' ? (
            <TasksPage token={token} onUnauthorized={onSignOut} />
          ) : (
            <SettingsPage
              token={token}
              profile={profile}
              onUnauthorized={onSignOut}
              onProfileUpdated={onProfileUpdated}
            />
          )}
        </main>
      </div>
    </>
  )
}

function HomePage({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [page, setPage] = useState<NavPage>('employees')
  const [accessChecked, setAccessChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    getProfile(token)
      .then((data) => {
        if (cancelled) return
        if (data.role !== 'ADMIN' && data.role !== 'HR') {
          notify.error('هذه اللوحة مخصصة لمديري النظام وموارد البشرية فقط.')
          clearToken()
          onSignOut()
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

  const handleSignOut = () => {
    clearToken()
    notify.info('تم تسجيل الخروج', 'نراك قريباً.')
    onSignOut()
  }

  if (!accessChecked || !profile) {
    return (
      <div className="m-6 max-w-[480px] rounded-2xl border border-border bg-white p-7 shadow-card">
        <p className="m-0 text-sm text-muted">جارٍ التحقق من الصلاحيات...</p>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <HomeShell
        token={token}
        profile={profile}
        page={page}
        onNavigate={setPage}
        onSignOut={handleSignOut}
        onProfileUpdated={setProfile}
      />
    </SidebarProvider>
  )
}

export default HomePage
