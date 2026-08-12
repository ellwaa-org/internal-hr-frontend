import { toast } from 'sonner'
import { errorMessageFromUnknown } from './errors'

export const notify = {
  success(message: string, description?: string) {
    toast.success(message, {
      description,
      duration: 4000,
    })
  },

  error(err: unknown, fallback = 'تعذر إتمام العملية.') {
    toast.error(errorMessageFromUnknown(err, fallback), {
      duration: 5000,
    })
  },

  info(message: string, description?: string) {
    toast.info(message, {
      description,
      duration: 4000,
    })
  },

  loading(message: string) {
    return toast.loading(message)
  },

  dismiss(id?: string | number) {
    toast.dismiss(id)
  },
}
