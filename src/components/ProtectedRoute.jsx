import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../state/AuthContext.jsx'

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth()
  const location = useLocation()
  
  if (!user) return <Navigate to="/login" replace />
  
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
