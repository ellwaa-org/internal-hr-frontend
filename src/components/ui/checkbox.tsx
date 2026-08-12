import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import type { ComponentProps } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import './checkbox.css'

export function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn('checkbox-root', className)} {...props}>
      <CheckboxPrimitive.Indicator className="checkbox-indicator">
        <Check />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
