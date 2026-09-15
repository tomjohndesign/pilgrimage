'use client'
import * as React from 'react'
import { Switch as Primitive } from '@base-ui/react/switch'
import { cn } from '@/lib/utils'
export function Switch({ className, ...props }: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root {...props} data-slot="switch" className={cn('chrome-switch', className)}><Primitive.Thumb data-slot="switch-thumb" className="chrome-switch-thumb" /></Primitive.Root>
}
