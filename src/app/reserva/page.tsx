import type { Metadata } from "next";
import { Reservation } from "@/components/Reservation";

export const metadata: Metadata = { title: "Sua reserva · Casa N&Y" };

export default function ReservaPage() {
  return <Reservation />;
}
