import { clsx } from 'clsx';

interface PageHeaderProps {
  label?: string;
  title: string;
  description?: React.ReactNode;
  className?: string;
  align?: 'left' | 'center';
}

export function PageHeader({ 
  label, 
  title, 
  description, 
  className,
  align = 'left' 
}: PageHeaderProps) {
  return (
    <header className={clsx("mb-16 max-w-4xl", align === 'center' && "mx-auto text-center", className)}>
      {label && (
        <span className="text-on-tertiary-container font-headline text-[10px] uppercase tracking-[0.2em] font-bold mb-4 block">
          {label}
        </span>
      )}
      <h1 className="font-headline text-5xl md:text-7xl font-extrabold tracking-tighter text-primary mb-6 leading-[1.1]">
        {title}
      </h1>
      {description && (
        <div className={clsx(
          "text-on-surface-variant leading-relaxed max-w-2xl text-lg opacity-90",
          align === 'left' && "pl-11"
        )}>
          {description}
        </div>
      )}
    </header>
  );
}
