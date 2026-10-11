// src/utils/product-images.js
// Normaliza las imágenes de un producto sin importar si `image`/`images`
// vienen como string único o como array (algunos productos tienen varias
// fotos en ángulos distintos, otros solo una).

/**
 * Devuelve la imagen de portada (para tarjetas del catálogo, og:image, schema.org).
 * Si `image` es array, usa la primera que no esté vacía.
 * Si no hay `image` utilizable, cae a la primera de `images`.
 * @param {object} product
 * @returns {string}
 */
export function getCoverImage(product) {
  const { image, images } = product;

  if (Array.isArray(image)) {
    const first = image.find((img) => typeof img === "string" && img.trim() !== "");
    if (first) return first;
  } else if (typeof image === "string" && image.trim() !== "") {
    return image;
  }

  if (Array.isArray(images)) {
    const firstThumb = images.find((img) => typeof img === "string" && img.trim() !== "");
    if (firstThumb) return firstThumb;
  } else if (typeof images === "string" && images.trim() !== "") {
    return images;
  }

  return "";
}

/**
 * Devuelve la galería de la ficha de producto como pares { full, thumb }.
 * - `image` (o su versión array) = foto grande que se muestra en el visor principal.
 * - `images` (o su versión array) = miniatura correspondiente para la fila de thumbnails.
 * Si un producto solo trae uno de los dos, se usa el mismo valor para ambos.
 * Entradas vacías o inválidas ("" , null, undefined) se descartan automáticamente,
 * así que un array con un elemento vacío al final (típico error de copiar/pegar) no rompe nada.
 * @param {object} product
 * @returns {Array<{ full: string, thumb: string }>}
 */
export function getGalleryImages(product) {
  const toList = (value) => {
    if (Array.isArray(value)) return value.filter((v) => typeof v === "string" && v.trim() !== "");
    if (typeof value === "string" && value.trim() !== "") return [value];
    return [];
  };

  const fullList = toList(product.image);
  const thumbList = toList(product.images);

  const length = Math.max(fullList.length, thumbList.length);
  if (length === 0) return [{ full: "", thumb: "" }];

  const gallery = [];
  for (let i = 0; i < length; i++) {
    const full = fullList[i] || thumbList[i];
    const thumb = thumbList[i] || fullList[i];
    gallery.push({ full, thumb });
  }
  return gallery;
}

/**
 * Devuelve solo la lista de imágenes "grandes" (para Product.image en el
 * schema.org, que acepta un array de fotos en distinta calidad/ángulo).
 * @param {object} product
 * @returns {string[]}
 */
export function getAllFullImages(product) {
  return getGalleryImages(product).map((g) => g.full).filter(Boolean);
}