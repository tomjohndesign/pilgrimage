'use client'

import * as React from 'react'
import { Dialog as Primitive } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function Dialog({ children, ...props }: Omit<React.ComponentProps<typeof Primitive.Root>, "children"> & { children?: React.ReactNode }) { return <Primitive.Root {...props}>{children}</Primitive.Root> }
const DialogPortal = Primitive.Portal
const DialogTitle = Primitive.Title
const DialogDescription = Primitive.Description
function DialogTrigger({ asChild, children, ...props }: React.ComponentProps<typeof Primitive.Trigger> & { asChild?: boolean }) {
  return <Primitive.Trigger {...props} render={asChild ? children as React.ReactElement : undefined}>{asChild ? undefined : children}</Primitive.Trigger>
}
function DialogClose({ asChild, children, ...props }: React.ComponentProps<typeof Primitive.Close> & { asChild?: boolean }) {
  return <Primitive.Close {...props} render={asChild ? children as React.ReactElement : undefined}>{asChild ? undefined : children}</Primitive.Close>
}
function DialogOverlay({ className, ...props }: React.ComponentProps<typeof Primitive.Backdrop>) {
  return <Primitive.Backdrop className={cn('chrome-dialog-backdrop', className)} {...props} />
}
function DialogContent({ className, children, showCloseButton = true, ...props }: React.ComponentProps<typeof Primitive.Popup> & { showCloseButton?: boolean }) {
  return <DialogPortal><DialogOverlay /><Primitive.Viewport className="chrome-dialog-viewport"><Primitive.Popup className={cn('chrome-dialog', className)} {...props}>
    {children}{showCloseButton && <Primitive.Close className="chrome-dialog-close chrome-icon-button" aria-label="Close"><XIcon size={16} /></Primitive.Close>}
  </Primitive.Popup></Primitive.Viewport></DialogPortal>
}
function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) { return <div className={cn('flex flex-col gap-2', className)} {...props} /> }
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) { return <div className={cn('flex justify-end gap-3', className)} {...props} /> }
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger }
