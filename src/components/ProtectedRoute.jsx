import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../state/AuthContext.jsx'
import { useData } from '../state/DataContext.jsx'

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth()
  const { state } = useData()
  const location = useLocation()
  
  if (!user) return <Navigate to="/login" replace />

  // SuperAdmin bypasses everything (including feature access)
  if (user.role === 'SuperAdmin') return children

  // Feature access: only superadmin-enabled paths are reachable
  const enabledPaths = state?.settings?.enabledPaths
  if (Array.isArray(enabledPaths) && enabledPaths.length > 0) {
    const currentPath = location.pathname
    const featureEnabled = enabledPaths.some(p =>
      currentPath === p || currentPath.startsWith(p + '/') || (p === '/' && currentPath === '/')
    )
    if (!featureEnabled) {
      const firstEnabled = enabledPaths.find(p => p !== '/') || enabledPaths[0]
      return <Navigate to={firstEnabled || '/'} replace />
    }
  }
  
  // Admin always has access
  if (user.role === 'Admin') return children
  
  // Check if user's role is in allowed roles
  if (roles && roles.includes(user.role)) return children
  
  // For custom roles, check if current path is in user's permissions
  if (user.permissions && Array.isArray(user.permissions)) {
    const currentPath = location.pathname
    const allowedPaths = user.permissions
      .filter(p => p.visible)
      .map(p => p.path)
    
    // Check if current path matches any allowed permission
    const isAllowed = allowedPaths.some(path => {
      // Exact match
      if (path === currentPath) return true
      // Handle sub-routes (e.g., /sales/new matches /sales)
      if (currentPath.startsWith(path + '/')) return true
      return false
    })
    
    if (isAllowed) return children
    
    // Not authorized, redirect to first allowed page
    const firstAllowed = allowedPaths[0]
    if (firstAllowed) return <Navigate to={firstAllowed} replace />
    
    // Custom role with no permissions — logout
    return <Navigate to="/login" replace />
  }
  
  // Not authorized, redirect to dashboard
  return <Navigate to="/" replace />
}
