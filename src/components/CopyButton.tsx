"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";

/** Copies `text`; the label flips to `copiedLabel` so the guest sees it worked. */
export function CopyButton({
  text, label, copiedLabel = "Copiado", size = "sm", variant = "secondary",
}: {
  text: string;
  label: string;
  copiedLabel?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      label={copied ? copiedLabel : label}
      variant={variant}
      size={size}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    />
  );
}
