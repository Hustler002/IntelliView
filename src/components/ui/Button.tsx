import React, { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Reusable Button component with variants matching the IntelliView design language.
 *
 * Variants:
 * - primary: Amber background — for CTAs ("Generate My Interview")
 * - secondary: Navy outline — for secondary actions
 * - danger: Red — for destructive actions
 * - ghost: Transparent — for subtle/inline actions
 */

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-amber-500 text-navy-950 hover:bg-amber-400 active:bg-amber-600 shadow-lg shadow-amber-500/20",
  secondary:
    "bg-transparent border-2 border-navy-400 text-navy-100 hover:border-amber-500 hover:text-amber-500",
  danger:
    "bg-alert/10 border border-alert/30 text-alert hover:bg-alert/20",
  ghost:
    "bg-transparent text-navy-300 hover:text-navy-100 hover:bg-navy-800",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-5 py-2.5 text-sm rounded-xl",
  lg: "px-7 py-3.5 text-base rounded-xl",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`
          inline-flex items-center justify-center gap-2
          font-semibold
          transition-all duration-200 ease-in-out
          disabled:opacity-50 disabled:cursor-not-allowed
          cursor-pointer
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
