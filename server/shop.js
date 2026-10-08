/* ============================================================
   BLOXBET — COSMETICS SHOP
   All items are permanent one-time purchases. Cosmetic only.
   ============================================================ */

const CATEGORIES = {
  name_color:     'Name Color',
  avatar_ring:    'Avatar Ring',
  profile_banner: 'Profile Banner',
  chat_badge:     'Chat Badge'
};

const ITEMS = [
  // ---- Name colors ----
  { id: 'nc_cyan',    category: 'name_color',     name: 'Cyan',      price: 500,  value: '#00d4ff', preview: 'Cyan' },
  { id: 'nc_purple',  category: 'name_color',     name: 'Purple',    price: 500,  value: '#a855f7', preview: 'Purple' },
  { id: 'nc_gold',    category: 'name_color',     name: 'Gold',      price: 1000, value: '#fbbf24', preview: 'Gold' },
  { id: 'nc_red',     category: 'name_color',     name: 'Red',       price: 1000, value: '#ef4444', preview: 'Red' },
  { id: 'nc_green',   category: 'name_color',     name: 'Green',     price: 1000, value: '#22c55e', preview: 'Green' },

  // ---- Avatar rings ----
  { id: 'ar_bronze',  category: 'avatar_ring',    name: 'Bronze Ring',    price: 1500, value: '#b45309', preview: 'Bronze' },
  { id: 'ar_silver',  category: 'avatar_ring',    name: 'Silver Ring',    price: 2500, value: '#cbd5e1', preview: 'Silver' },
  { id: 'ar_gold',    category: 'avatar_ring',    name: 'Gold Ring',      price: 4000, value: '#fbbf24', preview: 'Gold' },
  { id: 'ar_prism',   category: 'avatar_ring',    name: 'Prismatic Ring', price: 5000, value: 'linear',  preview: 'Prismatic' },

  // ---- Profile banners ----
  { id: 'pb_grid',    category: 'profile_banner', name: 'Grid',      price: 2000, value: 'banner-grid',    preview: 'Grid' },
  { id: 'pb_aurora',  category: 'profile_banner', name: 'Aurora',    price: 3500, value: 'banner-aurora',  preview: 'Aurora' },
  { id: 'pb_ember',   category: 'profile_banner', name: 'Ember',     price: 5000, value: 'banner-ember',   preview: 'Ember' },
  { id: 'pb_void',    category: 'profile_banner', name: 'Deep Void', price: 8000, value: 'banner-void',    preview: 'Void' },

  // ---- Chat badges ----
  { id: 'cb_og',      category: 'chat_badge',     name: 'OG',        price: 1000, value: 'OG',     preview: 'OG' },
  { id: 'cb_whale',   category: 'chat_badge',     name: 'Whale',     price: 2500, value: 'WHALE',  preview: 'Whale' },
  { id: 'cb_luck',    category: 'chat_badge',     name: 'Lucky',     price: 4000, value: 'LUCKY',  preview: 'Lucky' }
];

function getItem(id){
  return ITEMS.find(i => i.id === id) || null;
}

function itemsByCategory(cat){
  return ITEMS.filter(i => i.category === cat);
}

module.exports = {
  CATEGORIES,
  ITEMS,
  getItem,
  itemsByCategory
};