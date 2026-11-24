import { GIFTS, ROOMS } from "@/data/gifts";
import { GiftList } from "@/components/GiftList";
import { Opening } from "@/components/Opening";

export default function Home() {
  return (
    <main>
      <Opening />
      <GiftList rooms={ROOMS} initialGifts={GIFTS} />
      <footer style={{ padding: "40px var(--gutter)", color: "var(--color-text-secondary)", fontSize: "0.9375rem" }}>
        Casa N&amp;Y. Com carinho, Nathália e Yago.
      </footer>
    </main>
  );
}
