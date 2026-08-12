import { useEffect, useState } from 'react'
import {
  Building2,
  CalendarCheck,
  ChevronUp,
  ClipboardList,
  LogOut,
  MapPin,
  Settings,
  Users,
} from 'lucide-react'
import { clearToken, getProfile, type Profile, type Role } from './lib/api'
import { isUnauthorizedError } from './lib/errors'
import { notify } from './lib/toast'
import AttendancePage from './Attendance'
import DepartmentsPage from './Departments'
import EmployeesPage from './Employees'
import OfficesPage from './Offices'
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarClose,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from './components/ui/sidebar'
import { useSidebar } from './components/ui/sidebar-context'
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip'
import logo from './assets/logo.webp'
import './Home.css'

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'مدير النظام',
  HR: 'موارد بشرية',
  EMPLOYEE: 'موظف',
}

type NavPage = 'employees' | 'departments' | 'offices' | 'attendance' | 'reports' | 'settings'

const NAV_TITLES: Record<NavPage, string> = {
  employees: 'الموظفون',
  departments: 'الإدارات',
  offices: 'المكاتب',
  attendance: 'الحضور والانصراف',
  reports: 'التقارير',
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

function isUnauthorized(err: unknown): boolean {
  return isUnauthorizedError(err)
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
      <button type="button" className="sidebar-user">
        <Avatar>
          <AvatarImage src="" alt={name} />
          <AvatarFallback>{initialsOf(name)}</AvatarFallback>
        </Avatar>
        <span className="sidebar-user-info">
          <span className="sidebar-user-name">{name}</span>
          <span className="sidebar-user-role">{role}</span>
        </span>
        <ChevronUp className="sidebar-footer-chevron" />
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
      <DropdownMenuContent>
        <DropdownMenuLabel>الملف الشخصي</DropdownMenuLabel>
        <div className="dropdown-profile">
          <span className="dropdown-profile-name">{name}</span>
          {role && <span className="dropdown-profile-role">{role}</span>}
          {profile && <span className="dropdown-profile-code">كود الموظف: {profile.employeeCode}</span>}
          {profile && profile.points > 0 && (
            <span className="dropdown-profile-points">النقاط: {profile.points}</span>
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

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="page-card">
      <h1 className="welcome-title">{title}</h1>
      <p className="welcome-subtitle">هذه الصفحة قيد التطوير وستكون متاحة قريباً.</p>
    </div>
  )
}

function HomeShell({
  token,
  profile,
  page,
  onNavigate,
  onSignOut,
}: {
  token: string
  profile: Profile | null
  page: NavPage
  onNavigate: (page: NavPage) => void
  onSignOut: () => void
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
          <img src={logo} className="sidebar-logo" alt="شعار اللواء للخدمات القانونية" />
          <span className="sidebar-brand">اللواء للخدمات القانونية</span>
          <SidebarClose className="sidebar-header-close" />
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
                  <span className="sidebar-menu-label">الموظفون</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'departments'}
                  tooltip="الإدارات"
                  onClick={() => goTo('departments')}
                >
                  <Building2 />
                  <span className="sidebar-menu-label">الإدارات</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'offices'}
                  tooltip="المكاتب"
                  onClick={() => goTo('offices')}
                >
                  <MapPin />
                  <span className="sidebar-menu-label">المكاتب</span>
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
                  <span className="sidebar-menu-label">الحضور والانصراف</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'reports'}
                  tooltip="التقارير"
                  onClick={() => goTo('reports')}
                >
                  <ClipboardList />
                  <span className="sidebar-menu-label">التقارير</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === 'settings'}
                  tooltip="الإعدادات"
                  onClick={() => goTo('settings')}
                >
                  <Settings />
                  <span className="sidebar-menu-label">الإعدادات</span>
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

      <div className="sidebar-main">
        <header className="topbar">
          <SidebarTrigger />
          <span className="topbar-title">{NAV_TITLES[page]}</span>
        </header>
        <main className="page-content">
          {page === 'employees' ? (
            <EmployeesPage token={token} onUnauthorized={onSignOut} />
          ) : page === 'departments' ? (
            <DepartmentsPage token={token} onUnauthorized={onSignOut} />
          ) : page === 'offices' ? (
            <OfficesPage token={token} onUnauthorized={onSignOut} />
          ) : page === 'attendance' ? (
            <AttendancePage token={token} onUnauthorized={onSignOut} />
          ) : (
            <PlaceholderPage title={NAV_TITLES[page]} />
          )}
        </main>
      </div>
    </>
  )
}

function Home({ token, onSignOut }: { token: string; onSignOut: () => void }) {
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
        if (isUnauthorized(err)) {
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
      <div className="page-card" style={{ margin: 24, maxWidth: 480 }}>
        <p className="welcome-subtitle">جارٍ التحقق من الصلاحيات...</p>
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
      />
    </SidebarProvider>
  )
}

export default Home
