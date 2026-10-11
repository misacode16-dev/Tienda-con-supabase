// src/data/categories.js — reemplaza a categories.json (mismos datos, ahora desde Supabase)
import { loadCatalog } from "../lib/catalog.mjs";

const { categories } = await loadCatalog();
export default categories;