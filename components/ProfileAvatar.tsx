import Image from "next/image";
import { DEFAULT_AVATAR, isImageAvatar } from "@/lib/avatars";

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
    return (
      <Image
        src={avatarValue}
        alt={alt}
        width={384}
        height={384}
        sizes="(max-width: 640px) 96px, 128px"
        priority={priority}
        draggable={false}
        className={`block shrink-0 object-cover object-center ${className}`}
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
