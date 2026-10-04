import Image from "next/image";

export function UnjotMark({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <span className={`unjot-mark ${className}`.trim()} aria-hidden="true">
      <Image src="/assets/unjot-logo.png" alt="" fill sizes="48px" priority={priority} />
    </span>
  );
}
