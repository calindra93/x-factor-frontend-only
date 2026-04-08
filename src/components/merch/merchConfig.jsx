// Merch types with production times, costs, and base profitability
export const MERCH_TYPES = {
  CD: {
    label: "CD",
    icon: "💿",
    productionTime: 3,
    baseCost: 2,
    basePrice: 15,
    profitMargin: 650,
    category: "physical"
  },
  Vinyl: {
    label: "Vinyl",
    icon: "🎙️",
    productionTime: 5,
    baseCost: 8,
    basePrice: 35,
    profitMargin: 337,
    category: "physical"
  },
  Cassette: {
    label: "Cassette",
    icon: "📼",
    productionTime: 2,
    baseCost: 1,
    basePrice: 12,
    profitMargin: 1100,
    category: "physical"
  },
  TShirt: {
    label: "T-Shirt",
    icon: "👕",
    productionTime: 4,
    baseCost: 5,
    basePrice: 25,
    profitMargin: 400,
    category: "apparel"
  },
  Hoodie: {
    label: "Hoodie",
    icon: "🧥",
    productionTime: 5,
    baseCost: 12,
    basePrice: 55,
    profitMargin: 358,
    category: "apparel"
  },
  Snapback: {
    label: "Snapback",
    icon: "🧢",
    productionTime: 3,
    baseCost: 4,
    basePrice: 20,
    profitMargin: 400,
    category: "apparel"
  },
  Beanie: {
    label: "Beanie",
    icon: "🎿",
    productionTime: 3,
    baseCost: 3,
    basePrice: 18,
    profitMargin: 500,
    category: "apparel"
  },
  Sneakers: {
    label: "Sneakers",
    icon: "👟",
    productionTime: 7,
    baseCost: 25,
    basePrice: 95,
    profitMargin: 280,
    category: "footwear"
  },
  Perfume: {
    label: "Perfume",
    icon: "💐",
    productionTime: 6,
    baseCost: 10,
    basePrice: 50,
    profitMargin: 400,
    category: "fragrance"
  },
  Poster: {
    label: "Poster",
    icon: "🖼️",
    productionTime: 2,
    baseCost: 1,
    basePrice: 12,
    profitMargin: 1100,
    category: "physical"
  },
  Mug: {
    label: "Mug",
    icon: "☕",
    productionTime: 3,
    baseCost: 2,
    basePrice: 12,
    profitMargin: 500,
    category: "physical"
  },
  Tote: {
    label: "Tote Bag",
    icon: "👜",
    productionTime: 3,
    baseCost: 3,
    basePrice: 20,
    profitMargin: 566,
    category: "apparel"
  }
};

// Sourcing tiers — drive cost, controversy risk, and fan sentiment
export const SOURCING_TIERS = {
  Ethical: {
    label: "Ethical",
    icon: "🌿",
    costMult: 1.4,       // 40% more expensive to produce
    salesMult: 1.05,     // slight authenticity boost
    riskScore: 0,
    riskLabel: "No Risk",
    riskColor: "#00E38C",
    description: "Sustainably sourced. Higher cost, zero scandal exposure.",
  },
  Standard: {
    label: "Standard",
    icon: "📦",
    costMult: 1.0,
    salesMult: 1.0,
    riskScore: 8,
    riskLabel: "Low Risk",
    riskColor: "#9CA3AF",
    description: "Industry standard supply chain. Balanced cost and risk.",
  },
  Questionable: {
    label: "Questionable",
    icon: "⚠️",
    costMult: 0.65,      // 35% cheaper to produce
    salesMult: 1.0,
    riskScore: 55,
    riskLabel: "Scandal Risk",
    riskColor: "#F6C453",
    description: "Cheap sourcing. Higher margins. Gets worse as you grow.",
  },
};

// Lifecycle defaults by drop type (max active turns before sunset)
export const LIFECYCLE_DEFAULTS = {
  Standard: null,    // no expiry
  Limited: 20,       // 20 turns
  Exclusive: 15,     // 15 turns
};

// Rarity modifiers for merch editions
export const RARITY_MODIFIERS = {
  Standard: {
    label: "Standard",
    saleMod: 1.0,
    priceMod: 1.0,
    description: "Regular edition"
  },
  Limited: {
    label: "Limited",
    saleMod: 0.7,
    priceMod: 1.35,
    description: "Reduced availability, higher demand"
  },
  Exclusive: {
    label: "Exclusive",
    saleMod: 0.4,
    priceMod: 1.8,
    description: "Ultra-rare, premium pricing"
  }
};

export const getEraDemandModifier = (era) => {
  if (!era) return 1.0;
  
  let modifier = 1.0;
  const phaseModifiers = {
    TEASE: 0.8,
    DROP: 1.5,
    SUSTAIN: 1.2,
    FADE: 0.6
  };
  modifier *= phaseModifiers[era.phase] || 1.0;
  
  const momentumBoost = (era.momentum || 0) / 100;
  modifier *= (1 + momentumBoost * 0.5);
  
  const volatilityFactor = (era.volatility_level || 0) / 100;
  modifier *= (1 + volatilityFactor * 0.3);
  
  return Math.max(0.5, Math.min(3, modifier));
};

export const calculateDailySales = (merchItem, era, daysPassed = 1) => {
  const demandMod = getEraDemandModifier(era);
  const baseDaily = 5;
  const scaledDaily = Math.floor(baseDaily * demandMod);
  const variance = Math.floor(scaledDaily * 0.2);
  const actual = scaledDaily + Math.random() * variance - variance / 2;
  
  return Math.max(0, Math.floor(actual * daysPassed));
};

export const calculateProductionCost = (merchType, quantity, era, sourcingTier = 'Standard') => {
  const typeConfig = MERCH_TYPES[merchType];
  if (!typeConfig) return 0;

  const demandMod = getEraDemandModifier(era);
  const costModifier = 1 + (demandMod - 1) * 0.1;
  const sourcingMult = SOURCING_TIERS[sourcingTier]?.costMult ?? 1.0;

  return Math.ceil(typeConfig.baseCost * quantity * costModifier * sourcingMult);
};

export const calculateProjectedRevenue = (merchType, quantity, price, era, daysActive = 30) => {
  const typeConfig = MERCH_TYPES[merchType];
  if (!typeConfig) return 0;
  
  const dailySales = calculateDailySales(
    { quantity, price },
    era,
    daysActive
  );
  
  const unitsSold = Math.min(dailySales, quantity);
  return unitsSold * price;
};

// Calculate restock costs with demand-based increases
export const calculateRestockCost = (merchType, currentCost, quantity, demandLevel = 0) => {
  const typeConfig = MERCH_TYPES[merchType];
  if (!typeConfig) return 0;
  
  // Cost increases by 5% per demand level (1-5)
  const demandMultiplier = 1 + (demandLevel * 0.05);
  
  return Math.ceil(typeConfig.baseCost * quantity * demandMultiplier);
};

// Apply rarity modifier to sales and pricing
export const applyRarityModifier = (baseValue, edition) => {
  const rarity = RARITY_MODIFIERS[edition] || RARITY_MODIFIERS.Standard;
  return Math.floor(baseValue * rarity.saleMod);
};

export const applyRarityPriceModifier = (price, edition) => {
  const rarity = RARITY_MODIFIERS[edition] || RARITY_MODIFIERS.Standard;
  return Math.ceil(price * rarity.priceMod);
};