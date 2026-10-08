import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

/**
 * The z-index below is inline on purpose, and is also present as a `z-50` utility class.
 *
 * Radix renders this content as a statically positioned div inside its own fixed-position
 * wrapper, so a z-index on the content itself paints nothing. Radix lifts one onto that wrapper
 * for us, but it reads the value ONCE, from computed style, in a layout effect as the content
 * mounts. A z-index that only exists in the stylesheet has not been applied yet at that instant,
 * so the wrapper is pinned at `auto` and stays there for the life of the mount: the floating
 * layer then sits below every positioned element on the page, and a sticky header covers the top
 * of any menu opened from inside it. An inline value is readable at mount, so the wrapper gets a
 * real z-index. Measured before and after — see BI-3474.
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, forceMount, style, ...props }, ref) => (
  // forceMount must reach the Portal too: the Portal has its own presence gate and would
  // unmount on close, discarding the Content that was asked to stay mounted.
  <TooltipPrimitive.Portal forceMount={forceMount}>
    <TooltipPrimitive.Content
      forceMount={forceMount}
      ref={ref}
      sideOffset={sideOffset}
      style={{ zIndex: 50, ...style }}
      className={cn(
        "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
