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
          toast:
            'items-start gap-2.5 rounded-[14px] border border-border bg-white px-4 py-3.5 font-sans text-foreground shadow-[0_12px_40px_rgba(0,0,0,0.1)]',
          title: 'text-sm font-bold leading-snug',
          description: 'text-[13px] leading-snug opacity-90',
          success: 'border-emerald-200 bg-success-soft text-success',
          error: 'border-red-200 bg-danger-soft text-red-700',
          info: 'border-slate-200 bg-slate-50 text-slate-700',
          loading: 'border-border bg-white text-foreground',
          closeButton: 'rounded-lg border-black/10 bg-white/80',
          icon: 'mt-0.5',
        },
      }}
    />
  )
}
