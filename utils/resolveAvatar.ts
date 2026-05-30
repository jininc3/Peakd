import { ImageSourcePropType } from 'react-native';

const DEFAULT_AVATARS: { [key: string]: any } = {
  '/images/avatar1.png': require('@/assets/images/avatar1.png'),
  '/images/avatar2.png': require('@/assets/images/avatar2.png'),
  '/images/avatar3.png': require('@/assets/images/avatar3.png'),
  '/images/avatar4.png': require('@/assets/images/avatar4.png'),
  '/images/avatar5.png': require('@/assets/images/avatar5.png'),
};

/**
 * Returns true if the avatar is a valid remote URL (starts with http).
 * Returns false for relative paths, empty strings, or undefined.
 */
export function isRemoteAvatar(avatar?: string | null): boolean {
  return !!avatar && avatar.startsWith('http');
}

/**
 * Returns a local image source for default avatars stored as relative paths.
 * Returns null if the avatar is not a known default.
 */
export function getDefaultAvatarSource(avatar?: string | null): ImageSourcePropType | null {
  if (!avatar) return null;
  return DEFAULT_AVATARS[avatar] || null;
}

/**
 * Checks if an avatar has any displayable value (remote URL or default path).
 */
export function hasAvatar(avatar?: string | null): boolean {
  return isRemoteAvatar(avatar) || !!getDefaultAvatarSource(avatar);
}
