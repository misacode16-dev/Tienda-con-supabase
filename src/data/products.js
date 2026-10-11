// src/data/products.js — reemplaza a products.json (mismos datos, ahora desde Supabase)
import { loadCatalog } from "../lib/catalog.mjs";
 
const { products } = await loadCatalog();
export default products;