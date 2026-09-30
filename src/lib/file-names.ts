export function numberedFileName(fileName: string, index: number) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? `${fileName.slice(0, dot)}-${index}${fileName.slice(dot)}` : `${fileName}-${index}`;
}
export function uniqueFileName(fileName: string, used: Set<string>) {
  let candidate = fileName;
  let index = 2;
  while (used.has(candidate)) candidate = numberedFileName(fileName, index++);
  used.add(candidate);
  return candidate;
}
