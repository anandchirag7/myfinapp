import type { EnrichmentGoldCase } from "../../lib/merchant-enrichment-evaluation";

const businesses = [
  ["Swiggy", "swiggy.com"],
  ["Zomato", "zomato.com"],
  ["Amazon", "amazon.in"],
  ["Flipkart", "flipkart.com"],
  ["MakeMyTrip", "makemytrip.com"],
  ["BigBasket", "bigbasket.com"],
  ["Zepto", "zeptonow.com"],
  ["Myntra", "myntra.com"],
  ["BookMyShow", "bookmyshow.com"],
  ["Cleartrip", "cleartrip.com"],
  ["Apollo Pharmacy", "apollopharmacy.in"],
  ["Medibuddy", "medibuddy.in"],
  ["Tata AIA Insurance", "tataaia.com"],
  ["HDFC Life Insurance", "hdfclife.com"],
  ["IndMoney Technologies", "indmoney.com"],
  ["Zerodha Broking Ltd", "zerodha.com"],
  ["Uber India", "uber.com"],
  ["Ola Electric Ltd", "olaelectric.com"],
  ["Reliance Retail Ltd", "relianceretail.com"],
  ["Indian Railway Catering Ltd", "irctc.co.in"],
] as const;

export const STATEMENT_RELEASE_D_GOLD: readonly EnrichmentGoldCase[] = [
  ...businesses.map(([candidate, host]) => ({
    candidate,
    kind: "business" as const,
    expectedHost: host,
    results: [{ title: `${candidate} official`, url: `https://${host}/`, snippet: "India" }],
  })),
  {
    candidate: "Chirag Anand",
    kind: "person",
    results: [{ title: "Profile", url: "https://example.com/", snippet: "person" }],
  },
  {
    candidate: "AMAZON UTR 123456789012",
    kind: "business",
    results: [{ title: "Amazon", url: "https://amazon.in/", snippet: "India" }],
  },
];
