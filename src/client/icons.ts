// Google Material Symbols (Rounded) used in the UI. Keep alphabetical: the same list builds the
// Google Fonts subset URL, so only these glyphs are downloaded. Category/preset icons chosen by the
// user come from this list too (see ICON_CHOICES).
export const ICONS = [
  "account_balance", "account_balance_wallet", "add", "add_photo_alternate", "arrow_back", "arrow_downward", "arrow_upward",
  "backspace", "bedtime", "bolt", "calendar_month", "check", "chevron_left", "chevron_right", "close",
  "coffee", "credit_card", "currency_exchange", "delete", "drag_indicator", "edit", "favorite", "flight", "group",
  "health_and_safety", "history", "home", "list_alt", "local_fire_department", "local_grocery_store", "local_taxi",
  "logout", "military_tech", "more_horiz", "movie", "payments", "person", "person_add", "pets", "photo_camera", "receipt",
  "receipt_long", "restaurant", "savings", "school", "settings", "shopping_bag", "smartphone", "sports_esports", "star",
  "swap_horiz", "train",
  "tune", "undo",
] as const;

export type IconName = (typeof ICONS)[number];

/** Icons a user may assign to categories / presets. */
export const ICON_CHOICES: readonly IconName[] = [
  "restaurant", "coffee", "train", "local_taxi", "shopping_bag", "local_grocery_store", "receipt", "home",
  "movie", "sports_esports", "health_and_safety", "pets", "school", "flight", "account_balance_wallet",
  "savings", "more_horiz",
];

/** Icons a user may assign to wallets. */
export const WALLET_ICON_CHOICES: readonly IconName[] = [
  "payments", "account_balance", "credit_card", "account_balance_wallet", "smartphone", "savings",
];

export const iconFontUrl = () =>
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0" +
  `&icon_names=${[...ICONS].sort().join(",")}&display=block`;

export const isIconName = (n: string): n is IconName => (ICONS as readonly string[]).includes(n);
