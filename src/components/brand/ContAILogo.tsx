import { cn } from '../../lib/utils';

export const CONTAI_LOGO_FULL = '/brand/contai-logo.png';
export const CONTAI_LOGO_ICON = '/brand/contai-icon.png';

export type ContAILogoVariant = 'full' | 'icon';
export type ContAILogoSize = 'sm' | 'md' | 'lg' | 'hero';

const SIZE_CLASS: Record<ContAILogoVariant, Record<ContAILogoSize, string>> = {
  full: {
    sm: 'h-10 w-auto max-w-[160px]',
    md: 'h-14 w-auto max-w-[220px]',
    lg: 'h-20 w-auto max-w-[280px]',
    hero: 'h-28 sm:h-36 w-auto max-w-[min(100%,360px)]',
  },
  icon: {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    hero: 'h-16 w-16',
  },
};

export type ContAILogoProps = {
  variant?: ContAILogoVariant;
  size?: ContAILogoSize;
  className?: string;
  imgClassName?: string;
};

/** Marca ContAI — logo corporativo o ícono (favicon). */
export function ContAILogo({
  variant = 'full',
  size = 'md',
  className,
  imgClassName,
}: ContAILogoProps) {
  const src = variant === 'icon' ? CONTAI_LOGO_ICON : CONTAI_LOGO_FULL;

  return (
    <div className={cn('flex items-center justify-center shrink-0', className)}>
      <img
        src={src}
        alt="ContAI — Smart Accounting. Zero Surprises."
        className={cn('object-contain select-none', SIZE_CLASS[variant][size], imgClassName)}
        decoding="async"
        draggable={false}
      />
    </div>
  );
}
