export type AvatarOption = {
  name: string;
  src: string;
};

export type AvatarCategory = {
  title: string;
  description: string;
  avatars: AvatarOption[];
};

const AVATAR_BASE_PATH = "/avatars/hitit-football";

function avatar(fileName: string, name: string): AvatarOption {
  return {
    name,
    src: `${AVATAR_BASE_PATH}/${fileName}.webp`,
  };
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  {
    title: "Hitit Hükümdarları",
    description: "Krallar, savaşçılar ve güneş kursu muhafızları",
    avatars: [
      avatar("01-kral", "Büyük Hitit Kralı"),
      avatar("02-kralice", "Hitit Kraliçesi"),
      avatar("03-mizrakli", "Mızraklı Muhafız"),
      avatar("04-muhafiz", "Kraliyet Muhafızı"),
      avatar("05-komutan", "Savaş Arabası Komutanı"),
      avatar("06-sancaktar", "Güneş Kursu Sancaktarı"),
    ],
  },
  {
    title: "Kutsal Hayvanlar",
    description: "Alacahöyük ve Hitit kabartmalarından güçlü simgeler",
    avatars: [
      avatar("07-aslan", "Aslanlı Kapı Muhafızı"),
      avatar("08-geyik", "Kutsal Geyik"),
      avatar("09-boga", "Törensel Boğa"),
      avatar("10-cift-basli-kartal", "Çift Başlı Kartal"),
      avatar("11-sfenks", "Hitit Sfenksi"),
      avatar("12-savas-ati", "Savaş Atı"),
    ],
  },
  {
    title: "Hitit Eserleri",
    description: "Arkeolojik mirasla futbolun birleştiği amblemler",
    avatars: [
      avatar("13-gunes-kursu", "Alacahöyük Güneş Kursu"),
      avatar("14-aslanli-kapi", "Aslanlı Kapı"),
      avatar("15-kartal-zafer", "Zafer Kartalı"),
      avatar("16-geyik-sancak", "Geyik Sancağı"),
      avatar("17-boga-riton", "Boğa Ritonu"),
      avatar("18-kraliyet-muhru", "Kraliyet Mührü"),
    ],
  },
  {
    title: "Stadyum Muhafızları",
    description: "Hitit taş kabartmalarıyla tribün ve saha ruhu",
    avatars: [
      avatar("19-kaleci", "Kaleci Muhafız"),
      avatar("20-forvet", "Hitit Forveti"),
      avatar("21-tribun-davulcusu", "Tribün Davulcusu"),
      avatar("22-hakem-katip", "Hakem Kâtip"),
      avatar("23-kulup-buyugu", "Kulüp Büyüğü"),
      avatar("24-tribun-lideri", "Tribün Lideri"),
    ],
  },
];

export const ALL_AVATARS = AVATAR_CATEGORIES.flatMap(
  (category) => category.avatars,
);

export const REGISTRATION_AVATARS: AvatarOption[] = [
  ALL_AVATARS[0],
  ALL_AVATARS[1],
  ALL_AVATARS[6],
  ALL_AVATARS[7],
  ALL_AVATARS[12],
  ALL_AVATARS[13],
  ALL_AVATARS[18],
  ALL_AVATARS[19],
];

export const DEFAULT_AVATAR = ALL_AVATARS[0].src;

export function isImageAvatar(
  avatarValue: string | null | undefined,
): boolean {
  return (
    typeof avatarValue === "string" &&
    avatarValue.startsWith(`${AVATAR_BASE_PATH}/`)
  );
}
