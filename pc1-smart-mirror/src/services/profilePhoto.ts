const PROFILE_PHOTO_KEY_PREFIX = "smart-mirror.pc1.profilePhoto.";
const PHOTO_SIZE = 360;

function storageKey(profileId: string): string {
  return `${PROFILE_PHOTO_KEY_PREFIX}${profileId}`;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("프로필 사진을 읽지 못했습니다."));
    };
    image.src = url;
  });
}

async function blobToProfileDataUrl(blob: Blob): Promise<string> {
  const image = await loadImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("프로필 사진을 저장하지 못했습니다.");
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL("image/jpeg", 0.78);
}

export function getProfilePhoto(profileId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(storageKey(profileId));
}

export async function saveProfilePhoto(profileId: string, blob: Blob): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const dataUrl = await blobToProfileDataUrl(blob);
    window.localStorage.setItem(storageKey(profileId), dataUrl);
  } catch {
    window.localStorage.removeItem(storageKey(profileId));
  }
}

export function removeProfilePhoto(profileId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(storageKey(profileId));
}
