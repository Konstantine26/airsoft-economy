export function isImageFile(contentType: string | null, fileName: string) {
  if (contentType) return contentType.startsWith('image/');
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(fileName);
}
