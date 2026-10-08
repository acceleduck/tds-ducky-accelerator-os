import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

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
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, style, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      style={{ zIndex: 50, ...style }}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
