import type { Metadata } from "next";
import { Baskervville, DM_Sans } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const baskervville = Baskervville({ variable: "--font-baskervville", subsets: ["latin"], style: ["normal", "italic"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Casa N&Y · Lista de presentes",
  description: "Lista de presentes do chá de casa nova de Nathália e Yago.",
  // The list is shared only through the invitation link.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme here avoids a flash of the wrong scheme before the Theme provider hydrates.
    <html lang="pt-BR" data-theme="light" className={`${baskervville.variable} ${dmSans.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
