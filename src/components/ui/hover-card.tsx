import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import { cn } from "@/lib/utils"

const HoverCard = HoverCardPrimitive.Root

const HoverCardTrigger = HoverCardPrimitive.Trigger

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
const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, forceMount, style, ...props }, ref) => (
  // forceMount must reach the Portal too: the Portal has its own presence gate and would
  // unmount on close, discarding the Content that was asked to stay mounted.
  <HoverCardPrimitive.Portal forceMount={forceMount}>
    <HoverCardPrimitive.Content
      forceMount={forceMount}
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      style={{ zIndex: 50, ...style }}
      className={cn(
        "z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </HoverCardPrimitive.Portal>
))
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

export { HoverCard, HoverCardTrigger, HoverCardContent }
