/** Home, Search and Binders, including the binder Pokédex. No public env toggle. */
export const CORE_COLLECTION_MODE = true;

/** Detail, editing and account-support screens needed by the three enabled areas. */
export const CORE_STACK_ROUTES: readonly string[] = [
  "index",
  "(tabs)",
  "search",
  "card/[id]",
  "set/[id]",
  "pokemon/[id]",
  "binder/new",
  "binder/[id]",
  "binder/add-cards",
  "binder/index",
  "binder-legacy",
  "collection",
  "collection/add-card",
  "(auth)/login",
  "(auth)/callback",
  "(auth)/reset-password",
  "callback",
  "reset-password",
  "auth/callback",
  "auth/reset-password",
  "profile/setup",
  "settings",
  "help",
  "legal",
  "about",
  "--/index"
];

export const CORE_TAB_ROUTES: readonly string[] = ['index', 'search', 'binder', 'pokedex'];
export const CORE_SEARCH_CATEGORIES: readonly string[] = ['all', 'cards', 'sets'];

export function isCoreStackRoute(name: string): boolean {
  return CORE_STACK_ROUTES.includes(name);
}

