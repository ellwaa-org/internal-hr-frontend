import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      dir="rtl"
      position="top-center"
      closeButton
      richColors
      expand={false}
      gap={10}
      toastOptions={{
        classNames: {
          toast: 'hr-toast',
          title: 'hr-toast-title',
          description: 'hr-toast-description',
          success: 'hr-toast-success',
          error: 'hr-toast-error',
          info: 'hr-toast-info',
        },
      }}
    />
  )
}
