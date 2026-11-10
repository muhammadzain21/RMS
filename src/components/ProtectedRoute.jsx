import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../state/AuthContext.jsx'
import { useData } from '../state/DataContext.jsx'
import { expandEnabledPaths, visibleItems } from '../layout/navConfig.js'

// Paths that correspond to a gated feature (sidebar pages). Sub-routes of a
// feature (e.g. /staff/payroll/summary/123) inherit its gate. Routes that don't
// map to any feature (e.g. /staff/history/:id) are governed by roles only.
const FEATURE_PATHS = visibleItems().map(i => i.path)

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth()
  const { state } = useData()
  const location = useLocation()
  
  if (!user) return <Navigate to="/login" replace />

  // Admin / SuperAdmin always have full access
  if (user.role === 'SuperAdmin' || user.role === 'Admin') return children

  const isMyWorkRoute = location.pathname === '/my' || location.pathname.startsWith('/my/')
  const canSeeMyWork = Boolean(user.staffId) && user.myWorkAccess === true

  const currentPath = location.pathname
  const enabledPaths = expandEnabledPaths(state?.settings?.enabledPaths)
  const isEnabled = (path) =>
    !Array.isArray(enabledPaths) || enabledPaths.length === 0 || enabledPaths.includes(path)

  // Pages the user may actually render (visible permission + enabled feature)
  const allowedPaths = Array.isArray(user.permissions)
    ? user.permissions.filter(p => p.visible).map(p => p.path)
    : null
  const fallbackPath = allowedPaths ? allowedPaths.find(isEnabled) : null
  const noAccess = (
    <div className="flex items-center justify-center h-full p-10 text-sm text-gray-500 dark:text-gray-400">
      You do not have access to any page. Please contact your administrator.
    </div>
  )

  // Feature access: gated feature paths must be enabled by the superadmin
  if (Array.isArray(enabledPaths) && enabledPaths.length > 0) {
    // Longest feature path that owns this route (exact or prefix-segment match)
    const featurePath = FEATURE_PATHS
      .filter(p => currentPath === p || currentPath.startsWith(p + '/'))
      .sort((a, b) => b.length - a.length)[0]
    if (featurePath && !enabledPaths.includes(featurePath)) {
      // Redirect to a page the user can render; never ping-pong between redirects
      return fallbackPath && fallbackPath !== currentPath
        ? <Navigate to={fallbackPath} replace />
        : noAccess
    }
  }

  if (isMyWorkRoute) {
    if (canSeeMyWork) return children
    return fallbackPath && fallbackPath !== currentPath
      ? <Navigate to={fallbackPath} replace />
      : noAccess
  }

  // Check if user's role is in allowed roles (unless they have an explicit custom permission set)
  if (roles && roles.includes(user.role) && !user.useCustomPermissions) return children

  // Custom / role permissions: check if current path is allowed
  if (allowedPaths) {
    // Check if current path matches any allowed permission
    const isAllowed = allowedPaths.some(path => {
      // Exact match
      if (path === currentPath) return true
      // Handle sub-routes (e.g., /sales/new matches /sales)
      if (currentPath.startsWith(path + '/')) return true
      return false
    })

    if (isAllowed) return children

    // Not authorized — send to their first usable page, or show no-access
    return fallbackPath && fallbackPath !== currentPath
      ? <Navigate to={fallbackPath} replace />
      : noAccess
  }

  // Not authorized, redirect to dashboard (avoid self-redirect loop on '/')
  return currentPath === '/' ? noAccess : <Navigate to="/" replace />
}
