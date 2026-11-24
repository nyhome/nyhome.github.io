import type { Metadata } from "next";
import { Admin } from "@/components/Admin";

export const metadata: Metadata = { title: "Painel · Casa N&Y" };

export default function AdminPage() {
  return <Admin />;
}
