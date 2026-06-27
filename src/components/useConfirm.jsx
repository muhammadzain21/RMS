import { useState, useCallback } from 'react'
import ConfirmDialog from './ConfirmDialog'

/**
 * Hook to manage confirmation dialogs without blocking the UI
 * Returns a promise that resolves to true (confirmed) or false (cancelled)
 */
export function useConfirm() {
  const [config, setConfig] = useState(null)

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfig({
        title: options.title || 'Confirm',
        message: options.message || 'Are you sure?',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        confirmStyle: options.confirmStyle || 'danger',
        onConfirm: () => {
          setConfig(null)
          resolve(true)
        },
        onCancel: () => {
          setConfig(null)
          resolve(false)
        }
      })
    })
  }, [])

  const ConfirmDialogComponent = config ? (
    <ConfirmDialog
      open={!!config}
      title={config.title}
      message={config.message}
      confirmText={config.confirmText}
      cancelText={config.cancelText}
      confirmStyle={config.confirmStyle}
      onConfirm={config.onConfirm}
      onCancel={config.onCancel}
    />
  ) : null

  return { confirm, ConfirmDialog: ConfirmDialogComponent }
}
