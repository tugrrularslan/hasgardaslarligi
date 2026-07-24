import Image from "next/image";
import { DEFAULT_AVATAR, isImageAvatar } from "@/lib/avatars";

const AVATAR_ASSET_VERSION = "20260725";

type ProfileAvatarProps = {
  avatar?: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
};

export default function ProfileAvatar({
  avatar,
  alt,
  className = "",
  priority = false,
}: ProfileAvatarProps) {
  const avatarValue =
    typeof avatar === "string" && avatar.trim() ? avatar : DEFAULT_AVATAR;

  if (isImageAvatar(avatarValue)) {
    const separator = avatarValue.includes("?") ? "&" : "?";
    const avatarSrc = `${avatarValue}${separator}v=${AVATAR_ASSET_VERSION}`;

    return (
      <Image
        src={avatarSrc}
        alt={alt}
        width={384}
        height={384}
        unoptimized
        priority={priority}
        draggable={false}
        className={`block shrink-0 object-contain object-center ${className}`}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={alt}
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
    >
      {avatarValue}
    </span>
  );
}
