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
  const [copied, setCopied] = useState<boolean | "failed">(false);
  return (
    <Button
      label={copied === "failed" ? "Não deu, copie à mão" : copied ? copiedLabel : label}
      variant={variant}
      size={size}
      onClick={async () => {
        // Some in-app browsers refuse the clipboard; the text is on screen, so say so instead of failing silently.
        setCopied(await navigator.clipboard.writeText(text).then(() => true, () => "failed" as const));
        setTimeout(() => setCopied(false), 2000);
      }}
    />
  );
}
