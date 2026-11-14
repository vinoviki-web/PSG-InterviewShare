const MAX_BYTES = 2 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp']

/**
 * Validates and resizes an avatar on the client (spec §9.3): ≤ 2 MB,
 * png/jpeg/webp only, square-cropped to 256px webp. The server repeats the
 * type/size checks via Storage policies; never trust this alone.
 */
export async function prepareAvatar(file, size = 256) {
  if (!TYPES.includes(file.type)) throw new Error('Use a PNG, JPEG or WebP image.')
  if (file.size > MAX_BYTES) throw new Error('Images must be 2 MB or smaller.')
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/webp', 0.86)
}
