"use client";

import Link from "next/link";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import ptBR from "@astryxdesign/core/locales/pt-BR.generated.js";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <InternationalizationProvider locale="pt-BR" messages={{ "pt-BR": ptBR }}>
      <Theme theme={neutralTheme} mode="light">
        <LinkProvider component={Link}>{children}</LinkProvider>
      </Theme>
    </InternationalizationProvider>
  );
}
