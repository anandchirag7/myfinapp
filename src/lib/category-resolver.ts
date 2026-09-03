/**
 * Pure, deterministic category resolution utilities.
 *
 * Bridges the gap between "AI says Food & Dining" and "user's category tree
 * has a category named Food". No network calls, no side effects.
 */

import { PIPELINE_CATEGORIES } from "./statement-normalize";

const LEGACY_CATEGORY_ALIASES: Record<string, readonly string[]> = {
  "restaurants & cafes": ["Eating Out", "Food & Dining"],
  "food delivery": ["Food & Dining"],
  "cab & auto": ["Auto/Cab", "Transport"],
  "public transport": ["Transport"],
  "parking & tolls": ["Transport"],
  "housing & utilities": ["Housing", "Housing & Rent"],
  "society maintenance": ["Maintenance/Society", "Housing"],
  electricity: ["Bills & Utilities", "Utilities"],
  water: ["Bills & Utilities", "Utilities"],
  "cooking gas": ["Gas", "Bills & Utilities"],
  "mobile & internet": ["Mobile", "Internet", "Communication", "Bills & Utilities"],
  "tv & dth": ["DTH/OTT", "Communication", "Bills & Utilities"],
  "doctor & hospital": ["Doctor", "Health", "Health & Medical"],
  medicines: ["Health", "Health & Medical"],
  "school & college fees": ["Fees", "Education"],
  "tuition & courses": ["Tuition", "Education"],
  "books & supplies": ["Books", "Education"],
  "clothing & footwear": ["Clothing", "Shopping"],
  electronics: ["Shopping"],
  "beauty & personal care": ["Personal Care"],
  "movies & events": ["Entertainment"],
  "streaming services": ["Subscriptions", "Entertainment"],
  "software & apps": ["Subscriptions"],
  flights: ["Travel", "Travel & Vacation"],
  "trains & buses": ["Travel", "Travel & Vacation"],
  "hotels & stay": ["Travel", "Travel & Vacation"],
  gifts: ["Gifting", "Gifts & Donations"],
  "charity & donations": ["Charity/Donation", "Gifts & Donations"],
  "income & property tax": ["Taxes"],
  "bank charges": ["Fees & Charges"],
  "salary & income": ["Salary", "Income"],
  "interest & dividends": ["Interest", "Dividends", "Other Income"],
  "mutual funds & sip": ["SIP", "Investments", "Investments & Savings"],
  "retirement savings": ["PPF", "NPS", "Investments", "Investments & Savings"],
  "cash & atm": ["Transfers"],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CategoryEntry = {
  id: string;
  name: string;
  kind: string;
  parent_id: string | null;
};

export type CategoryIndex = {
  /** Exact lowercase name → id */
  byName: Map<string, string>;
  /** Lowercase name → kind */
  kindByName: Map<string, string>;
  /** Pipeline canonical name → best matching user category id */
  pipelineMap: Map<string, string>;
  /** All user category names (for AI prompt) */
  userNames: string[];
  /** id → name */
  nameById: Map<string, string>;
};

// ---------------------------------------------------------------------------
// Index builder
// ---------------------------------------------------------------------------

/**
 * Build a multi-strategy lookup index from the user's category tree.
 * Called once per import, then reused throughout the pipeline.
 */
export function buildCategoryIndex(categories: CategoryEntry[]): CategoryIndex {
  const byName = new Map<string, string>();
  const kindByName = new Map<string, string>();
  const nameById = new Map<string, string>();

  for (const c of categories) {
    const lower = c.name.toLowerCase().trim();
    byName.set(lower, c.id);
    kindByName.set(lower, c.kind);
    nameById.set(c.id, c.name);
  }

  // Build pipeline → user category mapping (fuzzy)
  const pipelineMap = new Map<string, string>();
  for (const pipelineName of PIPELINE_CATEGORIES) {
    const lower = pipelineName.toLowerCase();

    // 1. Exact match
    if (byName.has(lower)) {
      pipelineMap.set(lower, byName.get(lower)!);
      continue;
    }

    // 2. Contains match: user has "Food" and pipeline has "Food & Dining"
    let best: { id: string; score: number } | null = null;
    for (const c of categories) {
      const cLower = c.name.toLowerCase().trim();
      const score = fuzzyMatchScore(lower, cLower);
      if (score > (best?.score ?? 0.4)) {
        best = { id: c.id, score };
      }
    }
    if (best) {
      pipelineMap.set(lower, best.id);
    }
  }

  return {
    byName,
    kindByName,
    pipelineMap,
    userNames: categories.map((c) => c.name),
    nameById,
  };
}

// ---------------------------------------------------------------------------
// Fuzzy matching helpers
// ---------------------------------------------------------------------------

/**
 * Compute a similarity score between two category names.
 * Returns 0..1 where 1 is exact match.
 */
function fuzzyMatchScore(a: string, b: string): number {
  if (a === b) return 1;

  // One contains the other
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return 0.6 + 0.3 * ratio; // 0.6–0.9
  }

  // Shared words
  const wordsA = new Set(a.split(/[\s&,]+/).filter(Boolean));
  const wordsB = new Set(b.split(/[\s&,]+/).filter(Boolean));
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  const total = Math.max(wordsA.size, wordsB.size);
  if (total === 0) return 0;
  const wordScore = shared / total;
  return wordScore * 0.7; // max 0.7 for word overlap
}

// ---------------------------------------------------------------------------
// Category resolution
// ---------------------------------------------------------------------------

/**
 * Given a category name string (from AI, dictionary, or keyword rules),
 * resolve it to the best matching user category UUID.
 *
 * Strategy priority:
 * 1. Exact name match (case-insensitive)
 * 2. Pipeline canonical → user mapping
 * 3. Fuzzy word-overlap match
 */
export function resolveCategoryId(
  name: string | null | undefined,
  index: CategoryIndex,
): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  if (!lower) return null;

  // 1. Exact match
  const exact = index.byName.get(lower);
  if (exact) return exact;

  // 2. Explicit compatibility with the pre-template category vocabulary.
  for (const alias of LEGACY_CATEGORY_ALIASES[lower] ?? []) {
    const aliasMatch = index.byName.get(alias.toLowerCase());
    if (aliasMatch) return aliasMatch;
  }

  // 3. Pipeline mapping
  const pipeline = index.pipelineMap.get(lower);
  if (pipeline) return pipeline;

  // 4. Fuzzy match across all user categories
  let best: { id: string; score: number } | null = null;
  for (const [catName, catId] of index.byName) {
    const score = fuzzyMatchScore(lower, catName);
    if (score > (best?.score ?? 0.5)) {
      best = { id: catId, score };
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------
// Keyword-based categorization engine (200+ patterns)
// ---------------------------------------------------------------------------

type KeywordRule = {
  words: string[];
  categories: string[];
  type?: "expense" | "income" | "transfer";
};

/**
 * Expanded Indian merchant keyword rules.
 * Each rule: if ANY word matches the pattern/description, try to resolve
 * ANY of the category names (first match wins).
 */
const KEYWORD_RULES: KeywordRule[] = [
  // -- Income --
  {
    words: ["SALARY", "PAYROLL", "WAGES", "BONUS"],
    categories: ["Salary & Income", "Salary", "Income"],
    type: "income",
  },
  {
    words: ["INTEREST", "INT PAID", "INT CREDIT", "DIVIDEND"],
    categories: ["Interest & Dividends", "Other Income", "Income"],
    type: "income",
  },
  {
    words: ["CASHBACK", "REFUND", "REVERSAL", "REIMBURSEMENT"],
    categories: ["Refunds & Reimbursements", "Other Income", "Income"],
    type: "income",
  },
  {
    words: ["RENT RECEIVED", "RENTAL INCOME"],
    categories: ["Rental Income", "Other Income", "Income"],
    type: "income",
  },

  // -- Food & Dining --
  { words: ["COMPASS INDIA FOOD"], categories: ["Restaurants & Cafes", "Food & Dining"] },
  {
    words: ["SWIGGY", "ZOMATO", "FAASOS", "BEHROUZ", "BOX8", "REBEL FOODS", "EAT FIT"],
    categories: ["Food Delivery", "Food & Dining"],
  },
  {
    words: [
      "DOMINOS",
      "MCDONALD",
      "STARBUCKS",
      "KFC",
      "PIZZA HUT",
      "BURGER KING",
      "SUBWAY",
      "TACO BELL",
    ],
    categories: ["Restaurants & Cafes", "Food & Dining"],
  },
  {
    words: ["RESTAURANT", "CAFE", "BAKERY", "DINER", "EATERY", "DHABA", "BIRYANI", "CHAI"],
    categories: ["Restaurants & Cafes", "Food & Dining"],
  },
  {
    words: [
      "CHAAYOS",
      "HALDIRAM",
      "BARBEQUE NATION",
      "CHAI POINT",
      "CCD",
      "BARISTA",
      "WOW MOMO",
      "BASKIN ROBBINS",
    ],
    categories: ["Restaurants & Cafes", "Food & Dining"],
  },

  // -- Groceries --
  {
    words: ["BLINKIT", "INSTAMART", "ZEPTO", "BIGBASKET", "JIOMART", "DMART"],
    categories: ["Groceries", "Food & Dining"],
  },
  {
    words: ["GROCERY", "SUPERMARKET", "MART", "PROVISION", "KIRANA"],
    categories: ["Groceries", "Food & Dining"],
  },
  {
    words: ["AMAZON FRESH", "AMAZON PANTRY", "FLIPKART GROCERY", "LICIOUS", "COUNTRY DELIGHT"],
    categories: ["Groceries"],
  },
  {
    words: ["RELIANCE FRESH", "STAR BAZAAR", "MORE RETAIL", "SPENCER", "NATURE BASKET"],
    categories: ["Groceries"],
  },

  // -- Transport --
  {
    words: ["UBER", "OLA", "RAPIDO", "NAMMA YATRI", "MERU"],
    categories: ["Cab & Auto", "Transport"],
  },
  {
    words: ["METRO", "BMTC", "BEST BUS", "YULU", "BOUNCE"],
    categories: ["Public Transport", "Transport"],
  },
  { words: ["FASTAG", "NHAI", "TOLL", "PARKING"], categories: ["Parking & Tolls", "Transport"] },

  // -- Fuel --
  {
    words: ["FUEL", "PETROL", "DIESEL", "PETROLEUM", "BPCL", "HPCL", "IOCL", "SHELL", "NAYARA"],
    categories: ["Fuel", "Transport"],
  },
  {
    words: ["INDIAN OIL", "HP PETROL", "BHARAT PETROLEUM", "RELIANCE PETROL"],
    categories: ["Fuel", "Transport"],
  },

  // -- Travel --
  {
    words: ["IRCTC", "IRTC", "RAILWAY", "TRAIN", "REDBUS", "ABHIBUS"],
    categories: ["Trains & Buses", "Travel"],
  },
  {
    words: ["MAKEMYTRIP", "GOIBIBO", "CLEARTRIP", "YATRA", "IXIGO", "EASEMYTRIP"],
    categories: ["Travel Services", "Travel"],
  },
  {
    words: [
      "INDIGO",
      "AIR INDIA",
      "VISTARA",
      "SPICEJET",
      "AKASA",
      "AIRASIA",
      "GOAIR",
      "AIRLINE",
      "FLIGHT",
    ],
    categories: ["Flights", "Travel"],
  },
  {
    words: ["OYO", "AIRBNB", "BOOKING COM", "AGODA", "TREEBO", "FABHOTELS", "ZOSTEL", "HOTEL"],
    categories: ["Hotels & Stay", "Travel"],
  },
  { words: ["TAJ HOTELS", "ITC HOTELS", "MARRIOTT", "OBEROI"], categories: ["Travel"] },

  // -- Shopping --
  {
    words: ["AMAZON", "FLIPKART", "MYNTRA", "AJIO", "NYKAA", "MEESHO", "TATA CLIQ", "SNAPDEAL"],
    categories: ["Shopping"],
  },
  { words: ["CROMA", "RELIANCE DIGITAL", "VIJAY SALES"], categories: ["Electronics", "Shopping"] },
  {
    words: [
      "SHOPPERS STOP",
      "LIFESTYLE",
      "WESTSIDE",
      "PANTALOONS",
      "ZARA",
      "UNIQLO",
      "BEWAKOOF",
      "BATA",
    ],
    categories: ["Clothing & Footwear", "Shopping"],
  },
  {
    words: ["IKEA", "PEPPERFRY", "URBAN LADDER", "HOMETOWN"],
    categories: ["Furniture & Appliances", "Home & Kitchen", "Shopping"],
  },
  { words: ["DECATHLON", "TITAN", "TANISHQ"], categories: ["Shopping"] },
  { words: ["LENSKART", "OPTICAL"], categories: ["Dental & Vision", "Shopping"] },
  { words: ["KALYAN JEWELLERS", "MALABAR GOLD", "JEWEL", "GOLD"], categories: ["Shopping"] },

  // -- Bills & Utilities --
  {
    words: [
      "AIRTEL",
      "JIO",
      "VODAFONE",
      "BSNL",
      "MTNL",
      "ACT FIBERNET",
      "HATHWAY",
      "BROADBAND",
      "WIFI",
      "INTERNET",
      "TIKONA",
    ],
    categories: ["Mobile & Internet", "Housing & Utilities"],
  },
  {
    words: [
      "ELECTRICITY",
      "BESCOM",
      "TATA POWER",
      "MSEDCL",
      "KSEB",
      "TANGEDCO",
      "WBSEDCL",
      "CESC",
      "TORRENT POWER",
      "ADANI ELEC",
      "RELIANCE ENERGY",
    ],
    categories: ["Electricity", "Housing & Utilities"],
  },
  {
    words: ["WATER", "BWSSB", "CMWSSB", "JAL BOARD", "HMWSSB"],
    categories: ["Water", "Housing & Utilities"],
  },
  {
    words: ["MAHANAGAR GAS", "IGL", "GAIL GAS", "INDANE GAS", "LPG", "BHARAT GAS", "HP GAS"],
    categories: ["Cooking Gas", "Housing & Utilities"],
  },
  {
    words: ["TATA SKY", "TATA PLAY", "DISH TV", "D2H", "AIRTEL DTH", "DTH"],
    categories: ["TV & DTH", "Housing & Utilities"],
  },

  // -- Housing & Rent --
  {
    words: ["RENT", "NOBROKER", "NESTAWAY", "MAGICBRICKS", "99ACRES", "HOUSING COM"],
    categories: ["Rent", "Housing & Utilities"],
  },
  {
    words: ["MAINTENANCE", "SOCIETY", "MYGATE", "APARTMENTADDA"],
    categories: ["Society Maintenance", "Housing & Utilities"],
  },

  // -- Insurance --
  { words: ["LIC", "HDFCLIFE", "HDFC LIFE", "HDFC ERGO", "HDFCERGO"], categories: ["Insurance"] },
  {
    words: ["ICICI PRUDENTIAL", "ICICIPRU", "SBI LIFE", "MAX LIFE", "TATA AIA", "KOTAK LIFE"],
    categories: ["Insurance"],
  },
  {
    words: ["BAJAJ ALLIANZ", "STAR HEALTH", "POLICYBAZAAR", "ACKO", "DIGIT INSURANCE"],
    categories: ["Insurance"],
  },
  {
    words: ["CARE HEALTH", "NIVA BUPA", "MANIPAL CIGNA", "INSURANCE", "INS PREM"],
    categories: ["Insurance"],
  },

  // -- Investments --
  {
    words: [
      "ZERODHA",
      "UPSTOX",
      "ANGEL ONE",
      "ANGEL BROKING",
      "DHAN",
      "SMALLCASE",
      "5PAISA",
      "INDMONEY",
    ],
    categories: ["Stocks & ETFs", "Investments"],
  },
  {
    words: [
      "GROWW",
      "KUVERA",
      "ET MONEY",
      "PAYTM MONEY",
      "COIN ZERODHA",
      "MUTUAL FUND",
      "SIP",
      "ELSS",
    ],
    categories: ["Mutual Funds & SIP", "Investments"],
  },
  {
    words: [
      "HDFC SECURITIES",
      "ICICI DIRECT",
      "KOTAK SECURITIES",
      "SBI SECURITIES",
      "MOTILAL OSWAL",
      "SHAREKHAN",
    ],
    categories: ["Stocks & ETFs", "Investments"],
  },
  { words: ["NPS", "PPF", "EPF"], categories: ["Retirement Savings", "Investments"] },

  // -- Loans & EMI --
  {
    words: ["OFFUS EMI", "MER EMI", "SMART EMI", "EMI", "LOAN"],
    categories: ["Personal Loan EMI", "Loans & EMI"],
    type: "transfer",
  },
  {
    words: ["CREDIT CARD", "CC PAYMENT", "BPPY CC", "CARD BILL PAYMENT"],
    categories: ["Credit Card Payment", "Transfers"],
    type: "transfer",
  },
  { words: ["CRED"], categories: ["Credit Card Payment", "Transfers"], type: "transfer" },
  {
    words: ["BAJAJ FINSERV", "BAJAJ FINANCE", "TATA CAPITAL", "HDFC LTD"],
    categories: ["Loans & EMI", "Loan"],
  },
  {
    words: ["HOME CREDIT", "ZEST MONEY", "SIMPL", "LAZYPAY", "SLICE", "ONECARD"],
    categories: ["Loans & EMI", "Loan"],
  },

  // -- Health & Medical --
  { words: ["MEDIBUDDY"], categories: ["Doctor & Hospital", "Health & Medical"] },
  {
    words: ["HOSPITAL", "MANIPAL", "PRACTO", "CLINIC", "MAX HOSPITAL", "FORTIS", "NARAYANA HEALTH"],
    categories: ["Doctor & Hospital", "Health & Medical"],
  },
  {
    words: ["PHARMACY", "MEDICAL", "APOLLO PHARMACY", "MEDPLUS", "PHARMEASY", "1MG", "NETMEDS"],
    categories: ["Medicines", "Health & Medical"],
  },
  {
    words: [
      "DR LAL PATH",
      "SRL DIAGNOSTICS",
      "THYROCARE",
      "HEALTHIANS",
      "DIAGNOSTIC",
      "METROPOLIS",
    ],
    categories: ["Diagnostics", "Health & Medical"],
  },
  {
    words: ["CULT FIT", "CULT", "GYM", "FITNESS"],
    categories: ["Health & Medical", "Health", "Personal Care"],
  },

  // -- Education --
  {
    words: ["SCHOOL", "COLLEGE", "SCHOOL FEE", "COLLEGE FEE"],
    categories: ["School & College Fees", "Education"],
  },
  {
    words: ["TUITION", "COURSE", "UDEMY", "COURSERA", "BYJUS", "UNACADEMY"],
    categories: ["Tuition & Courses", "Education"],
  },
  {
    words: ["UPGRAD", "SIMPLILEARN", "GREAT LEARNING", "VEDANTU", "WHITEHAT"],
    categories: ["Education"],
  },
  { words: ["DUOLINGO", "SKILLSHARE", "LINKEDIN LEARNING"], categories: ["Education"] },

  // -- Entertainment --
  {
    words: ["BOOKMYSHOW", "PVR", "INOX", "CINEPOLIS"],
    categories: ["Movies & Events", "Entertainment & Subscriptions"],
  },
  {
    words: [
      "NETFLIX",
      "HOTSTAR",
      "SPOTIFY",
      "YOUTUBE",
      "ZEE5",
      "SONY LIV",
      "JIOCINEMA",
      "VOOT",
      "ALT BALAJI",
      "MX PLAYER",
    ],
    categories: ["Streaming Services", "Entertainment & Subscriptions"],
  },

  // -- Subscriptions --
  {
    words: ["AMAZON PRIME", "PRIME MEMBERSHIP"],
    categories: ["Streaming Services", "Entertainment & Subscriptions"],
  },
  {
    words: ["ADOBE", "CANVA", "NOTION", "ZOOM", "CHATGPT", "OPENAI", "MICROSOFT 365", "GOOGLE ONE"],
    categories: ["Software & Apps", "Entertainment & Subscriptions"],
  },
  {
    words: ["LINKEDIN", "GITHUB", "DROPBOX", "ICLOUD", "GRAMMARLY", "NORDVPN"],
    categories: ["Subscriptions"],
  },

  // -- Personal Care --
  {
    words: ["SALON", "SPA", "BODYCRAFT", "LAKME", "JAWED HABIB", "GREEN TRENDS"],
    categories: ["Beauty & Personal Care", "Shopping"],
  },

  // -- Kids & Family --
  {
    words: ["FIRSTCRY", "MOTHERCARE", "HOPSCOTCH", "KIDSTOPPRESS"],
    categories: ["Kids & Baby", "Shopping"],
  },

  // -- Gifts & Donations --
  {
    words: ["DONATION", "CHARITY", "KETTO", "MILAAP", "GIVE INDIA"],
    categories: ["Charity & Donations"],
  },
  {
    words: ["TEMPLE", "CHURCH", "MOSQUE", "POOJA"],
    categories: ["Festivals & Religious", "Family & Lifestyle"],
  },

  // -- Taxes --
  {
    words: ["INCOME TAX", "TDS", "ADVANCE TAX", "PROPERTY TAX", "PROFESSIONAL TAX", "TAX PAYMENT"],
    categories: ["Income & Property Tax", "Taxes & Fees"],
  },
  { words: ["GST PAYMENT", "GSTN", "CESS"], categories: ["Business Taxes & Fees", "Taxes & Fees"] },
  { words: ["STAMP DUTY", "GOVERNMENT FEE"], categories: ["Government Fees", "Taxes & Fees"] },

  // -- Fees & Charges --
  { words: ["BANK CHARGE", "SERVICE CHARGE"], categories: ["Bank Charges", "Taxes & Fees"] },
  {
    words: [
      "ANNUAL FEE",
      "LATE FEE",
      "PROCESSING FEE",
      "CONVENIENCE FEE",
      "FORECLOSURE",
      "PENALTY",
      "SURCHARGE",
      "OVERDUE",
    ],
    categories: ["Penalties & Processing Fees", "Taxes & Fees"],
  },
  { words: ["RETURN CHARGES"], categories: ["Bank Charges", "Taxes & Fees"] },

  // -- Cash & ATM --
  {
    words: ["ATM", "CASH WITHDRAWAL", "CASH WDL", "ATM WDL", "SELF WITHDRAWAL"],
    categories: ["Cash & ATM", "Transfers"],
  },

  // -- Transfers --
  {
    words: ["NEFT TRANSFER", "IMPS TRANSFER", "RTGS TRANSFER", "SELF TRANSFER"],
    categories: ["Transfers"],
  },
];

const keywordMatcherCache = new Map<string, RegExp>();

function matchesKeyword(haystack: string, word: string): boolean {
  let matcher = keywordMatcherCache.get(word);
  if (!matcher) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    matcher = new RegExp(`(?:^|[^A-Z0-9])${escaped}(?:$|[^A-Z0-9])`);
    keywordMatcherCache.set(word, matcher);
  }
  return matcher.test(haystack);
}

/**
 * Try to categorize a pattern using deterministic keyword rules.
 * Returns the resolved category UUID or null.
 */
export function categorizeByKeywords(
  pattern: string,
  description: string,
  index: CategoryIndex,
): string | null {
  const haystack = `${pattern} ${description}`.toUpperCase();

  for (const rule of KEYWORD_RULES) {
    const matched = rule.words.some((word) => matchesKeyword(haystack, word));
    if (!matched) continue;

    // Try each candidate category name in order
    for (const catName of rule.categories) {
      const id = resolveCategoryId(catName, index);
      if (id) return id;
    }
  }

  return null;
}

/**
 * Infer transaction type from keyword rules.
 * Returns null if no rule matches.
 */
export function inferTypeByKeywords(
  pattern: string,
  description: string,
): "expense" | "income" | "transfer" | null {
  const haystack = `${pattern} ${description}`.toUpperCase();

  for (const rule of KEYWORD_RULES) {
    if (!rule.type) continue;
    if (rule.words.some((word) => matchesKeyword(haystack, word))) {
      return rule.type;
    }
  }

  return null;
}
