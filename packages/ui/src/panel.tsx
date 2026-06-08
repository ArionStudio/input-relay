import * as React from "react";
import { cn } from "./cn";

export function Panel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "group/card rounded-4xl bg-card p-4 text-sm text-card-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10",
        className,
      )}
      data-slot="card"
      {...props}
    />
  );
}

export function PanelHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mb-3 grid auto-rows-min grid-cols-[1fr_auto] items-start gap-1.5",
        className,
      )}
      data-slot="card-header"
      {...props}
    />
  );
}

export function PanelTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("font-heading text-base font-medium", className)}
      data-slot="card-title"
      {...props}
    />
  );
}

export function PanelDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "max-w-2xl text-sm leading-6 text-muted-foreground",
        className,
      )}
      data-slot="card-description"
      {...props}
    />
  );
}
