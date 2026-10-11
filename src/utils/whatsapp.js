// src/utils/whatsapp.js
// Única fuente de verdad para generar los mensajes/links de WhatsApp.
// Se importa como módulo ES real (no is:inline) desde CartWidget.astro y desde [slug].astro.

export const WHATSAPP_NUMBER = "51960884840"; // sin +, sin espacios

// Dominio real de la tienda. Se usa SIEMPRE este (no window.location.origin)
// para que los links del mensaje no salgan con localhost, www. o una preview.
export const SITE_URL = "https://autoboutiqueolga.com";

function productUrl(slug) {
  return `${SITE_URL}/tienda/${slug}`;
}

/**
 * Mensaje para "Comprar por WhatsApp" en la ficha de un solo producto.
 * @param {{ name: string, price: number, slug: string, quantity?: number, sku?: string }} product
 * @returns {string} URL de wa.me lista para abrir
 */
export function buildSingleProductWhatsAppLink(product) {
  const quantity = Number.isFinite(product.quantity) && product.quantity > 0 ? product.quantity : 1;
  const url = productUrl(product.slug);
  const lineTotal = product.price * quantity;
  const label = quantity > 1 ? `${quantity} productos de ${product.name}` : product.name;

  const lines = [
    "Hola estoy interesado en el siguiente producto:",
    "",
    `*${label}*`,
  ];
  if (product.sku) lines.push(`*SKU:* ${product.sku}`);
  const priceLine = quantity > 1
    ? `*Precio:* S/ ${product.price.toFixed(2)} c/u → S/ ${lineTotal.toFixed(2)}`
    : `*Precio:* S/ ${lineTotal.toFixed(2)}`;
  lines.push(priceLine, `*URL:* ${url}`, "", "Gracias!");

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/**
 * Mensaje para el carrito (uno o varios productos), usado por CartWidget.
 * @param {Array<{name: string, price: number, quantity: number, slug: string, sku?: string}>} items
 * @returns {string} URL de wa.me lista para abrir
 */
export function buildWhatsAppOrderLink(items) {
  if (!items || items.length === 0) return `https://wa.me/${WHATSAPP_NUMBER}`;

  const blocks = items.map((item) => {
    const url = productUrl(item.slug);
    const lineTotal = item.price * item.quantity;

    // "4 productos de Alarma XYZ" en vez de "Alarma XYZ x4" — más fácil de leer
    // cuando el pedido tiene varias unidades del mismo producto.
    const productLabel =
      item.quantity > 1 ? `${item.quantity} productos de ${item.name}` : item.name;

    const lines = [`*${productLabel}*`];
    if (item.sku) lines.push(`*SKU:* ${item.sku}`);
    const priceLine = item.quantity > 1
      ? `*Precio:* S/ ${item.price.toFixed(2)} c/u → S/ ${lineTotal.toFixed(2)}`
      : `*Precio:* S/ ${lineTotal.toFixed(2)}`;
    lines.push(priceLine, `*URL:* ${url}`);
    return lines.join("\n");
  });

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const message = [
    "Hola estoy interesado en los siguientes productos:",
    "",
    blocks.join("\n\n"),
    "",
    `*Total: S/ ${total.toFixed(2)}*`,
    "",
    "Gracias!",
  ].join("\n");

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
