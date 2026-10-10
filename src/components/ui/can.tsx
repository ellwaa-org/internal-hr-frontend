import type { ReactNode } from 'react'
import { hasAnyPermission, type Permission, type PermissionSource } from '@/lib/permissions'

/**
 * Renders children only when the required permission(s) are held.
 * `fallback` replaces the children when access is denied (default: nothing).
 * Hooks live in `@/lib/permissions` (usePermission / useAnyPermission).
 */
export function Can({
  permission,
  anyOf,
  permissions,
  fallback = null,
  children,
}: {
  /** Exact permission key, e.g. "user.create". */
  permission?: Permission
  /** Any-of list — used instead of `permission` when given. */
  anyOf?: readonly Permission[]
  permissions: PermissionSource
  fallback?: ReactNode
  children: ReactNode
}) {
  const allowed = anyOf
    ? hasAnyPermission(permissions, ...anyOf)
    : permission
      ? hasAnyPermission(permissions, permission)
      : true
  return <>{allowed ? children : fallback}</>
}
