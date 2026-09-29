import { describe, expect, test } from "bun:test";
import { buildSiblingDestinationPath, buildSubfolderDestinationPath, getParentDirectory } from "./desktop";

describe("desktop destination paths", () => {
  test("preserves Linux separators when creating a subfolder destination", () => {
    expect(
      buildSubfolderDestinationPath(
        "/home/servidor/Loja On-line/3-Short Saia/original.jpg",
        "imagens-compactadas",
        "original-compactado.webp"
      )
    ).toBe(
      "/home/servidor/Loja On-line/3-Short Saia/imagens-compactadas/original-compactado.webp"
    );
  });

  test("preserves Windows separators when creating a subfolder destination", () => {
    expect(
      buildSubfolderDestinationPath(
        "C:\\Users\\douglas\\Loja On-line\\produto\\original.jpg",
        "imagens-compactadas",
        "original-compactado.webp"
      )
    ).toBe(
      "C:\\Users\\douglas\\Loja On-line\\produto\\imagens-compactadas\\original-compactado.webp"
    );
  });

  test("uses the source folder for sibling save dialogs", () => {
    expect(buildSiblingDestinationPath("/tmp/original.png", "original-compactado.webp")).toBe(
      "/tmp/original-compactado.webp"
    );
  });
});

describe("getParentDirectory", () => {
  test("returns the folder of a Linux path", () => {
    expect(getParentDirectory("/home/servidor/fotos/imagens-compactadas/a.webp")).toBe(
      "/home/servidor/fotos/imagens-compactadas"
    );
  });

  test("returns the folder of a Windows path", () => {
    expect(getParentDirectory("C:\\Users\\douglas\\a.webp")).toBe("C:\\Users\\douglas");
  });
});
