export function getTargetDimensions(
  width: number,
  height: number,
  preserveOriginalDimensions: boolean,
  maxWidth: number,
  maxHeight: number,
  keepAspectRatio: boolean
) {
  if (preserveOriginalDimensions) {
    return { width, height };
  }

  if (!keepAspectRatio) {
    return {
      width: Math.max(1, Math.min(maxWidth, width)),
      height: Math.max(1, Math.min(maxHeight, height))
    };
  }

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}
