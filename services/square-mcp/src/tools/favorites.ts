import { readFileSync, writeFileSync, existsSync } from "fs";

export interface Favorite {
  url: string;
  default_service?: string;
  notes?: string;
}

export type Favorites = Record<string, Favorite>;

export function loadFavorites(path: string): Favorites {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function saveFavorites(path: string, favorites: Favorites): void {
  writeFileSync(path, JSON.stringify(favorites, null, 2));
}

export function addFavorite(
  favorites: Favorites,
  nickname: string,
  fav: Favorite,
): Favorites {
  return { ...favorites, [nickname]: fav };
}

export function removeFavorite(
  favorites: Favorites,
  nickname: string,
): Favorites {
  const { [nickname]: _, ...rest } = favorites;
  return rest;
}

export function resolveMerchant(favorites: Favorites, merchant: string): string {
  if (merchant.startsWith("http://") || merchant.startsWith("https://")) {
    return merchant;
  }
  const fav = favorites[merchant];
  if (!fav) throw new Error(`Unknown merchant: "${merchant}"`);
  return fav.url;
}
