export function isImageFile(contentType: string | null, fileName: string) {
  if (contentType) return contentType.startsWith('image/');
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(fileName);
}

export function isAudioFile(contentType: string | null, fileName: string) {
  if (contentType) return contentType.startsWith('audio/');
  return /\.(m4a|mp3|wav|aac|ogg|caf)$/i.test(fileName);
}
