-- =============================================================================
-- Phase 1: Auto-Categorization — Pattern-Level Categories + Auto-Pilot
-- =============================================================================

-- 1. payee_pattern_categories: hybrid global + household-scoped
--    household_id IS NULL  → global row (common merchants, shared)
--    household_id = X      → household-specific override
CREATE TABLE public.payee_pattern_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
  payee_id UUID REFERENCES public.memorized_payees(id) ON DELETE CASCADE,
  normalized_pattern TEXT NOT NULL,
  sample_description TEXT,
  category_name TEXT,               -- category name (for global rows without UUID)
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  source TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'ai' | 'keyword' | 'learned' | 'seed'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Global rows: one row per pattern globally (household_id IS NULL)
-- Household rows: one row per household + pattern combination
CREATE UNIQUE INDEX idx_ppc_global_pattern
  ON public.payee_pattern_categories (normalized_pattern) WHERE household_id IS NULL;
CREATE UNIQUE INDEX idx_ppc_household_pattern
  ON public.payee_pattern_categories (household_id, normalized_pattern) WHERE household_id IS NOT NULL;
-- Lookup by payee
CREATE INDEX idx_ppc_payee ON public.payee_pattern_categories (payee_id) WHERE payee_id IS NOT NULL;
-- Fast pattern lookups
CREATE INDEX idx_ppc_pattern ON public.payee_pattern_categories (normalized_pattern);

-- RLS: global rows readable by all authenticated; household rows scoped
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payee_pattern_categories TO authenticated;
GRANT ALL ON public.payee_pattern_categories TO service_role;
ALTER TABLE public.payee_pattern_categories ENABLE ROW LEVEL SECURITY;

-- Read: can read global rows + own household rows
CREATE POLICY "read_pattern_categories" ON public.payee_pattern_categories
  FOR SELECT TO authenticated
  USING (
    household_id IS NULL
    OR public.has_household_access(household_id)
  );

-- Write: can only write to own household rows
CREATE POLICY "write_pattern_categories" ON public.payee_pattern_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    household_id IS NOT NULL
    AND public.has_household_access(household_id)
  );

CREATE POLICY "update_pattern_categories" ON public.payee_pattern_categories
  FOR UPDATE TO authenticated
  USING (
    household_id IS NOT NULL
    AND public.has_household_access(household_id)
  )
  WITH CHECK (
    household_id IS NOT NULL
    AND public.has_household_access(household_id)
  );

CREATE POLICY "delete_pattern_categories" ON public.payee_pattern_categories
  FOR DELETE TO authenticated
  USING (
    household_id IS NOT NULL
    AND public.has_household_access(household_id)
  );

CREATE TRIGGER trg_ppc_updated_at BEFORE UPDATE ON public.payee_pattern_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 2. Auto-pilot threshold on profiles (per-user, default 80%)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_approve_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.80;


-- 3. Backfill global rows from global_merchant_dictionary
--    (these become global pattern→category_name mappings)
INSERT INTO public.payee_pattern_categories
  (household_id, normalized_pattern, category_name, confidence, source)
SELECT
  NULL,
  gmd.normalized_pattern,
  gmd.suggested_category,
  CASE gmd.confidence_source
    WHEN 'seed' THEN 0.90
    WHEN 'user_confirmed' THEN 0.95
    WHEN 'ai_classified' THEN 0.70
    ELSE 0.50
  END,
  CASE gmd.confidence_source
    WHEN 'seed' THEN 'seed'
    WHEN 'user_confirmed' THEN 'learned'
    WHEN 'ai_classified' THEN 'ai'
    ELSE 'ai'
  END
FROM public.global_merchant_dictionary gmd
WHERE gmd.suggested_category IS NOT NULL
ON CONFLICT DO NOTHING;


-- 4. Expanded merchant seed data (200+ Indian merchants)
--    Insert into BOTH global_merchant_dictionary and payee_pattern_categories (global)
INSERT INTO public.global_merchant_dictionary
  (normalized_pattern, canonical_payee_name, suggested_category, confidence_source)
VALUES
  -- ===== Food & Dining =====
  ('BURGER KING', 'Burger King', 'Food & Dining', 'seed'),
  ('PIZZA HUT', 'Pizza Hut', 'Food & Dining', 'seed'),
  ('SUBWAY', 'Subway', 'Food & Dining', 'seed'),
  ('TACO BELL', 'Taco Bell', 'Food & Dining', 'seed'),
  ('CHAAYOS', 'Chaayos', 'Food & Dining', 'seed'),
  ('HALDIRAM', 'Haldirams', 'Food & Dining', 'seed'),
  ('BARBEQUE NATION', 'Barbeque Nation', 'Food & Dining', 'seed'),
  ('CHAI POINT', 'Chai Point', 'Food & Dining', 'seed'),
  ('FAASOS', 'Faasos', 'Food & Dining', 'seed'),
  ('BEHROUZ', 'Behrouz Biryani', 'Food & Dining', 'seed'),
  ('BOX8', 'Box8', 'Food & Dining', 'seed'),
  ('WOW MOMO', 'Wow Momo', 'Food & Dining', 'seed'),
  ('CCD', 'Cafe Coffee Day', 'Food & Dining', 'seed'),
  ('CAFE COFFEE DAY', 'Cafe Coffee Day', 'Food & Dining', 'seed'),
  ('BARISTA', 'Barista', 'Food & Dining', 'seed'),
  ('BASKIN ROBBINS', 'Baskin Robbins', 'Food & Dining', 'seed'),
  ('REBEL FOODS', 'Rebel Foods', 'Food & Dining', 'seed'),
  ('EAT FIT', 'EatFit', 'Food & Dining', 'seed'),
  ('MAGICPIN', 'Magicpin', 'Food & Dining', 'seed'),

  -- ===== Groceries =====
  ('JIOMART', 'JioMart', 'Groceries', 'seed'),
  ('AMAZON FRESH', 'Amazon Fresh', 'Groceries', 'seed'),
  ('AMAZON PANTRY', 'Amazon Pantry', 'Groceries', 'seed'),
  ('NATURE BASKET', 'Natures Basket', 'Groceries', 'seed'),
  ('STAR BAZAAR', 'Star Bazaar', 'Groceries', 'seed'),
  ('MORE RETAIL', 'More Retail', 'Groceries', 'seed'),
  ('SPENCER', 'Spencers', 'Groceries', 'seed'),
  ('RELIANCE FRESH', 'Reliance Fresh', 'Groceries', 'seed'),
  ('METRO CASH', 'Metro Cash & Carry', 'Groceries', 'seed'),
  ('LICIOUS', 'Licious', 'Groceries', 'seed'),
  ('FRESHMENU', 'FreshMenu', 'Groceries', 'seed'),
  ('MILKBASKET', 'Milkbasket', 'Groceries', 'seed'),
  ('COUNTRY DELIGHT', 'Country Delight', 'Groceries', 'seed'),
  ('SUPR DAILY', 'Supr Daily', 'Groceries', 'seed'),
  ('FLIPKART GROCERY', 'Flipkart Grocery', 'Groceries', 'seed'),

  -- ===== Transport =====
  ('UBER AUTO', 'Uber Auto', 'Transport', 'seed'),
  ('UBER MOTO', 'Uber Moto', 'Transport', 'seed'),
  ('OLA AUTO', 'Ola Auto', 'Transport', 'seed'),
  ('NAMMA YATRI', 'Namma Yatri', 'Transport', 'seed'),
  ('MERU CABS', 'Meru Cabs', 'Transport', 'seed'),
  ('FASTAG', 'FASTag', 'Transport', 'seed'),
  ('NHAI FASTAG', 'NHAI FASTag', 'Transport', 'seed'),
  ('METRO SMART CARD', 'Metro Smart Card', 'Transport', 'seed'),
  ('BMTC', 'BMTC', 'Transport', 'seed'),
  ('BEST BUS', 'BEST Bus', 'Transport', 'seed'),
  ('DELHI METRO', 'Delhi Metro', 'Transport', 'seed'),
  ('NAMMA METRO', 'Namma Metro', 'Transport', 'seed'),
  ('CHENNAI METRO', 'Chennai Metro', 'Transport', 'seed'),
  ('PARKING', 'Parking', 'Transport', 'seed'),
  ('TOLL PLAZA', 'Toll Plaza', 'Transport', 'seed'),
  ('YULU', 'Yulu', 'Transport', 'seed'),
  ('BOUNCE', 'Bounce', 'Transport', 'seed'),

  -- ===== Fuel =====
  ('SHELL', 'Shell', 'Fuel', 'seed'),
  ('RELIANCE PETROL', 'Reliance Petrol', 'Fuel', 'seed'),
  ('NAYARA', 'Nayara', 'Fuel', 'seed'),
  ('SERVO', 'Servo', 'Fuel', 'seed'),
  ('BPCL', 'BPCL', 'Fuel', 'seed'),
  ('HPCL', 'HPCL', 'Fuel', 'seed'),
  ('IOCL', 'IOCL', 'Fuel', 'seed'),

  -- ===== Travel =====
  ('CLEARTRIP', 'Cleartrip', 'Travel', 'seed'),
  ('YATRA', 'Yatra', 'Travel', 'seed'),
  ('ABHIBUS', 'AbhiBus', 'Travel', 'seed'),
  ('IXIGO', 'ixigo', 'Travel', 'seed'),
  ('AIR INDIA', 'Air India', 'Travel', 'seed'),
  ('VISTARA', 'Vistara', 'Travel', 'seed'),
  ('SPICEJET', 'SpiceJet', 'Travel', 'seed'),
  ('AKASA AIR', 'Akasa Air', 'Travel', 'seed'),
  ('AIRASIA', 'AirAsia', 'Travel', 'seed'),
  ('GOAIR', 'Go First', 'Travel', 'seed'),
  ('EASEMYTRIP', 'EaseMyTrip', 'Travel', 'seed'),
  ('AGODA', 'Agoda', 'Travel', 'seed'),
  ('BOOKING COM', 'Booking.com', 'Travel', 'seed'),
  ('AIRBNB', 'Airbnb', 'Travel', 'seed'),
  ('TREEBO', 'Treebo', 'Travel', 'seed'),
  ('FABHOTELS', 'FabHotels', 'Travel', 'seed'),
  ('ZOSTEL', 'Zostel', 'Travel', 'seed'),
  ('TAJ HOTELS', 'Taj Hotels', 'Travel', 'seed'),
  ('ITC HOTELS', 'ITC Hotels', 'Travel', 'seed'),
  ('MARRIOTT', 'Marriott', 'Travel', 'seed'),

  -- ===== Shopping =====
  ('CROMA', 'Croma', 'Shopping', 'seed'),
  ('RELIANCE DIGITAL', 'Reliance Digital', 'Shopping', 'seed'),
  ('VIJAY SALES', 'Vijay Sales', 'Shopping', 'seed'),
  ('SHOPPERS STOP', 'Shoppers Stop', 'Shopping', 'seed'),
  ('LIFESTYLE', 'Lifestyle', 'Shopping', 'seed'),
  ('WESTSIDE', 'Westside', 'Shopping', 'seed'),
  ('ZARA', 'Zara', 'Shopping', 'seed'),
  ('H M', 'H&M', 'Shopping', 'seed'),
  ('UNIQLO', 'Uniqlo', 'Shopping', 'seed'),
  ('MARKS SPENCER', 'Marks & Spencer', 'Shopping', 'seed'),
  ('TATA CLIQ', 'Tata CLiQ', 'Shopping', 'seed'),
  ('SNAPDEAL', 'Snapdeal', 'Shopping', 'seed'),
  ('LENSKART', 'Lenskart', 'Shopping', 'seed'),
  ('FIRST CRY', 'FirstCry', 'Shopping', 'seed'),
  ('PEPPERFRY', 'Pepperfry', 'Shopping', 'seed'),
  ('CHUMBAK', 'Chumbak', 'Shopping', 'seed'),
  ('BEWAKOOF', 'Bewakoof', 'Shopping', 'seed'),
  ('PANTALOONS', 'Pantaloons', 'Shopping', 'seed'),
  ('BATA', 'Bata', 'Shopping', 'seed'),
  ('TITAN', 'Titan', 'Shopping', 'seed'),
  ('TANISHQ', 'Tanishq', 'Shopping', 'seed'),
  ('KALYAN JEWELLERS', 'Kalyan Jewellers', 'Shopping', 'seed'),
  ('MALABAR GOLD', 'Malabar Gold', 'Shopping', 'seed'),

  -- ===== Bills & Utilities =====
  ('ACT FIBERNET', 'ACT Fibernet', 'Bills & Utilities', 'seed'),
  ('HATHWAY', 'Hathway', 'Bills & Utilities', 'seed'),
  ('TIKONA', 'Tikona', 'Bills & Utilities', 'seed'),
  ('TATA SKY', 'Tata Play', 'Bills & Utilities', 'seed'),
  ('TATA PLAY', 'Tata Play', 'Bills & Utilities', 'seed'),
  ('DISH TV', 'Dish TV', 'Bills & Utilities', 'seed'),
  ('D2H', 'D2H', 'Bills & Utilities', 'seed'),
  ('AIRTEL DTH', 'Airtel DTH', 'Bills & Utilities', 'seed'),
  ('MTNL', 'MTNL', 'Bills & Utilities', 'seed'),
  ('MAHANAGAR GAS', 'Mahanagar Gas', 'Bills & Utilities', 'seed'),
  ('IGL', 'IGL', 'Bills & Utilities', 'seed'),
  ('GAIL GAS', 'GAIL Gas', 'Bills & Utilities', 'seed'),
  ('MSEDCL', 'MSEDCL', 'Bills & Utilities', 'seed'),
  ('KSEB', 'KSEB', 'Bills & Utilities', 'seed'),
  ('TANGEDCO', 'TANGEDCO', 'Bills & Utilities', 'seed'),
  ('WBSEDCL', 'WBSEDCL', 'Bills & Utilities', 'seed'),
  ('TORRENT POWER', 'Torrent Power', 'Bills & Utilities', 'seed'),
  ('CESC', 'CESC', 'Bills & Utilities', 'seed'),
  ('RELIANCE ENERGY', 'Reliance Energy', 'Bills & Utilities', 'seed'),
  ('BWSSB', 'BWSSB', 'Bills & Utilities', 'seed'),
  ('BANGALORE WATER', 'Bangalore Water', 'Bills & Utilities', 'seed'),
  ('BBMP', 'BBMP', 'Bills & Utilities', 'seed'),

  -- ===== Insurance =====
  ('HDFCERGO', 'HDFC ERGO', 'Insurance', 'seed'),
  ('HDFC ERGO', 'HDFC ERGO', 'Insurance', 'seed'),
  ('BAJAJ ALLIANZ', 'Bajaj Allianz', 'Insurance', 'seed'),
  ('SBI LIFE', 'SBI Life', 'Insurance', 'seed'),
  ('MAX LIFE', 'Max Life', 'Insurance', 'seed'),
  ('TATA AIA', 'Tata AIA', 'Insurance', 'seed'),
  ('KOTAK LIFE', 'Kotak Life', 'Insurance', 'seed'),
  ('ACKO', 'Acko', 'Insurance', 'seed'),
  ('DIGIT INSURANCE', 'Digit Insurance', 'Insurance', 'seed'),
  ('CARE HEALTH', 'Care Health', 'Insurance', 'seed'),
  ('NIVA BUPA', 'Niva Bupa', 'Insurance', 'seed'),
  ('MANIPAL CIGNA', 'Manipal Cigna', 'Insurance', 'seed'),
  ('NEW INDIA ASSURANCE', 'New India Assurance', 'Insurance', 'seed'),
  ('NATIONAL INSURANCE', 'National Insurance', 'Insurance', 'seed'),
  ('IFFCO TOKIO', 'IFFCO Tokio', 'Insurance', 'seed'),
  ('ORIENTAL INSURANCE', 'Oriental Insurance', 'Insurance', 'seed'),

  -- ===== Investments =====
  ('ANGEL ONE', 'Angel One', 'Investments', 'seed'),
  ('ANGEL BROKING', 'Angel One', 'Investments', 'seed'),
  ('MOTILAL OSWAL', 'Motilal Oswal', 'Investments', 'seed'),
  ('IIFL', 'IIFL', 'Investments', 'seed'),
  ('SHAREKHAN', 'Sharekhan', 'Investments', 'seed'),
  ('5PAISA', '5Paisa', 'Investments', 'seed'),
  ('PAYTM MONEY', 'Paytm Money', 'Investments', 'seed'),
  ('SMALLCASE', 'Smallcase', 'Investments', 'seed'),
  ('ET MONEY', 'ET Money', 'Investments', 'seed'),
  ('DHAN', 'Dhan', 'Investments', 'seed'),
  ('HDFC SECURITIES', 'HDFC Securities', 'Investments', 'seed'),
  ('ICICI DIRECT', 'ICICI Direct', 'Investments', 'seed'),
  ('KOTAK SECURITIES', 'Kotak Securities', 'Investments', 'seed'),
  ('SBI SECURITIES', 'SBI Securities', 'Investments', 'seed'),
  ('MUTUAL FUND', 'Mutual Fund', 'Investments', 'seed'),
  ('SIP', 'SIP Investment', 'Investments', 'seed'),
  ('NPS', 'NPS', 'Investments', 'seed'),
  ('PPF', 'PPF', 'Investments', 'seed'),

  -- ===== Loans & EMI =====
  ('BAJAJ FINSERV', 'Bajaj Finserv', 'Loans & EMI', 'seed'),
  ('BAJAJ FINANCE', 'Bajaj Finance', 'Loans & EMI', 'seed'),
  ('TATA CAPITAL', 'Tata Capital', 'Loans & EMI', 'seed'),
  ('HDFC LTD', 'HDFC Ltd', 'Loans & EMI', 'seed'),
  ('MUTHOOT', 'Muthoot', 'Loans & EMI', 'seed'),
  ('MANAPPURAM', 'Manappuram', 'Loans & EMI', 'seed'),
  ('HOME CREDIT', 'Home Credit', 'Loans & EMI', 'seed'),
  ('ZEST MONEY', 'ZestMoney', 'Loans & EMI', 'seed'),
  ('SIMPL', 'Simpl', 'Loans & EMI', 'seed'),
  ('LAZYPAY', 'LazyPay', 'Loans & EMI', 'seed'),
  ('PAYTM POSTPAID', 'Paytm Postpaid', 'Loans & EMI', 'seed'),
  ('SLICE', 'Slice', 'Loans & EMI', 'seed'),
  ('UNI CARD', 'Uni Card', 'Loans & EMI', 'seed'),
  ('ONECARD', 'OneCard', 'Loans & EMI', 'seed'),
  ('JUPITER', 'Jupiter', 'Loans & EMI', 'seed'),
  ('FI MONEY', 'Fi Money', 'Loans & EMI', 'seed'),

  -- ===== Fees & Charges =====
  ('STAMP DUTY', 'Stamp Duty', 'Fees & Charges', 'seed'),
  ('GST', 'GST', 'Fees & Charges', 'seed'),
  ('CONVENIENCE FEE', 'Convenience Fee', 'Fees & Charges', 'seed'),
  ('PROCESSING FEE', 'Processing Fee', 'Fees & Charges', 'seed'),
  ('ANNUAL FEE', 'Annual Fee', 'Fees & Charges', 'seed'),
  ('LATE FEE', 'Late Fee', 'Fees & Charges', 'seed'),
  ('FORECLOSURE', 'Foreclosure Charge', 'Fees & Charges', 'seed'),

  -- ===== Health & Medical =====
  ('MAX HOSPITAL', 'Max Hospital', 'Health & Medical', 'seed'),
  ('APOLLO HOSPITAL', 'Apollo Hospital', 'Health & Medical', 'seed'),
  ('FORTIS', 'Fortis', 'Health & Medical', 'seed'),
  ('MANIPAL HOSPITAL', 'Manipal Hospital', 'Health & Medical', 'seed'),
  ('NARAYANA HEALTH', 'Narayana Health', 'Health & Medical', 'seed'),
  ('MEDPLUS', 'MedPlus', 'Health & Medical', 'seed'),
  ('NETMEDS', 'Netmeds', 'Health & Medical', 'seed'),
  ('LENSKART', 'Lenskart', 'Health & Medical', 'seed'),
  ('OPTICALS', 'Opticals', 'Health & Medical', 'seed'),
  ('DR LAL PATH', 'Dr Lal PathLabs', 'Health & Medical', 'seed'),
  ('SRL DIAGNOSTICS', 'SRL Diagnostics', 'Health & Medical', 'seed'),
  ('THYROCARE', 'Thyrocare', 'Health & Medical', 'seed'),
  ('HEALTHIANS', 'Healthians', 'Health & Medical', 'seed'),

  -- ===== Entertainment =====
  ('INOX', 'INOX', 'Entertainment', 'seed'),
  ('CINEPOLIS', 'Cinepolis', 'Entertainment', 'seed'),
  ('AMAZON PRIME', 'Amazon Prime', 'Subscriptions', 'seed'),
  ('ZEE5', 'Zee5', 'Entertainment', 'seed'),
  ('SONY LIV', 'SonyLIV', 'Entertainment', 'seed'),
  ('JIOCINEMA', 'JioCinema', 'Entertainment', 'seed'),
  ('MX PLAYER', 'MX Player', 'Entertainment', 'seed'),
  ('VOOT', 'Voot', 'Entertainment', 'seed'),
  ('ALT BALAJI', 'ALTBalaji', 'Entertainment', 'seed'),

  -- ===== Subscriptions =====
  ('NOTION', 'Notion', 'Subscriptions', 'seed'),
  ('CANVA', 'Canva', 'Subscriptions', 'seed'),
  ('ZOOM', 'Zoom', 'Subscriptions', 'seed'),
  ('CHATGPT', 'ChatGPT', 'Subscriptions', 'seed'),
  ('OPENAI', 'OpenAI', 'Subscriptions', 'seed'),
  ('DROPBOX', 'Dropbox', 'Subscriptions', 'seed'),
  ('ICLOUD', 'iCloud', 'Subscriptions', 'seed'),
  ('LINKEDIN', 'LinkedIn', 'Subscriptions', 'seed'),
  ('GITHUB', 'GitHub', 'Subscriptions', 'seed'),
  ('ADOBE', 'Adobe', 'Subscriptions', 'seed'),
  ('GRAMMARLY', 'Grammarly', 'Subscriptions', 'seed'),
  ('NORDVPN', 'NordVPN', 'Subscriptions', 'seed'),
  ('EXPRESSVPN', 'ExpressVPN', 'Subscriptions', 'seed'),

  -- ===== Education =====
  ('UPGRAD', 'upGrad', 'Education', 'seed'),
  ('SIMPLILEARN', 'Simplilearn', 'Education', 'seed'),
  ('GREAT LEARNING', 'Great Learning', 'Education', 'seed'),
  ('VEDANTU', 'Vedantu', 'Education', 'seed'),
  ('WHITEHAT JR', 'WhiteHat Jr', 'Education', 'seed'),
  ('LINKEDIN LEARNING', 'LinkedIn Learning', 'Education', 'seed'),
  ('SKILLSHARE', 'Skillshare', 'Education', 'seed'),
  ('DUOLINGO', 'Duolingo', 'Education', 'seed'),

  -- ===== Personal Care =====
  ('SALON', 'Salon', 'Personal Care', 'seed'),
  ('SPA', 'Spa', 'Personal Care', 'seed'),
  ('BODYCRAFT', 'Bodycraft', 'Personal Care', 'seed'),
  ('LAKME', 'Lakme', 'Personal Care', 'seed'),
  ('JAWED HABIB', 'Jawed Habib', 'Personal Care', 'seed'),
  ('GREEN TRENDS', 'Green Trends', 'Personal Care', 'seed'),

  -- ===== Gifts & Donations =====
  ('KETTO', 'Ketto', 'Gifts & Donations', 'seed'),
  ('MILAAP', 'Milaap', 'Gifts & Donations', 'seed'),
  ('GIVE INDIA', 'GiveIndia', 'Gifts & Donations', 'seed'),

  -- ===== Taxes =====
  ('INCOME TAX', 'Income Tax', 'Taxes', 'seed'),
  ('TDS', 'TDS', 'Taxes', 'seed'),
  ('ADVANCE TAX', 'Advance Tax', 'Taxes', 'seed'),
  ('PROPERTY TAX', 'Property Tax', 'Taxes', 'seed'),
  ('PROFESSIONAL TAX', 'Professional Tax', 'Taxes', 'seed'),

  -- ===== Cash & ATM =====
  ('ATM CASH', 'ATM Withdrawal', 'Cash & ATM', 'seed'),
  ('ATM WDL', 'ATM Withdrawal', 'Cash & ATM', 'seed'),
  ('CASH WITHDRAWAL', 'Cash Withdrawal', 'Cash & ATM', 'seed'),
  ('SELF TRANSFER', 'Self Transfer', 'Transfers', 'seed'),

  -- ===== Transfers =====
  ('BHIM', 'BHIM', 'Transfers', 'seed'),
  ('MOBIKWIK', 'MobiKwik', 'Transfers', 'seed'),
  ('FREECHARGE', 'FreeCharge', 'Transfers', 'seed'),
  ('AMAZON PAY WALLET', 'Amazon Pay Wallet', 'Transfers', 'seed'),
  ('NEFT TRANSFER', 'NEFT Transfer', 'Transfers', 'seed'),
  ('IMPS TRANSFER', 'IMPS Transfer', 'Transfers', 'seed'),
  ('RTGS TRANSFER', 'RTGS Transfer', 'Transfers', 'seed'),

  -- ===== Housing & Rent =====
  ('NOBROKER', 'NoBroker', 'Housing & Rent', 'seed'),
  ('MAGICBRICKS', 'MagicBricks', 'Housing & Rent', 'seed'),
  ('99ACRES', '99acres', 'Housing & Rent', 'seed'),
  ('HOUSING COM', 'Housing.com', 'Housing & Rent', 'seed'),
  ('MYGATE', 'MyGate', 'Housing & Rent', 'seed'),
  ('APARTMENTADDA', 'ApartmentAdda', 'Housing & Rent', 'seed'),
  ('NESTAWAY', 'Nestaway', 'Housing & Rent', 'seed'),

  -- ===== Kids & Family =====
  ('FIRSTCRY', 'FirstCry', 'Kids & Family', 'seed'),
  ('MOTHERCARE', 'Mothercare', 'Kids & Family', 'seed'),
  ('HOPSCOTCH', 'Hopscotch', 'Kids & Family', 'seed'),
  ('KIDSTOPPRESS', 'KidsStopPress', 'Kids & Family', 'seed')

ON CONFLICT (normalized_pattern) DO NOTHING;


-- Now sync expanded seeds into payee_pattern_categories (global rows)
INSERT INTO public.payee_pattern_categories
  (household_id, normalized_pattern, category_name, confidence, source)
SELECT
  NULL,
  gmd.normalized_pattern,
  gmd.suggested_category,
  0.90,
  'seed'
FROM public.global_merchant_dictionary gmd
WHERE gmd.suggested_category IS NOT NULL
  AND gmd.confidence_source = 'seed'
ON CONFLICT DO NOTHING;
