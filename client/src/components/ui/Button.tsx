import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold tracking-wide ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-target",
    {
        variants: {
            variant: {
                default: "bg-[#f0ede8] text-black hover:bg-[#e8e4de]",
                primary: "bg-[#c5e063] text-black hover:bg-[#d4ef72]",
                secondary: "border border-white/25 bg-transparent text-white hover:border-white/45",
                outline: "border border-white/20 bg-transparent text-white hover:border-white/50 hover:bg-white/5",
                ghost: "hover:bg-white/5 text-white",
                link: "text-white underline-offset-4 hover:underline",
                blue: "bg-[#6b7cff] text-white hover:bg-[#5a6bf0]",
            },
            size: {
                default: "h-12 px-6 text-sm",
                sm: "h-10 px-4 text-sm",
                md: "h-12 px-6 text-sm",
                lg: "h-14 px-8 text-base",
                icon: "h-12 w-12",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
