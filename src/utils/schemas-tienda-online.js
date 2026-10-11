// src/utils/schemas.js
// ⚠️ Sin barra al final en DOMAIN — afecta todos los @id y URLs generados
// VERSIÓN PARA TIENDAS 100% VIRTUALES (sin local físico).

import { getCoverImage, getAllFullImages } from "./product-images.js";

const DOMAIN = "https://autoboutiqueolga.com";

// ============================================================
// Imágenes de marca
//
// - logo:   cuadrado, 512x512 (recomendado por Google para
//           el panel de conocimiento de la organización). osea aparece cuando busca en la lupa el negocio
// - og:     1200x630 (proporción Open Graph). Se usa como
//           imagen de portada en la home, en /tienda, en
//           categorías sin imagen propia y como fallback
//           general. Debe ser LA MISMA que pongas en el
//           <meta property="og:image"> de esas páginas.
// ============================================================
const BRAND_IMAGES = {
  logo: "/logo-schema.png",      // 512x512
  og: "/logo-open-graph.png",          // 1200x630 (home, tienda, categorías, fallback)
};

// ============================================================
// Datos del negocio — TIENDA 100% VIRTUAL (sin local físico)
//
// Aquí NO hay dirección, coordenadas, horario de atención ni mapa:
// declarar un local que no existe es información falsa para Google.
// Cambia estos datos por los de cada cliente.
// ============================================================
const BUSINESS = {
  name: "Autoboutique Olga",
  description:
    "Tienda online especializada en accesorios y repuestos para autos y camionetas en Perú. Vendemos alarmas, autoradios, parlantes, amplificadores, focos LED, cámaras de retroceso, cierre centralizado y sistemas de seguridad vehicular de marcas como JBL, Pioneer, Kenwood, Autorus y Genius. Envíos a todo el Perú.",
  telephone: "+51960884840",
  // email: "[EMAIL]",  // descomentar si hay email

  // OnlineStore = tienda que vende solo por internet (subtipo de Organization).
  type: "OnlineStore",

  // Zona a la que se vende/envía. Puedes sumar departamentos o ciudades.
  areaServed: [{ "@type": "Country", name: "Perú" }],

  sameAs: [
    "https://www.facebook.com/profile.php?id=61563385722004",
    "https://www.tiktok.com/@autoboutiqueolga?is_from_webapp=1&sender_device=pc",
  ],
};


// ============================================================
// Helpers compartidos
// ============================================================

/**
 * Convierte una ruta relativa ("/img/x.webp") en URL absoluta.
 * Devuelve "" si no hay string válido, para no romper el schema.
 */
const toAbsolute = (path) => {
  if (!path || typeof path !== "string") return "";
  return path.startsWith("http") ? path : `${DOMAIN}${path}`;
};

/** Referencia a otra entidad por @id (patrón Google-friendly). */
const ref = (id) => ({ "@id": id });

/**
 * Construye un ImageObject solo si la ruta es válida.
 * `width`/`height` son opcionales: si no se pasan, no se declaran.
 */
const buildImageObject = (path, { width, height } = {}) => {
  const url = toAbsolute(path);
  if (!url) return null;
  return {
    "@type": "ImageObject",
    url,
    ...(width && { width }),
    ...(height && { height }),
  };
};

// ============================================================
// OnlineStore — entidad principal del negocio (100% virtual)
//
// Sin address / geo / openingHoursSpecification / hasMap / priceRange:
// esas propiedades son de negocios con local físico.
// Google recomienda aquí:
//   - logo: el logo del negocio (Google lo usa en el knowledge panel).
//   - NUNCA usar fotos de productos en estos campos.
// ============================================================
export function getOnlineStoreSchema() {
  const logoUrl = toAbsolute(BRAND_IMAGES.logo);

  return {
    "@context": "https://schema.org",
    "@type": BUSINESS.type,
    "@id": `${DOMAIN}/#organization`,
    name: BUSINESS.name,
    description: BUSINESS.description,
    url: DOMAIN,
    telephone: BUSINESS.telephone,
    ...(BUSINESS.email && { email: BUSINESS.email }),

    // Logo del negocio
    ...(logoUrl && {
      logo: {
        "@type": "ImageObject",
        url: logoUrl,
        width: 512,
        height: 512,
      },
    }),

    // Cómo contactar al negocio (al no haber local, es el dato clave)
    contactPoint: {
      "@type": "ContactPoint",
      telephone: BUSINESS.telephone,
      contactType: "customer service",
      areaServed: "PE",
      availableLanguage: "es",
    },

    areaServed: BUSINESS.areaServed,
    sameAs: BUSINESS.sameAs,
    currenciesAccepted: "PEN",
    paymentAccepted: "Cash, Bank Transfer, Yape, Plin",
  };
}

// Alias: Layout.astro sigue importando `getLocalBusinessSchema`, así que
// no hace falta tocarlo. Si prefieres, cambia el import a getOnlineStoreSchema.
export const getLocalBusinessSchema = getOnlineStoreSchema;

// ============================================================
// WebSite — el sitio web como entidad
// (NO lleva imagen propia: WebSite es una entidad abstracta)
// ============================================================
export function getWebSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${DOMAIN}/#website`,
    name: BUSINESS.name,
    url: DOMAIN,
    inLanguage: "es-PE",
    description: "Catálogo online de accesorios y repuestos para autos en Perú. Compra alarmas, autoradios, parlantes, focos LED y sistemas de seguridad para tu carro o camioneta con envío a Lima y provincias.",
    publisher: ref(`${DOMAIN}/#organization`),
  };
}

// ============================================================
// WebPage — Home (/)
//
// primaryImageOfPage = og.jpg (misma que en <meta property="og:image">).
// Si el archivo no existe, omite el campo entero.
// ============================================================
export function getHomePageSchema() {
  const ogImage = buildImageObject(BRAND_IMAGES.og, { width: 1200, height: 630 });

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${DOMAIN}/#webpage`,
    url: DOMAIN,
    name: BUSINESS.name,
    description: "Accesorios y repuestos para autos en Perú: alarmas, autoradios, parlantes, focos LED, cámaras de retroceso y sistemas de seguridad. Envíos a Lima y provincias.",
    inLanguage: "es-PE",
    isPartOf: ref(`${DOMAIN}/#website`),
    about: ref(`${DOMAIN}/#organization`),
    ...(ogImage && { primaryImageOfPage: ogImage }),
  };
}

// ============================================================
// generateProductSchemas — ficha de producto (/tienda/[slug])
//
// Dos casos:
//   - Producto simple: Product (con Offer anidado) + WebPage + Breadcrumb.
//   - Producto con variantes (ej. alarma que solo cambia de modelo/control):
//     ProductGroup + cada variante como Product anidado en `hasVariant`
//     (con su propio Offer) + WebPage + Breadcrumb. Es el patrón que Google
//     documenta para evitar canibalización SEO entre productos casi
//     idénticos: https://developers.google.com/search/docs/appearance/structured-data/product#variants
//     Todas las variantes comparten la MISMA url (`${url}`), porque
//     intencionalmente no existen páginas separadas por variante.
// ============================================================
export function generateProductSchemas(product, categoryName) {
  const {
    slug,
    name,
    productDescription,
    price,
    stock,
    sku,
    category,
    marca,
    variants,
  } = product;

  const url = `${DOMAIN}/tienda/${slug}`;
  const hasVariants = Array.isArray(variants) && variants.length > 1;

  // Imágenes del producto "padre" (que reflejan la primera variante cuando
  // hay variantes — ver products.json). Se usan para el WebPage, igual en
  // ambos casos.
  const cover = getCoverImage(product);
  const fullImage = toAbsolute(cover);

  // Imágenes full-resolution del producto (campo "image", no las miniaturas).
// Se usan tanto para el Product/ProductGroup como para el Offer.
const productImages = getAllFullImages(product).map(toAbsolute).filter(Boolean);

  const normalizePrice = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return n.toFixed(2);
  };

  let productOrGroupSchema;

  if (hasVariants) {
    const groupId = `${url}/#productgroup`;

    // Cada variante = un Product con su propio sku/imágenes/precio, anidado
    // dentro de hasVariant (patrón exacto documentado por Google, no como
    // scripts JSON-LD separados).
    const variantProducts = variants.map((v) => {
      const variantImages = getAllFullImages(v).map(toAbsolute).filter(Boolean);
      const variantPrice = normalizePrice(v.price ?? price);

      return {
        "@type": "Product",
        "@id": `${url}/#product-${v.id}`,
        name: `${name} - ${v.label}`,
        sku: v.sku,
        ...(variantImages.length > 0 && { image: variantImages }),
        offers: {
          "@type": "Offer",
          "@id": `${url}/#offer-${v.id}`,
          url,
          priceCurrency: "PEN",
          ...(variantPrice !== null && { price: variantPrice }),
          availability: stock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: ref(`${DOMAIN}/#organization`),
        },
      };
    });

    productOrGroupSchema = {
      "@context": "https://schema.org",
      "@type": "ProductGroup",
      "@id": groupId,
      name,
      description: productDescription,
      url,
      productGroupID: slug,
      // "sku" porque es lo que objetivamente cambia entre variantes en este
      // catálogo (modelo/control). Si en el futuro agrupas por color o
      // talla en vez de modelo, cambia esto a ["color"] o ["size"].
      variesBy: ["sku"],
      brand: { "@type": "Brand", name: marca || "Genérico" },
      ...(category && { category: categoryName || category }),
      ...(productImages.length > 0 && { image: productImages }),
      hasVariant: variantProducts,
    };
  } else {
    // ----- Producto simple: Product + Offer, como antes -----
    const normalizedPrice = normalizePrice(price);

    productOrGroupSchema = {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${url}/#product`,
      name,
      description: productDescription,
      ...(productImages.length > 0 && { image: productImages }),
            ...(sku && { sku }),
      brand: { "@type": "Brand", name: marca || "Genérico" },
      ...(category && { category: categoryName || category }),
      offers: {
        "@type": "Offer",
        "@id": `${url}/#offer`,
        url,
        priceCurrency: "PEN",
        ...(normalizedPrice !== null && { price: normalizedPrice }),
        availability: stock
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: ref(`${DOMAIN}/#organization`),
      },
    };
  }

  // ----- WebPage -----
  // primaryImageOfPage = foto GRANDE del producto (o de la primera variante).
  // NO declaramos width/height: cada proveedor sube imágenes con
  // dimensiones distintas y no las conocemos a priori.
  const primaryImage = fullImage
    ? { "@type": "ImageObject", url: fullImage }
    : null;

  const webpageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}/#webpage`,
    url,
    name,
    description: productDescription,
    inLanguage: "es-PE",
    isPartOf: ref(`${DOMAIN}/#website`),
    about: ref(hasVariants ? `${url}/#productgroup` : `${url}/#product`),
    ...(primaryImage && { primaryImageOfPage: primaryImage }),
    breadcrumb: ref(`${url}/#breadcrumb`),
  };

  // ----- Breadcrumb -----
  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: "Inicio", item: DOMAIN },
    { "@type": "ListItem", position: 2, name: "Tienda", item: `${DOMAIN}/tienda` },
  ];
  if (category && categoryName) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 3,
      name: categoryName,
      item: `${DOMAIN}/categoria/${category}`,
    });
  }
  breadcrumbItems.push({
    "@type": "ListItem",
    position: breadcrumbItems.length + 1,
    name,
    item: url,
  });

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${url}/#breadcrumb`,
    itemListElement: breadcrumbItems,
  };

  return [productOrGroupSchema, webpageSchema, breadcrumbSchema];
}

// ============================================================
// generateCategorySchemas — listado de categoría (/categoria/[slug])
// Genera: ItemList + CollectionPage + Breadcrumb
// ============================================================
export function generateCategorySchemas(category, categoryProducts) {
  const { slug, name, description } = category;
  const url = `${DOMAIN}/categoria/${slug}`;

  // Imagen de portada para la categoría:
  //   - si la categoría trae `image` propia, se usa
  //   - si no, se usa la imagen de marca compartida (og.jpg)
  const primaryImage = buildImageObject(category.image || BRAND_IMAGES.og, {
    width: 1200,
    height: 630,
  });

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${url}/#itemlist`,
    name: `Productos en ${name}`,
    itemListElement: categoryProducts.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${DOMAIN}/tienda/${p.slug}`,
      ...(p.name && { name: p.name }),
    })),
  };

  const webpageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}/#webpage`,
    url,
    name,
    description: description || `Encuentra ${name} al mejor precio.`,
    inLanguage: "es-PE",
    isPartOf: ref(`${DOMAIN}/#website`),
    mainEntity: ref(`${url}/#itemlist`),
    ...(primaryImage && { primaryImageOfPage: primaryImage }),
    breadcrumb: ref(`${url}/#breadcrumb`),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${url}/#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: DOMAIN },
      { "@type": "ListItem", position: 2, name: "Tienda", item: `${DOMAIN}/tienda` },
      { "@type": "ListItem", position: 3, name, item: url },
    ],
  };

  return [itemListSchema, webpageSchema, breadcrumbSchema];
}

// ============================================================
// generateStoreSchemas — listado general (/tienda)
// Genera: CollectionPage + Breadcrumb (sin ItemList completo,
// porque el catálogo entero puede ser grande; Google ya lo indexa
// vía los Product de cada ficha individual).
// ============================================================
export function generateStoreSchemas() {
  const url = `${DOMAIN}/tienda`;

  // Misma imagen de marca que la home.
  // Recuerda usar la MISMA URL en <meta property="og:image"> de esta página.
  const primaryImage = buildImageObject(BRAND_IMAGES.og, {
    width: 1200,
    height: 630,
  });

  const webpageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}/#webpage`,
    url,
    name: "Tienda",
    description: "Explora nuestro catálogo completo de accesorios y repuestos para autos: alarmas, audio, focos LED, cámaras de retroceso y más. Precios en soles y envío a todo el Perú.",
    inLanguage: "es-PE",
    isPartOf: ref(`${DOMAIN}/#website`),
    ...(primaryImage && { primaryImageOfPage: primaryImage }),
    breadcrumb: ref(`${url}/#breadcrumb`),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${url}/#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: DOMAIN },
      { "@type": "ListItem", position: 2, name: "Tienda", item: url },
    ],
  };

  return [webpageSchema, breadcrumbSchema];
}