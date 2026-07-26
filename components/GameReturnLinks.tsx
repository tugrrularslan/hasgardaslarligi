import Link from "next/link";
import HittiteIcon from "@/components/HittiteIcon";

export default function GameReturnLinks() {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Oyun üst bağlantıları">
      <Link
        href="/games"
        className="hg-secondary hg-icon-label rounded-xl px-4 py-2.5 text-sm font-black"
      >
        <HittiteIcon name="back" size="sm" />
        Oyunlara Dön
      </Link>

      <Link
        href="/"
        className="hg-secondary hg-icon-label rounded-xl px-4 py-2.5 text-sm font-black"
      >
        <HittiteIcon name="home" size="sm" />
        Ana Sayfa
      </Link>
    </div>
  );
}
