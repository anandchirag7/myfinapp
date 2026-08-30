-- =============================================================================
-- Default Category Taxonomy + Global Merchant Dictionary Reconciliation
-- Approved review data: 98 templates, 319 remaps, 6 removals, 189 new patterns
-- =============================================================================

CREATE TABLE public.global_category_templates (
  key TEXT PRIMARY KEY,
  parent_key TEXT REFERENCES public.global_category_templates(key) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense', 'transfer', 'investment')),
  scope TEXT NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal', 'business')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT global_category_templates_key_format
    CHECK (key ~ '^[a-z0-9]+([._][a-z0-9]+)*$')
);

CREATE UNIQUE INDEX global_category_templates_name_ci_key
  ON public.global_category_templates (lower(name));
CREATE INDEX global_category_templates_parent_key_idx
  ON public.global_category_templates (parent_key);

GRANT SELECT ON public.global_category_templates TO authenticated;
GRANT ALL ON public.global_category_templates TO service_role;
ALTER TABLE public.global_category_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Category templates are readable by authenticated users"
  ON public.global_category_templates FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_global_category_templates_updated_at
  BEFORE UPDATE ON public.global_category_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.categories
  ADD COLUMN template_key TEXT REFERENCES public.global_category_templates(key) ON DELETE SET NULL;

CREATE UNIQUE INDEX categories_household_template_key
  ON public.categories (household_id, template_key)
  WHERE template_key IS NOT NULL;

ALTER TABLE public.global_merchant_dictionary
  ADD COLUMN suggested_category_key TEXT
  REFERENCES public.global_category_templates(key) ON DELETE SET NULL;

ALTER TABLE public.payee_pattern_categories
  ADD COLUMN category_key TEXT
  REFERENCES public.global_category_templates(key) ON DELETE SET NULL;

INSERT INTO public.global_category_templates
  (key, parent_key, name, kind, scope, version, sort_order, description, is_active)
VALUES
  ('expense.food_and_dining', NULL, 'Food & Dining', 'expense', 'personal', 1, 1, 'Everyday food spending', true),
  ('expense.food_and_dining.groceries', 'expense.food_and_dining', 'Groceries', 'expense', 'personal', 1, 2, 'Supermarkets, kirana, meat, dairy and household food', true),
  ('expense.food_and_dining.restaurants_and_cafes', 'expense.food_and_dining', 'Restaurants & Cafes', 'expense', 'personal', 1, 3, 'Dine-in, takeaway, cafes and quick-service restaurants', true),
  ('expense.food_and_dining.food_delivery', 'expense.food_and_dining', 'Food Delivery', 'expense', 'personal', 1, 4, 'Prepared-food delivery and cloud kitchens', true),
  ('expense.transport', NULL, 'Transport', 'expense', 'personal', 1, 5, 'Local commute and vehicle running costs', true),
  ('expense.transport.cab_and_auto', 'expense.transport', 'Cab & Auto', 'expense', 'personal', 1, 6, 'Taxi, auto-rickshaw and bike taxi', true),
  ('expense.transport.public_transport', 'expense.transport', 'Public Transport', 'expense', 'personal', 1, 7, 'Bus and metro', true),
  ('expense.transport.fuel', 'expense.transport', 'Fuel', 'expense', 'personal', 1, 8, 'Petrol, diesel, CNG and EV charging', true),
  ('expense.transport.parking_and_tolls', 'expense.transport', 'Parking & Tolls', 'expense', 'personal', 1, 9, 'Parking, tolls and FASTag', true),
  ('expense.transport.vehicle_maintenance', 'expense.transport', 'Vehicle Maintenance', 'expense', 'personal', 1, 10, 'Service, repairs, tyres and spares', true),
  ('expense.housing_and_utilities', NULL, 'Housing & Utilities', 'expense', 'personal', 1, 11, 'Home occupancy and recurring utilities', true),
  ('expense.housing_and_utilities.rent', 'expense.housing_and_utilities', 'Rent', 'expense', 'personal', 1, 12, 'Home rent and rental platforms', true),
  ('expense.housing_and_utilities.society_maintenance', 'expense.housing_and_utilities', 'Society Maintenance', 'expense', 'personal', 1, 13, 'Apartment and housing-society charges', true),
  ('expense.housing_and_utilities.electricity', 'expense.housing_and_utilities', 'Electricity', 'expense', 'personal', 1, 14, 'Electricity bills', true),
  ('expense.housing_and_utilities.water', 'expense.housing_and_utilities', 'Water', 'expense', 'personal', 1, 15, 'Water bills', true),
  ('expense.housing_and_utilities.cooking_gas', 'expense.housing_and_utilities', 'Cooking Gas', 'expense', 'personal', 1, 16, 'Piped gas and LPG', true),
  ('expense.housing_and_utilities.mobile_and_internet', 'expense.housing_and_utilities', 'Mobile & Internet', 'expense', 'personal', 1, 17, 'Mobile, landline and broadband', true),
  ('expense.housing_and_utilities.tv_and_dth', 'expense.housing_and_utilities', 'TV & DTH', 'expense', 'personal', 1, 18, 'DTH and cable television', true),
  ('expense.household', NULL, 'Household', 'expense', 'personal', 1, 19, 'Home services and durable goods', true),
  ('expense.household.domestic_help', 'expense.household', 'Domestic Help', 'expense', 'personal', 1, 20, 'Maid, cook, driver and household staff', true),
  ('expense.household.home_repairs', 'expense.household', 'Home Repairs', 'expense', 'personal', 1, 21, 'Cleaning, repairs, pest control and maintenance', true),
  ('expense.household.furniture_and_appliances', 'expense.household', 'Furniture & Appliances', 'expense', 'personal', 1, 22, 'Furniture, appliances and home improvement', true),
  ('expense.health_and_medical', NULL, 'Health & Medical', 'expense', 'personal', 1, 23, 'Healthcare excluding insurance premiums', true),
  ('expense.health_and_medical.doctor_and_hospital', 'expense.health_and_medical', 'Doctor & Hospital', 'expense', 'personal', 1, 24, 'Consultations, procedures and hospitalization', true),
  ('expense.health_and_medical.medicines', 'expense.health_and_medical', 'Medicines', 'expense', 'personal', 1, 25, 'Pharmacy and medicine purchases', true),
  ('expense.health_and_medical.diagnostics', 'expense.health_and_medical', 'Diagnostics', 'expense', 'personal', 1, 26, 'Labs, scans and health tests', true),
  ('expense.health_and_medical.dental_and_vision', 'expense.health_and_medical', 'Dental & Vision', 'expense', 'personal', 1, 27, 'Dentist, optical and eye care', true),
  ('expense.insurance', NULL, 'Insurance', 'expense', 'personal', 1, 28, 'Insurance premium payments', true),
  ('expense.insurance.health_insurance', 'expense.insurance', 'Health Insurance', 'expense', 'personal', 1, 29, 'Health and medical insurance', true),
  ('expense.insurance.life_insurance', 'expense.insurance', 'Life Insurance', 'expense', 'personal', 1, 30, 'Term, endowment and life policies', true),
  ('expense.insurance.vehicle_insurance', 'expense.insurance', 'Vehicle Insurance', 'expense', 'personal', 1, 31, 'Motor and two-wheeler insurance', true),
  ('expense.insurance.other_insurance', 'expense.insurance', 'Other Insurance', 'expense', 'personal', 1, 32, 'Travel, home and general insurance', true),
  ('expense.education', NULL, 'Education', 'expense', 'personal', 1, 33, 'Formal education and skills', true),
  ('expense.education.school_and_college_fees', 'expense.education', 'School & College Fees', 'expense', 'personal', 1, 34, 'School, college and institutional fees', true),
  ('expense.education.tuition_and_courses', 'expense.education', 'Tuition & Courses', 'expense', 'personal', 1, 35, 'Coaching, online courses and tuition', true),
  ('expense.education.books_and_supplies', 'expense.education', 'Books & Supplies', 'expense', 'personal', 1, 36, 'Books, uniforms and learning supplies', true),
  ('expense.shopping', NULL, 'Shopping', 'expense', 'personal', 1, 37, 'Personal and household retail', true),
  ('expense.shopping.clothing_and_footwear', 'expense.shopping', 'Clothing & Footwear', 'expense', 'personal', 1, 38, 'Apparel, footwear and accessories', true),
  ('expense.shopping.electronics', 'expense.shopping', 'Electronics', 'expense', 'personal', 1, 39, 'Devices and consumer electronics', true),
  ('expense.shopping.home_and_kitchen', 'expense.shopping', 'Home & Kitchen', 'expense', 'personal', 1, 40, 'Homeware, kitchenware and decor', true),
  ('expense.shopping.beauty_and_personal_care', 'expense.shopping', 'Beauty & Personal Care', 'expense', 'personal', 1, 41, 'Salon, spa, cosmetics and grooming', true),
  ('expense.shopping.kids_and_baby', 'expense.shopping', 'Kids & Baby', 'expense', 'personal', 1, 42, 'Baby products, toys and children''s retail', true),
  ('expense.entertainment_and_subscriptions', NULL, 'Entertainment & Subscriptions', 'expense', 'personal', 1, 43, 'Leisure and recurring digital services', true),
  ('expense.entertainment_and_subscriptions.movies_and_events', 'expense.entertainment_and_subscriptions', 'Movies & Events', 'expense', 'personal', 1, 44, 'Cinema, concerts, events and tickets', true),
  ('expense.entertainment_and_subscriptions.streaming_services', 'expense.entertainment_and_subscriptions', 'Streaming Services', 'expense', 'personal', 1, 45, 'Video, music and news streaming', true),
  ('expense.entertainment_and_subscriptions.software_and_apps', 'expense.entertainment_and_subscriptions', 'Software & Apps', 'expense', 'personal', 1, 46, 'Productivity software, cloud and app subscriptions', true),
  ('expense.entertainment_and_subscriptions.games_and_hobbies', 'expense.entertainment_and_subscriptions', 'Games & Hobbies', 'expense', 'personal', 1, 47, 'Gaming, sports and hobbies', true),
  ('expense.travel', NULL, 'Travel', 'expense', 'personal', 1, 48, 'Outstation and holiday travel', true),
  ('expense.travel.flights', 'expense.travel', 'Flights', 'expense', 'personal', 1, 49, 'Air tickets and airline charges', true),
  ('expense.travel.trains_and_buses', 'expense.travel', 'Trains & Buses', 'expense', 'personal', 1, 50, 'Rail and intercity bus travel', true),
  ('expense.travel.hotels_and_stay', 'expense.travel', 'Hotels & Stay', 'expense', 'personal', 1, 51, 'Hotels, hostels and holiday accommodation', true),
  ('expense.travel.travel_services', 'expense.travel', 'Travel Services', 'expense', 'personal', 1, 52, 'Booking portals, tours, visa and travel services', true),
  ('expense.family_and_lifestyle', NULL, 'Family & Lifestyle', 'expense', 'personal', 1, 53, 'Social, family and lifestyle commitments', true),
  ('expense.family_and_lifestyle.gifts', 'expense.family_and_lifestyle', 'Gifts', 'expense', 'personal', 1, 54, 'Personal gifts and social obligations', true),
  ('expense.family_and_lifestyle.festivals_and_religious', 'expense.family_and_lifestyle', 'Festivals & Religious', 'expense', 'personal', 1, 55, 'Festivals, ceremonies and religious expenses', true),
  ('expense.family_and_lifestyle.weddings_and_functions', 'expense.family_and_lifestyle', 'Weddings & Functions', 'expense', 'personal', 1, 56, 'Weddings, parties and functions', true),
  ('expense.family_and_lifestyle.pets', 'expense.family_and_lifestyle', 'Pets', 'expense', 'personal', 1, 57, 'Pet food, healthcare and supplies', true),
  ('expense.loans_and_emi', NULL, 'Loans & EMI', 'expense', 'personal', 1, 58, 'Debt servicing excluding credit-card settlement', true),
  ('expense.loans_and_emi.home_loan_emi', 'expense.loans_and_emi', 'Home Loan EMI', 'expense', 'personal', 1, 59, 'Home-loan EMI and interest', true),
  ('expense.loans_and_emi.vehicle_loan_emi', 'expense.loans_and_emi', 'Vehicle Loan EMI', 'expense', 'personal', 1, 60, 'Vehicle-loan EMI and interest', true),
  ('expense.loans_and_emi.personal_loan_emi', 'expense.loans_and_emi', 'Personal Loan EMI', 'expense', 'personal', 1, 61, 'Personal, gold and education-loan EMI', true),
  ('expense.loans_and_emi.consumer_emi', 'expense.loans_and_emi', 'Consumer EMI', 'expense', 'personal', 1, 62, 'BNPL and consumer-durable EMI', true),
  ('expense.taxes_and_fees', NULL, 'Taxes & Fees', 'expense', 'personal', 1, 63, 'Taxes, banking and statutory fees', true),
  ('expense.taxes_and_fees.income_and_property_tax', 'expense.taxes_and_fees', 'Income & Property Tax', 'expense', 'personal', 1, 64, 'Income, advance and property tax', true),
  ('expense.taxes_and_fees.bank_charges', 'expense.taxes_and_fees', 'Bank Charges', 'expense', 'personal', 1, 65, 'Bank and card charges', true),
  ('expense.taxes_and_fees.government_fees', 'expense.taxes_and_fees', 'Government Fees', 'expense', 'personal', 1, 66, 'Stamp duty and government service fees', true),
  ('expense.taxes_and_fees.penalties_and_processing_fees', 'expense.taxes_and_fees', 'Penalties & Processing Fees', 'expense', 'personal', 1, 67, 'Late, convenience, processing and foreclosure fees', true),
  ('expense.business_expenses', NULL, 'Business Expenses', 'expense', 'business', 1, 68, 'Compact business-expense defaults', true),
  ('expense.business_expenses.office_and_coworking', 'expense.business_expenses', 'Office & Coworking', 'expense', 'business', 1, 69, 'Office rent, utilities and coworking', true),
  ('expense.business_expenses.inventory_and_supplies', 'expense.business_expenses', 'Inventory & Supplies', 'expense', 'business', 1, 70, 'Inventory, raw material, packaging and logistics', true),
  ('expense.business_expenses.payroll_and_contractors', 'expense.business_expenses', 'Payroll & Contractors', 'expense', 'business', 1, 71, 'Payroll, contractors and employee costs', true),
  ('expense.business_expenses.marketing_and_sales', 'expense.business_expenses', 'Marketing & Sales', 'expense', 'business', 1, 72, 'Advertising, promotions and commissions', true),
  ('expense.business_expenses.professional_services', 'expense.business_expenses', 'Professional Services', 'expense', 'business', 1, 73, 'Legal, accounting, consulting and audit', true),
  ('expense.business_expenses.software_and_saas', 'expense.business_expenses', 'Software & SaaS', 'expense', 'business', 1, 74, 'Business software, cloud and hosting', true),
  ('expense.business_expenses.business_travel', 'expense.business_expenses', 'Business Travel', 'expense', 'business', 1, 75, 'Business travel and client entertainment', true),
  ('expense.business_expenses.business_taxes_and_fees', 'expense.business_expenses', 'Business Taxes & Fees', 'expense', 'business', 1, 76, 'GST, compliance, licences and business banking fees', true),
  ('expense.charity_and_donations', NULL, 'Charity & Donations', 'expense', 'personal', 1, 77, 'Verified charity and donation payments', true),
  ('expense.uncategorized', NULL, 'Uncategorized', 'expense', 'personal', 1, 78, 'Fallback only; never an AI-preferred category', true),
  ('income.income', NULL, 'Income', 'income', 'personal', 1, 79, 'All incoming money', true),
  ('income.income.salary_and_income', 'income.income', 'Salary & Income', 'income', 'personal', 1, 80, 'Salary, wages, bonus and pension', true),
  ('income.income.business_income', 'income.income', 'Business Income', 'income', 'business', 1, 81, 'Sales, freelance and professional receipts', true),
  ('income.income.interest_and_dividends', 'income.income', 'Interest & Dividends', 'income', 'personal', 1, 82, 'Interest, dividends and capital distributions', true),
  ('income.income.rental_income', 'income.income', 'Rental Income', 'income', 'personal', 1, 83, 'Property rental receipts', true),
  ('income.income.refunds_and_reimbursements', 'income.income', 'Refunds & Reimbursements', 'income', 'personal', 1, 84, 'Refunds, cashback and reimbursements', true),
  ('income.income.other_income', 'income.income', 'Other Income', 'income', 'personal', 1, 85, 'Income not covered elsewhere', true),
  ('investment.investments', NULL, 'Investments', 'investment', 'personal', 1, 86, 'Asset purchases and long-term savings', true),
  ('investment.investments.mutual_funds_and_sip', 'investment.investments', 'Mutual Funds & SIP', 'investment', 'personal', 1, 87, 'Mutual funds and systematic plans', true),
  ('investment.investments.stocks_and_etfs', 'investment.investments', 'Stocks & ETFs', 'investment', 'personal', 1, 88, 'Brokerage, stocks and exchange-traded funds', true),
  ('investment.investments.fixed_income_and_deposits', 'investment.investments', 'Fixed Income & Deposits', 'investment', 'personal', 1, 89, 'FD, RD, bonds and debt products', true),
  ('investment.investments.retirement_savings', 'investment.investments', 'Retirement Savings', 'investment', 'personal', 1, 90, 'PPF, EPF and NPS', true),
  ('investment.investments.gold_and_commodities', 'investment.investments', 'Gold & Commodities', 'investment', 'personal', 1, 91, 'Digital gold, sovereign gold and commodities', true),
  ('transfer.transfers', NULL, 'Transfers', 'transfer', 'personal', 1, 92, 'Non-income/non-expense money movement', true),
  ('transfer.transfers.self_transfer', 'transfer.transfers', 'Self Transfer', 'transfer', 'personal', 1, 93, 'Transfers between own accounts', true),
  ('transfer.transfers.bank_transfer', 'transfer.transfers', 'Bank Transfer', 'transfer', 'personal', 1, 94, 'NEFT, IMPS and RTGS transfers without a merchant purpose', true),
  ('transfer.transfers.wallet_top_up', 'transfer.transfers', 'Wallet Top-up', 'transfer', 'personal', 1, 95, 'Loading a wallet or prepaid balance', true),
  ('transfer.transfers.credit_card_payment', 'transfer.transfers', 'Credit Card Payment', 'transfer', 'personal', 1, 96, 'Credit-card bill settlement', true),
  ('transfer.transfers.cash_and_atm', 'transfer.transfers', 'Cash & ATM', 'transfer', 'personal', 1, 97, 'Cash withdrawal and cash deposit', true),
  ('transfer.transfers.loan_principal', 'transfer.transfers', 'Loan Principal', 'transfer', 'personal', 1, 98, 'Principal-only debt movement when separately identified', true)
ON CONFLICT (key) DO UPDATE SET
  parent_key = EXCLUDED.parent_key,
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  scope = EXCLUDED.scope,
  version = EXCLUDED.version,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;

CREATE OR REPLACE FUNCTION public.seed_default_categories(_household_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template RECORD;
  resolved_parent_id UUID;
  resolved_category_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.households WHERE id = _household_id) THEN
    RAISE EXCEPTION 'Household % does not exist', _household_id;
  END IF;

  FOR template IN
    SELECT *
    FROM public.global_category_templates
    WHERE is_active
    ORDER BY
      CASE WHEN parent_key IS NULL THEN 0 ELSE 1 END,
      sort_order,
      key
  LOOP
    resolved_parent_id := NULL;
    resolved_category_id := NULL;

    IF template.parent_key IS NOT NULL THEN
      SELECT id INTO resolved_parent_id
      FROM public.categories
      WHERE household_id = _household_id
        AND template_key = template.parent_key;
    END IF;

    SELECT id INTO resolved_category_id
    FROM public.categories
    WHERE household_id = _household_id
      AND template_key = template.key
    LIMIT 1;

    IF resolved_category_id IS NULL THEN
      SELECT id INTO resolved_category_id
      FROM public.categories
      WHERE household_id = _household_id
        AND template_key IS NULL
        AND lower(name) = lower(template.name)
        AND kind = template.kind
        AND scope = template.scope
        AND parent_id IS NOT DISTINCT FROM resolved_parent_id
      ORDER BY is_system DESC, created_at, id
      LIMIT 1;

      IF resolved_category_id IS NOT NULL THEN
        UPDATE public.categories
        SET template_key = template.key
        WHERE id = resolved_category_id;
      ELSE
        INSERT INTO public.categories (
          household_id,
          parent_id,
          template_key,
          name,
          kind,
          scope,
          is_system,
          sort_order,
          description
        )
        VALUES (
          _household_id,
          resolved_parent_id,
          template.key,
          template.name,
          template.kind,
          template.scope,
          true,
          template.sort_order,
          template.description
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Adopt exact existing categories when possible and add only missing templates.
DO $$
DECLARE
  household RECORD;
BEGIN
  FOR household IN SELECT id FROM public.households LOOP
    PERFORM public.seed_default_categories(household.id);
  END LOOP;
END;
$$;

-- Remove unsafe payment-rail seeds only. User-confirmed dictionary rows and
-- household-specific pattern rows are deliberately preserved.
DELETE FROM public.payee_pattern_categories
WHERE household_id IS NULL
  AND source = 'seed'
  AND normalized_pattern IN ('BHIM', 'FI MONEY', 'GOOGLE PAY', 'JUPITER', 'PAYTM', 'PHONEPE');

DELETE FROM public.global_merchant_dictionary
WHERE confidence_source = 'seed'
  AND normalized_pattern IN ('BHIM', 'FI MONEY', 'GOOGLE PAY', 'JUPITER', 'PAYTM', 'PHONEPE');

-- Reconcile deterministic existing seeds and add approved merchant/biller rows.
INSERT INTO public.global_merchant_dictionary (
  normalized_pattern,
  canonical_payee_name,
  suggested_category,
  suggested_category_key,
  confidence_source
)
VALUES
  ('1MG', 'Tata 1mg', 'Medicines', 'expense.health_and_medical.medicines', 'seed'),
  ('5PAISA', '5Paisa', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('99ACRES', '99acres', 'Rent', 'expense.housing_and_utilities.rent', 'seed'),
  ('ABHIBUS', 'AbhiBus', 'Trains & Buses', 'expense.travel.trains_and_buses', 'seed'),
  ('ACKO', 'Acko', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('ACT FIBERNET', 'ACT Fibernet', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('ADANI ELECTRICITY', 'Adani Electricity', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('ADOBE', 'Adobe', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('ADVANCE TAX', 'Advance Tax', 'Income & Property Tax', 'expense.taxes_and_fees.income_and_property_tax', 'seed'),
  ('AGODA', 'Agoda', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('AIR INDIA', 'Air India', 'Flights', 'expense.travel.flights', 'seed'),
  ('AIRASIA', 'AirAsia', 'Flights', 'expense.travel.flights', 'seed'),
  ('AIRBNB', 'Airbnb', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('AIRTEL', 'Airtel', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('AIRTEL DTH', 'Airtel DTH', 'TV & DTH', 'expense.housing_and_utilities.tv_and_dth', 'seed'),
  ('AJIO', 'Ajio', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('AKASA AIR', 'Akasa Air', 'Flights', 'expense.travel.flights', 'seed'),
  ('ALT BALAJI', 'ALTBalaji', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('AMAZON FRESH', 'Amazon Fresh', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('AMAZON PANTRY', 'Amazon Pantry', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('AMAZON PAY WALLET', 'Amazon Pay Wallet', 'Wallet Top-up', 'transfer.transfers.wallet_top_up', 'seed'),
  ('AMAZON PRIME', 'Amazon Prime', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('ANGEL BROKING', 'Angel One', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('ANGEL ONE', 'Angel One', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('ANNUAL FEE', 'Annual Fee', 'Penalties & Processing Fees', 'expense.taxes_and_fees.penalties_and_processing_fees', 'seed'),
  ('APARTMENTADDA', 'ApartmentAdda', 'Society Maintenance', 'expense.housing_and_utilities.society_maintenance', 'seed'),
  ('APOLLO HOSPITAL', 'Apollo Hospital', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('APOLLO PHARMACY', 'Apollo Pharmacy', 'Medicines', 'expense.health_and_medical.medicines', 'seed'),
  ('ATM CASH', 'ATM Withdrawal', 'Cash & ATM', 'transfer.transfers.cash_and_atm', 'seed'),
  ('ATM WDL', 'ATM Withdrawal', 'Cash & ATM', 'transfer.transfers.cash_and_atm', 'seed'),
  ('BAJAJ ALLIANZ', 'Bajaj Allianz', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('BAJAJ FINANCE', 'Bajaj Finance', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('BAJAJ FINSERV', 'Bajaj Finserv', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('BANGALORE WATER', 'Bangalore Water', 'Water', 'expense.housing_and_utilities.water', 'seed'),
  ('BARBEQUE NATION', 'Barbeque Nation', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('BARISTA', 'Barista', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('BASKIN ROBBINS', 'Baskin Robbins', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('BATA', 'Bata', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('BBMP', 'BBMP', 'Government Fees', 'expense.taxes_and_fees.government_fees', 'seed'),
  ('BEHROUZ', 'Behrouz Biryani', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('BESCOM', 'BESCOM', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('BEST BUS', 'BEST Bus', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('BEWAKOOF', 'Bewakoof', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('BHARAT PETROLEUM', 'Bharat Petroleum', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('BIGBASKET', 'BigBasket', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('BLINKIT', 'Blinkit', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('BMTC', 'BMTC', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('BODYCRAFT', 'Bodycraft', 'Beauty & Personal Care', 'expense.shopping.beauty_and_personal_care', 'seed'),
  ('BOOKING COM', 'Booking.com', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('BOOKMYSHOW', 'BookMyShow', 'Movies & Events', 'expense.entertainment_and_subscriptions.movies_and_events', 'seed'),
  ('BOUNCE', 'Bounce', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('BOX8', 'Box8', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('BPCL', 'BPCL', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('BSNL', 'BSNL', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('BURGER KING', 'Burger King', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('BWSSB', 'BWSSB', 'Water', 'expense.housing_and_utilities.water', 'seed'),
  ('BYJUS', 'Byjus', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('CAFE COFFEE DAY', 'Cafe Coffee Day', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('CANVA', 'Canva', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('CARE HEALTH', 'Care Health', 'Health Insurance', 'expense.insurance.health_insurance', 'seed'),
  ('CASH WITHDRAWAL', 'Cash Withdrawal', 'Cash & ATM', 'transfer.transfers.cash_and_atm', 'seed'),
  ('CCD', 'Cafe Coffee Day', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('CESC', 'CESC', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('CHAAYOS', 'Chaayos', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('CHAI POINT', 'Chai Point', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('CHATGPT', 'ChatGPT', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('CHENNAI METRO', 'Chennai Metro', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('CHUMBAK', 'Chumbak', 'Home & Kitchen', 'expense.shopping.home_and_kitchen', 'seed'),
  ('CINEPOLIS', 'Cinepolis', 'Movies & Events', 'expense.entertainment_and_subscriptions.movies_and_events', 'seed'),
  ('CLEARTRIP', 'Cleartrip', 'Travel Services', 'expense.travel.travel_services', 'seed'),
  ('COIN ZERODHA', 'Zerodha Coin', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('CONVENIENCE FEE', 'Convenience Fee', 'Penalties & Processing Fees', 'expense.taxes_and_fees.penalties_and_processing_fees', 'seed'),
  ('COUNTRY DELIGHT', 'Country Delight', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('COURSERA', 'Coursera', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('CRED', 'CRED', 'Credit Card Payment', 'transfer.transfers.credit_card_payment', 'seed'),
  ('CROMA', 'Croma', 'Electronics', 'expense.shopping.electronics', 'seed'),
  ('CULT FIT', 'Cultfit', 'Games & Hobbies', 'expense.entertainment_and_subscriptions.games_and_hobbies', 'seed'),
  ('D2H', 'D2H', 'TV & DTH', 'expense.housing_and_utilities.tv_and_dth', 'seed'),
  ('DECATHLON', 'Decathlon', 'Shopping', 'expense.shopping', 'seed'),
  ('DELHI METRO', 'Delhi Metro', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('DHAN', 'Dhan', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('DIGIT INSURANCE', 'Digit Insurance', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('DISH TV', 'Dish TV', 'TV & DTH', 'expense.housing_and_utilities.tv_and_dth', 'seed'),
  ('DMART', 'DMart', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('DOMINOS', 'Dominos Pizza', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('DR LAL PATH', 'Dr Lal PathLabs', 'Diagnostics', 'expense.health_and_medical.diagnostics', 'seed'),
  ('DROPBOX', 'Dropbox', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('DUOLINGO', 'Duolingo', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('EASEMYTRIP', 'EaseMyTrip', 'Travel Services', 'expense.travel.travel_services', 'seed'),
  ('EAT FIT', 'EatFit', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('ET MONEY', 'ET Money', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('EXPRESSVPN', 'ExpressVPN', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('FAASOS', 'Faasos', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('FABHOTELS', 'FabHotels', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('FASTAG', 'FASTag', 'Parking & Tolls', 'expense.transport.parking_and_tolls', 'seed'),
  ('FIRST CRY', 'FirstCry', 'Kids & Baby', 'expense.shopping.kids_and_baby', 'seed'),
  ('FIRSTCRY', 'FirstCry', 'Kids & Baby', 'expense.shopping.kids_and_baby', 'seed'),
  ('FLIPKART', 'Flipkart', 'Shopping', 'expense.shopping', 'seed'),
  ('FLIPKART GROCERY', 'Flipkart Grocery', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('FORECLOSURE', 'Foreclosure Charge', 'Penalties & Processing Fees', 'expense.taxes_and_fees.penalties_and_processing_fees', 'seed'),
  ('FORTIS', 'Fortis', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('FREECHARGE', 'FreeCharge', 'Wallet Top-up', 'transfer.transfers.wallet_top_up', 'seed'),
  ('FRESHMENU', 'FreshMenu', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('GAIL GAS', 'GAIL Gas', 'Cooking Gas', 'expense.housing_and_utilities.cooking_gas', 'seed'),
  ('GITHUB', 'GitHub', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('GIVE INDIA', 'GiveIndia', 'Charity & Donations', 'expense.charity_and_donations', 'seed'),
  ('GOAIR', 'Go First', 'Flights', 'expense.travel.flights', 'seed'),
  ('GOIBIBO', 'Goibibo', 'Travel Services', 'expense.travel.travel_services', 'seed'),
  ('GRAMMARLY', 'Grammarly', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('GREAT LEARNING', 'Great Learning', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('GREEN TRENDS', 'Green Trends', 'Beauty & Personal Care', 'expense.shopping.beauty_and_personal_care', 'seed'),
  ('GROWW', 'Groww', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('GST', 'GST', 'Business Taxes & Fees', 'expense.business_expenses.business_taxes_and_fees', 'seed'),
  ('H M', 'H&M', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('HALDIRAM', 'Haldirams', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('HATHWAY', 'Hathway', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('HDFC ERGO', 'HDFC ERGO', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('HDFC LIFE', 'HDFC Life', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('HDFC LTD', 'HDFC Ltd', 'Home Loan EMI', 'expense.loans_and_emi.home_loan_emi', 'seed'),
  ('HDFC SECURITIES', 'HDFC Securities', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('HDFCERGO', 'HDFC ERGO', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('HEALTHIANS', 'Healthians', 'Diagnostics', 'expense.health_and_medical.diagnostics', 'seed'),
  ('HOME CREDIT', 'Home Credit', 'Credit Card Payment', 'transfer.transfers.credit_card_payment', 'seed'),
  ('HOPSCOTCH', 'Hopscotch', 'Kids & Baby', 'expense.shopping.kids_and_baby', 'seed'),
  ('HOTSTAR', 'Disney+ Hotstar', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('HOUSING COM', 'Housing.com', 'Rent', 'expense.housing_and_utilities.rent', 'seed'),
  ('HP PETROL', 'HP Petrol', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('HPCL', 'HPCL', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('ICICI DIRECT', 'ICICI Direct', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('ICICI PRUDENTIAL', 'ICICI Prudential', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('ICLOUD', 'iCloud', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('IFFCO TOKIO', 'IFFCO Tokio', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('IGL', 'IGL', 'Cooking Gas', 'expense.housing_and_utilities.cooking_gas', 'seed'),
  ('IIFL', 'IIFL', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('IKEA', 'IKEA', 'Home & Kitchen', 'expense.shopping.home_and_kitchen', 'seed'),
  ('IMPS TRANSFER', 'IMPS Transfer', 'Bank Transfer', 'transfer.transfers.bank_transfer', 'seed'),
  ('INCOME TAX', 'Income Tax', 'Income & Property Tax', 'expense.taxes_and_fees.income_and_property_tax', 'seed'),
  ('INDANE GAS', 'Indane Gas', 'Cooking Gas', 'expense.housing_and_utilities.cooking_gas', 'seed'),
  ('INDIAN OIL', 'Indian Oil', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('INDIGO', 'IndiGo', 'Flights', 'expense.travel.flights', 'seed'),
  ('INOX', 'INOX', 'Movies & Events', 'expense.entertainment_and_subscriptions.movies_and_events', 'seed'),
  ('IOCL', 'IOCL', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('IRCTC', 'IRCTC', 'Trains & Buses', 'expense.travel.trains_and_buses', 'seed'),
  ('ITC HOTELS', 'ITC Hotels', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('IXIGO', 'ixigo', 'Travel Services', 'expense.travel.travel_services', 'seed'),
  ('JAWED HABIB', 'Jawed Habib', 'Beauty & Personal Care', 'expense.shopping.beauty_and_personal_care', 'seed'),
  ('JIO', 'Jio', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('JIOCINEMA', 'JioCinema', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('JIOMART', 'JioMart', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('KALYAN JEWELLERS', 'Kalyan Jewellers', 'Shopping', 'expense.shopping', 'seed'),
  ('KETTO', 'Ketto', 'Charity & Donations', 'expense.charity_and_donations', 'seed'),
  ('KFC', 'KFC', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('KIDSTOPPRESS', 'KidsStopPress', 'Kids & Baby', 'expense.shopping.kids_and_baby', 'seed'),
  ('KOTAK LIFE', 'Kotak Life', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('KOTAK SECURITIES', 'Kotak Securities', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('KSEB', 'KSEB', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('KUVERA', 'Kuvera', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('LAKME', 'Lakme', 'Beauty & Personal Care', 'expense.shopping.beauty_and_personal_care', 'seed'),
  ('LATE FEE', 'Late Fee', 'Penalties & Processing Fees', 'expense.taxes_and_fees.penalties_and_processing_fees', 'seed'),
  ('LAZYPAY', 'LazyPay', 'Consumer EMI', 'expense.loans_and_emi.consumer_emi', 'seed'),
  ('LENSKART', 'Lenskart', 'Dental & Vision', 'expense.health_and_medical.dental_and_vision', 'seed'),
  ('LIC', 'LIC', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('LICIOUS', 'Licious', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('LIFESTYLE', 'Lifestyle', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('LINKEDIN', 'LinkedIn', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('LINKEDIN LEARNING', 'LinkedIn Learning', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('MAGICBRICKS', 'MagicBricks', 'Rent', 'expense.housing_and_utilities.rent', 'seed'),
  ('MAHANAGAR GAS', 'Mahanagar Gas', 'Cooking Gas', 'expense.housing_and_utilities.cooking_gas', 'seed'),
  ('MAKEMYTRIP', 'MakeMyTrip', 'Travel Services', 'expense.travel.travel_services', 'seed'),
  ('MALABAR GOLD', 'Malabar Gold', 'Shopping', 'expense.shopping', 'seed'),
  ('MANAPPURAM', 'Manappuram', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('MANIPAL CIGNA', 'Manipal Cigna', 'Health Insurance', 'expense.insurance.health_insurance', 'seed'),
  ('MANIPAL HOSPITAL', 'Manipal Hospital', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('MARKS SPENCER', 'Marks & Spencer', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('MARRIOTT', 'Marriott', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('MAX HOSPITAL', 'Max Hospital', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('MAX LIFE', 'Max Life', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('MCDONALDS', 'McDonalds', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('MEDPLUS', 'MedPlus', 'Medicines', 'expense.health_and_medical.medicines', 'seed'),
  ('MEESHO', 'Meesho', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('MERU CABS', 'Meru Cabs', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('METRO CASH', 'Metro Cash & Carry', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('METRO SMART CARD', 'Metro Smart Card', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('MILAAP', 'Milaap', 'Charity & Donations', 'expense.charity_and_donations', 'seed'),
  ('MILKBASKET', 'Milkbasket', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('MOBIKWIK', 'MobiKwik', 'Wallet Top-up', 'transfer.transfers.wallet_top_up', 'seed'),
  ('MORE RETAIL', 'More Retail', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('MOTHERCARE', 'Mothercare', 'Kids & Baby', 'expense.shopping.kids_and_baby', 'seed'),
  ('MOTILAL OSWAL', 'Motilal Oswal', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('MSEB', 'MSEDCL', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('MSEDCL', 'MSEDCL', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('MTNL', 'MTNL', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('MUTHOOT', 'Muthoot', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('MUTUAL FUND', 'Mutual Fund', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('MX PLAYER', 'MX Player', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('MYGATE', 'MyGate', 'Society Maintenance', 'expense.housing_and_utilities.society_maintenance', 'seed'),
  ('MYNTRA', 'Myntra', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('NAMMA METRO', 'Namma Metro', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('NAMMA YATRI', 'Namma Yatri', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('NARAYANA HEALTH', 'Narayana Health', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('NATIONAL INSURANCE', 'National Insurance', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('NATURE BASKET', 'Natures Basket', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('NAYARA', 'Nayara', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('NEFT TRANSFER', 'NEFT Transfer', 'Bank Transfer', 'transfer.transfers.bank_transfer', 'seed'),
  ('NESTAWAY', 'Nestaway', 'Rent', 'expense.housing_and_utilities.rent', 'seed'),
  ('NETFLIX', 'Netflix', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('NETMEDS', 'Netmeds', 'Medicines', 'expense.health_and_medical.medicines', 'seed'),
  ('NEW INDIA ASSURANCE', 'New India Assurance', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('NHAI FASTAG', 'NHAI FASTag', 'Parking & Tolls', 'expense.transport.parking_and_tolls', 'seed'),
  ('NIVA BUPA', 'Niva Bupa', 'Health Insurance', 'expense.insurance.health_insurance', 'seed'),
  ('NOBROKER', 'NoBroker', 'Rent', 'expense.housing_and_utilities.rent', 'seed'),
  ('NORDVPN', 'NordVPN', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('NOTION', 'Notion', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('NPS', 'NPS', 'Retirement Savings', 'investment.investments.retirement_savings', 'seed'),
  ('NYKAA', 'Nykaa', 'Beauty & Personal Care', 'expense.shopping.beauty_and_personal_care', 'seed'),
  ('OLA', 'Ola', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('OLA AUTO', 'Ola Auto', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('ONECARD', 'OneCard', 'Credit Card Payment', 'transfer.transfers.credit_card_payment', 'seed'),
  ('OPENAI', 'OpenAI', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('OPTICALS', 'Opticals', 'Dental & Vision', 'expense.health_and_medical.dental_and_vision', 'seed'),
  ('ORIENTAL INSURANCE', 'Oriental Insurance', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('OYO', 'OYO', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('PANTALOONS', 'Pantaloons', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('PARKING', 'Parking', 'Parking & Tolls', 'expense.transport.parking_and_tolls', 'seed'),
  ('PAYTM MONEY', 'Paytm Money', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('PAYTM POSTPAID', 'Paytm Postpaid', 'Consumer EMI', 'expense.loans_and_emi.consumer_emi', 'seed'),
  ('PEPPERFRY', 'Pepperfry', 'Home & Kitchen', 'expense.shopping.home_and_kitchen', 'seed'),
  ('PHARMEASY', 'PharmEasy', 'Medicines', 'expense.health_and_medical.medicines', 'seed'),
  ('PIZZA HUT', 'Pizza Hut', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('PPF', 'PPF', 'Retirement Savings', 'investment.investments.retirement_savings', 'seed'),
  ('PRACTO', 'Practo', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('PROCESSING FEE', 'Processing Fee', 'Penalties & Processing Fees', 'expense.taxes_and_fees.penalties_and_processing_fees', 'seed'),
  ('PROFESSIONAL TAX', 'Professional Tax', 'Income & Property Tax', 'expense.taxes_and_fees.income_and_property_tax', 'seed'),
  ('PROPERTY TAX', 'Property Tax', 'Income & Property Tax', 'expense.taxes_and_fees.income_and_property_tax', 'seed'),
  ('PVR', 'PVR Cinemas', 'Movies & Events', 'expense.entertainment_and_subscriptions.movies_and_events', 'seed'),
  ('RAPIDO', 'Rapido', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('REBEL FOODS', 'Rebel Foods', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('REDBUS', 'redBus', 'Trains & Buses', 'expense.travel.trains_and_buses', 'seed'),
  ('RELIANCE DIGITAL', 'Reliance Digital', 'Electronics', 'expense.shopping.electronics', 'seed'),
  ('RELIANCE ENERGY', 'Reliance Energy', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('RELIANCE FRESH', 'Reliance Fresh', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('RELIANCE PETROL', 'Reliance Petrol', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('RELIANCE RETAIL', 'Reliance Retail', 'Shopping', 'expense.shopping', 'seed'),
  ('RTGS TRANSFER', 'RTGS Transfer', 'Bank Transfer', 'transfer.transfers.bank_transfer', 'seed'),
  ('SALON', 'Salon', 'Beauty & Personal Care', 'expense.shopping.beauty_and_personal_care', 'seed'),
  ('SBI LIFE', 'SBI Life', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('SBI SECURITIES', 'SBI Securities', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('SELF TRANSFER', 'Self Transfer', 'Self Transfer', 'transfer.transfers.self_transfer', 'seed'),
  ('SERVO', 'Servo', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('SHAREKHAN', 'Sharekhan', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('SHELL', 'Shell', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('SHOPPERS STOP', 'Shoppers Stop', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('SIMPL', 'Simpl', 'Consumer EMI', 'expense.loans_and_emi.consumer_emi', 'seed'),
  ('SIMPLILEARN', 'Simplilearn', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('SIP', 'SIP Investment', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('SKILLSHARE', 'Skillshare', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('SLICE', 'Slice', 'Credit Card Payment', 'transfer.transfers.credit_card_payment', 'seed'),
  ('SMALLCASE', 'Smallcase', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('SNAPDEAL', 'Snapdeal', 'Shopping', 'expense.shopping', 'seed'),
  ('SONY LIV', 'SonyLIV', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('SPA', 'Spa', 'Beauty & Personal Care', 'expense.shopping.beauty_and_personal_care', 'seed'),
  ('SPENCER', 'Spencers', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('SPICEJET', 'SpiceJet', 'Flights', 'expense.travel.flights', 'seed'),
  ('SPOTIFY', 'Spotify', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('SRL DIAGNOSTICS', 'SRL Diagnostics', 'Diagnostics', 'expense.health_and_medical.diagnostics', 'seed'),
  ('STAMP DUTY', 'Stamp Duty', 'Government Fees', 'expense.taxes_and_fees.government_fees', 'seed'),
  ('STAR BAZAAR', 'Star Bazaar', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('STAR HEALTH', 'Star Health', 'Health Insurance', 'expense.insurance.health_insurance', 'seed'),
  ('STARBUCKS', 'Starbucks', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('SUBWAY', 'Subway', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('SUPR DAILY', 'Supr Daily', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('SWIGGY', 'Swiggy', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('SWIGGY INSTAMART', 'Swiggy Instamart', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('TACO BELL', 'Taco Bell', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('TAJ HOTELS', 'Taj Hotels', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('TANGEDCO', 'TANGEDCO', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('TANISHQ', 'Tanishq', 'Shopping', 'expense.shopping', 'seed'),
  ('TATA AIA', 'Tata AIA', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('TATA CAPITAL', 'Tata Capital', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('TATA CLIQ', 'Tata CLiQ', 'Shopping', 'expense.shopping', 'seed'),
  ('TATA PLAY', 'Tata Play', 'TV & DTH', 'expense.housing_and_utilities.tv_and_dth', 'seed'),
  ('TATA POWER', 'Tata Power', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('TATA SKY', 'Tata Play', 'TV & DTH', 'expense.housing_and_utilities.tv_and_dth', 'seed'),
  ('TDS', 'TDS', 'Income & Property Tax', 'expense.taxes_and_fees.income_and_property_tax', 'seed'),
  ('THYROCARE', 'Thyrocare', 'Diagnostics', 'expense.health_and_medical.diagnostics', 'seed'),
  ('TIKONA', 'Tikona', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('TITAN', 'Titan', 'Electronics', 'expense.shopping.electronics', 'seed'),
  ('TOLL PLAZA', 'Toll Plaza', 'Parking & Tolls', 'expense.transport.parking_and_tolls', 'seed'),
  ('TORRENT POWER', 'Torrent Power', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('TREEBO', 'Treebo', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('UBER', 'Uber', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('UBER AUTO', 'Uber Auto', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('UBER MOTO', 'Uber Moto', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('UDEMY', 'Udemy', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('UNACADEMY', 'Unacademy', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('UNI CARD', 'Uni Card', 'Credit Card Payment', 'transfer.transfers.credit_card_payment', 'seed'),
  ('UNIQLO', 'Uniqlo', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('UPGRAD', 'upGrad', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('UPSTOX', 'Upstox', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('VEDANTU', 'Vedantu', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('VIJAY SALES', 'Vijay Sales', 'Electronics', 'expense.shopping.electronics', 'seed'),
  ('VISTARA', 'Vistara', 'Flights', 'expense.travel.flights', 'seed'),
  ('VODAFONE IDEA', 'Vi', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('VOOT', 'Voot', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('WBSEDCL', 'WBSEDCL', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('WESTSIDE', 'Westside', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('WHITEHAT JR', 'WhiteHat Jr', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('WOW MOMO', 'Wow Momo', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('YATRA', 'Yatra', 'Travel Services', 'expense.travel.travel_services', 'seed'),
  ('YOUTUBE', 'YouTube', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('YULU', 'Yulu', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('ZARA', 'Zara', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('ZEE5', 'Zee5', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('ZEPTO', 'Zepto', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('ZERODHA', 'Zerodha', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('ZEST MONEY', 'ZestMoney', 'Consumer EMI', 'expense.loans_and_emi.consumer_emi', 'seed'),
  ('ZOMATO', 'Zomato', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('ZOOM', 'Zoom', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('ZOSTEL', 'Zostel', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('MAMAEARTH', 'Mamaearth', 'Beauty & Personal Care', 'expense.shopping.beauty_and_personal_care', 'seed'),
  ('PURPLLE', 'Purplle', 'Beauty & Personal Care', 'expense.shopping.beauty_and_personal_care', 'seed'),
  ('GSTN', 'GST Network', 'Business Taxes & Fees', 'expense.business_expenses.business_taxes_and_fees', 'seed'),
  ('BLUSMART', 'BluSmart', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('JUGNOO', 'Jugnoo', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('SAVAARI', 'Savaari', 'Cab & Auto', 'expense.transport.cab_and_auto', 'seed'),
  ('AKSHAYA PATRA', 'Akshaya Patra', 'Charity & Donations', 'expense.charity_and_donations', 'seed'),
  ('CRY INDIA', 'CRY India', 'Charity & Donations', 'expense.charity_and_donations', 'seed'),
  ('GOONJ', 'Goonj', 'Charity & Donations', 'expense.charity_and_donations', 'seed'),
  ('ISKCON DONATION', 'ISKCON Donation', 'Charity & Donations', 'expense.charity_and_donations', 'seed'),
  ('UNICEF INDIA', 'UNICEF India', 'Charity & Donations', 'expense.charity_and_donations', 'seed'),
  ('FABINDIA', 'Fabindia', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('MANYAVAR', 'Manyavar', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('MAX FASHION', 'Max Fashion', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('RELIANCE TRENDS', 'Reliance Trends', 'Clothing & Footwear', 'expense.shopping.clothing_and_footwear', 'seed'),
  ('ADANI TOTAL GAS', 'Adani Total Gas', 'Cooking Gas', 'expense.housing_and_utilities.cooking_gas', 'seed'),
  ('BHARAT GAS', 'Bharat Gas', 'Cooking Gas', 'expense.housing_and_utilities.cooking_gas', 'seed'),
  ('GUJARAT GAS', 'Gujarat Gas', 'Cooking Gas', 'expense.housing_and_utilities.cooking_gas', 'seed'),
  ('HP GAS', 'HP Gas', 'Cooking Gas', 'expense.housing_and_utilities.cooking_gas', 'seed'),
  ('INDANE', 'Indane', 'Cooking Gas', 'expense.housing_and_utilities.cooking_gas', 'seed'),
  ('CLOVE DENTAL', 'Clove Dental', 'Dental & Vision', 'expense.health_and_medical.dental_and_vision', 'seed'),
  ('SABKA DENTIST', 'Sabka Dentist', 'Dental & Vision', 'expense.health_and_medical.dental_and_vision', 'seed'),
  ('APOLLO DIAGNOSTICS', 'Apollo Diagnostics', 'Diagnostics', 'expense.health_and_medical.diagnostics', 'seed'),
  ('METROPOLIS', 'Metropolis Healthcare', 'Diagnostics', 'expense.health_and_medical.diagnostics', 'seed'),
  ('VIJAYA DIAGNOSTIC', 'Vijaya Diagnostic', 'Diagnostics', 'expense.health_and_medical.diagnostics', 'seed'),
  ('ASTER HOSPITAL', 'Aster Hospital', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('CLOUDNINE', 'Cloudnine', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('KIMS HOSPITAL', 'KIMS Hospital', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('MEDIBUDDY', 'MediBuddy', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('MOTHERHOOD HOSPITAL', 'Motherhood Hospital', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('YASHODA HOSPITAL', 'Yashoda Hospital', 'Doctor & Hospital', 'expense.health_and_medical.doctor_and_hospital', 'seed'),
  ('APSPDCL', 'APSPDCL', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('BSES RAJDHANI', 'BSES Rajdhani', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('BSES YAMUNA', 'BSES Yamuna', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('DHBVN', 'DHBVN', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('GESCOM', 'GESCOM', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('MESCOM', 'MESCOM', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('PSPCL', 'PSPCL', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('TATA POWER DDL', 'Tata Power DDL', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('TSSPDCL', 'TSSPDCL', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('UHBVN', 'UHBVN', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('UPPCL', 'UPPCL', 'Electricity', 'expense.housing_and_utilities.electricity', 'seed'),
  ('CASHIFY', 'Cashify', 'Electronics', 'expense.shopping.electronics', 'seed'),
  ('POORVIKA', 'Poorvika', 'Electronics', 'expense.shopping.electronics', 'seed'),
  ('SANGEETHA MOBILES', 'Sangeetha Mobiles', 'Electronics', 'expense.shopping.electronics', 'seed'),
  ('RBI RETAIL DIRECT', 'RBI Retail Direct', 'Fixed Income & Deposits', 'investment.investments.fixed_income_and_deposits', 'seed'),
  ('WINT WEALTH', 'Wint Wealth', 'Fixed Income & Deposits', 'investment.investments.fixed_income_and_deposits', 'seed'),
  ('AIR INDIA EXPRESS', 'Air India Express', 'Flights', 'expense.travel.flights', 'seed'),
  ('ALLIANCE AIR', 'Alliance Air', 'Flights', 'expense.travel.flights', 'seed'),
  ('FLY91', 'Fly91', 'Flights', 'expense.travel.flights', 'seed'),
  ('EATSURE', 'EatSure', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('LUNCHBOX', 'LunchBox', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('MOJO PIZZA', 'MOJO Pizza', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('OVEN STORY', 'Oven Story Pizza', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('SLAY COFFEE', 'SLAY Coffee', 'Food Delivery', 'expense.food_and_dining.food_delivery', 'seed'),
  ('ATHER GRID', 'Ather Grid', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('BHARATPETROLEUM', 'Bharat Petroleum', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('HINDUSTAN PETROLEUM', 'Hindustan Petroleum', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('INDIANOIL', 'IndianOil', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('JIO BP', 'Jio-bp', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('NAYARA ENERGY', 'Nayara Energy', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('TATA POWER EZ CHARGE', 'Tata Power EZ Charge', 'Fuel', 'expense.transport.fuel', 'seed'),
  ('HOMELANE', 'HomeLane', 'Furniture & Appliances', 'expense.household.furniture_and_appliances', 'seed'),
  ('LIVSPACE', 'Livspace', 'Furniture & Appliances', 'expense.household.furniture_and_appliances', 'seed'),
  ('RENTOMOJO', 'Rentomojo', 'Furniture & Appliances', 'expense.household.furniture_and_appliances', 'seed'),
  ('URBAN LADDER', 'Urban Ladder', 'Furniture & Appliances', 'expense.household.furniture_and_appliances', 'seed'),
  ('JAR GOLD', 'Jar', 'Gold & Commodities', 'investment.investments.gold_and_commodities', 'seed'),
  ('SAFEGOLD', 'SafeGold', 'Gold & Commodities', 'investment.investments.gold_and_commodities', 'seed'),
  ('MCA SERVICES', 'MCA Services', 'Government Fees', 'expense.taxes_and_fees.government_fees', 'seed'),
  ('PARIVAHAN', 'Parivahan', 'Government Fees', 'expense.taxes_and_fees.government_fees', 'seed'),
  ('PASSPORT SEVA', 'Passport Seva', 'Government Fees', 'expense.taxes_and_fees.government_fees', 'seed'),
  ('BB NOW', 'BB Now', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('DMART READY', 'DMart Ready', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('EASYDAY', 'Easyday', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('RELIANCE SMART', 'Reliance Smart', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('VISHAL MEGA MART', 'Vishal Mega Mart', 'Groceries', 'expense.food_and_dining.groceries', 'seed'),
  ('ADITYA BIRLA HEALTH', 'Aditya Birla Health Insurance', 'Health Insurance', 'expense.insurance.health_insurance', 'seed'),
  ('HOME CENTRE', 'Home Centre', 'Home & Kitchen', 'expense.shopping.home_and_kitchen', 'seed'),
  ('HOME TOWN', 'HomeTown', 'Home & Kitchen', 'expense.shopping.home_and_kitchen', 'seed'),
  ('HDFC HOME LOAN', 'HDFC Home Loan', 'Home Loan EMI', 'expense.loans_and_emi.home_loan_emi', 'seed'),
  ('LIC HOUSING FINANCE', 'LIC Housing Finance', 'Home Loan EMI', 'expense.loans_and_emi.home_loan_emi', 'seed'),
  ('HI CARE', 'HiCare', 'Home Repairs', 'expense.household.home_repairs', 'seed'),
  ('PEST CONTROL INDIA', 'Pest Control India', 'Home Repairs', 'expense.household.home_repairs', 'seed'),
  ('CLUB MAHINDRA', 'Club Mahindra', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('GINGER HOTELS', 'Ginger Hotels', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('HOSTELLER', 'The Hosteller', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('LEMON TREE', 'Lemon Tree Hotels', 'Hotels & Stay', 'expense.travel.hotels_and_stay', 'seed'),
  ('INCOME TAX E FILING', 'Income Tax e-Filing', 'Income & Property Tax', 'expense.taxes_and_fees.income_and_property_tax', 'seed'),
  ('NSDL TAX', 'NSDL Tax', 'Income & Property Tax', 'expense.taxes_and_fees.income_and_property_tax', 'seed'),
  ('TIN NSDL', 'TIN NSDL', 'Income & Property Tax', 'expense.taxes_and_fees.income_and_property_tax', 'seed'),
  ('BAJAJ LIFE', 'Bajaj Life', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('HDFC LIFE INSURANCE', 'HDFC Life', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('LIC INDIA', 'LIC', 'Life Insurance', 'expense.insurance.life_insurance', 'seed'),
  ('APOLLO 247', 'Apollo 24/7', 'Medicines', 'expense.health_and_medical.medicines', 'seed'),
  ('TRUEMEDS', 'Truemeds', 'Medicines', 'expense.health_and_medical.medicines', 'seed'),
  ('ALLIANCE BROADBAND', 'Alliance Broadband', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('EXCITEL', 'Excitel', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('RAILWIRE', 'RailWire', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('SPECTRA', 'Spectra', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('YOU BROADBAND', 'You Broadband', 'Mobile & Internet', 'expense.housing_and_utilities.mobile_and_internet', 'seed'),
  ('DISTRICT ZOMATO', 'District by Zomato', 'Movies & Events', 'expense.entertainment_and_subscriptions.movies_and_events', 'seed'),
  ('PAYTM INSIDER', 'Paytm Insider', 'Movies & Events', 'expense.entertainment_and_subscriptions.movies_and_events', 'seed'),
  ('PVR INOX', 'PVR INOX', 'Movies & Events', 'expense.entertainment_and_subscriptions.movies_and_events', 'seed'),
  ('BSE STAR MF', 'BSE StAR MF', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('CAMS ONLINE', 'CAMS', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('KFINTECH', 'KFintech', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('MF CENTRAL', 'MF Central', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('NSE NMF', 'NSE NMF', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('SCRIPBOX', 'Scripbox', 'Mutual Funds & SIP', 'investment.investments.mutual_funds_and_sip', 'seed'),
  ('ICICI LOMBARD', 'ICICI Lombard', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('RELIANCE GENERAL', 'Reliance General Insurance', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('UNITED INDIA INSURANCE', 'United India Insurance', 'Other Insurance', 'expense.insurance.other_insurance', 'seed'),
  ('HDFC FASTAG', 'HDFC FASTag', 'Parking & Tolls', 'expense.transport.parking_and_tolls', 'seed'),
  ('ICICI FASTAG', 'ICICI FASTag', 'Parking & Tolls', 'expense.transport.parking_and_tolls', 'seed'),
  ('PARK PLUS', 'Park+', 'Parking & Tolls', 'expense.transport.parking_and_tolls', 'seed'),
  ('PAYTM FASTAG', 'Paytm FASTag', 'Parking & Tolls', 'expense.transport.parking_and_tolls', 'seed'),
  ('CASHE', 'CASHe', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('EARLYSALARY', 'EarlySalary', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('FIBE', 'Fibe', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('KISSHT', 'Kissht', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('KREDITBEE', 'KreditBee', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('MONEYVIEW', 'Moneyview', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('NAVI LOAN', 'Navi', 'Personal Loan EMI', 'expense.loans_and_emi.personal_loan_emi', 'seed'),
  ('HEADS UP FOR TAILS', 'Heads Up For Tails', 'Pets', 'expense.family_and_lifestyle.pets', 'seed'),
  ('SUPERTAILS', 'Supertails', 'Pets', 'expense.family_and_lifestyle.pets', 'seed'),
  ('ZIGLY', 'Zigly', 'Pets', 'expense.family_and_lifestyle.pets', 'seed'),
  ('APSRTC', 'APSRTC', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('HYDERABAD METRO', 'Hyderabad Metro', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('JAIPUR METRO', 'Jaipur Metro', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('KOCHI METRO', 'Kochi Metro', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('KSRTC', 'KSRTC', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('MMRDA METRO', 'Mumbai Metro', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('MSRTC', 'MSRTC', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('NOIDA METRO', 'Noida Metro', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('TNSTC', 'TNSTC', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('TSRTC', 'TSRTC', 'Public Transport', 'expense.transport.public_transport', 'seed'),
  ('BIKANERVALA', 'Bikanervala', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('PARADISE BIRYANI', 'Paradise Biryani', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('SAGAR RATNA', 'Sagar Ratna', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('SARAVANA BHAVAN', 'Saravana Bhavan', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('THEOBROMA', 'Theobroma', 'Restaurants & Cafes', 'expense.food_and_dining.restaurants_and_cafes', 'seed'),
  ('NATIONAL PENSION SYSTEM', 'National Pension System', 'Retirement Savings', 'investment.investments.retirement_savings', 'seed'),
  ('LEAD SCHOOL', 'LEAD School', 'School & College Fees', 'expense.education.school_and_college_fees', 'seed'),
  ('APPLE ICLOUD', 'Apple iCloud', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('AWS INDIA', 'Amazon Web Services India', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('FRESHWORKS', 'Freshworks', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('GODADDY', 'GoDaddy', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('GOOGLE CLOUD', 'Google Cloud', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('GOOGLE ONE', 'Google One', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('HOSTINGER', 'Hostinger', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('MICROSOFT 365', 'Microsoft 365', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('MICROSOFT AZURE', 'Microsoft Azure', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('ZOHO', 'Zoho', 'Software & Apps', 'expense.entertainment_and_subscriptions.software_and_apps', 'seed'),
  ('INDMONEY', 'INDmoney', 'Stocks & ETFs', 'investment.investments.stocks_and_etfs', 'seed'),
  ('AHA VIDEO', 'aha', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('FAN CODE', 'FanCode', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('HOICHOI', 'Hoichoi', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('MANORAMA MAX', 'ManoramaMAX', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('SUN NXT', 'Sun NXT', 'Streaming Services', 'expense.entertainment_and_subscriptions.streaming_services', 'seed'),
  ('UTS MOBILE', 'UTS Mobile', 'Trains & Buses', 'expense.travel.trains_and_buses', 'seed'),
  ('SOTC', 'SOTC', 'Travel Services', 'expense.travel.travel_services', 'seed'),
  ('THOMAS COOK', 'Thomas Cook India', 'Travel Services', 'expense.travel.travel_services', 'seed'),
  ('TRIVAGO', 'Trivago', 'Travel Services', 'expense.travel.travel_services', 'seed'),
  ('AAKASH INSTITUTE', 'Aakash Institute', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('ADDA247', 'Adda247', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('ALLEN CAREER', 'Allen Career Institute', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('NIIT', 'NIIT', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('PHYSICS WALLAH', 'Physics Wallah', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('SCALER', 'Scaler', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('TESTBOOK', 'Testbook', 'Tuition & Courses', 'expense.education.tuition_and_courses', 'seed'),
  ('SUN DIRECT', 'Sun Direct', 'TV & DTH', 'expense.housing_and_utilities.tv_and_dth', 'seed'),
  ('MAHINDRA FINANCE', 'Mahindra Finance', 'Vehicle Loan EMI', 'expense.loans_and_emi.vehicle_loan_emi', 'seed'),
  ('TVS CREDIT', 'TVS Credit', 'Vehicle Loan EMI', 'expense.loans_and_emi.vehicle_loan_emi', 'seed'),
  ('CMWSSB', 'Chennai Metro Water', 'Water', 'expense.housing_and_utilities.water', 'seed'),
  ('DELHI JAL BOARD', 'Delhi Jal Board', 'Water', 'expense.housing_and_utilities.water', 'seed'),
  ('HMWSSB', 'Hyderabad Water Board', 'Water', 'expense.housing_and_utilities.water', 'seed')
ON CONFLICT (normalized_pattern) DO UPDATE SET
  canonical_payee_name = EXCLUDED.canonical_payee_name,
  suggested_category = EXCLUDED.suggested_category,
  suggested_category_key = EXCLUDED.suggested_category_key,
  confidence_source = EXCLUDED.confidence_source
WHERE public.global_merchant_dictionary.confidence_source = 'seed';

-- Attach stable keys to any remaining compatible seed rows without changing
-- their reviewed category names.
UPDATE public.global_merchant_dictionary AS dictionary
SET suggested_category_key = template.key
FROM public.global_category_templates AS template
WHERE dictionary.confidence_source = 'seed'
  AND dictionary.suggested_category_key IS NULL
  AND lower(dictionary.suggested_category) = lower(template.name);

-- Canonical merchant rows are mirrored into global pattern categories.
INSERT INTO public.payee_pattern_categories (
  household_id,
  normalized_pattern,
  category_name,
  category_key,
  confidence,
  source
)
SELECT
  NULL,
  dictionary.normalized_pattern,
  dictionary.suggested_category,
  dictionary.suggested_category_key,
  0.90,
  'seed'
FROM public.global_merchant_dictionary AS dictionary
WHERE dictionary.confidence_source = 'seed'
  AND dictionary.suggested_category IS NOT NULL
  AND dictionary.suggested_category_key IS NOT NULL
ON CONFLICT (normalized_pattern) WHERE household_id IS NULL
DO UPDATE SET
  category_name = EXCLUDED.category_name,
  category_key = EXCLUDED.category_key,
  confidence = EXCLUDED.confidence,
  source = EXCLUDED.source,
  is_active = true,
  updated_at = now()
WHERE public.payee_pattern_categories.source = 'seed';

-- Semantic patterns represent transaction meaning, not merchant identity.
INSERT INTO public.payee_pattern_categories (
  household_id,
  normalized_pattern,
  category_name,
  category_key,
  confidence,
  source
)
VALUES
  (NULL, 'CASH DEPOSIT', 'Cash & ATM', 'transfer.transfers.cash_and_atm', 0.85, 'seed'),
  (NULL, 'CARD BILL PAYMENT', 'Credit Card Payment', 'transfer.transfers.credit_card_payment', 0.85, 'seed'),
  (NULL, 'CREDIT CARD BILL PAYMENT', 'Credit Card Payment', 'transfer.transfers.credit_card_payment', 0.85, 'seed'),
  (NULL, 'DIVIDEND CREDIT', 'Interest & Dividends', 'income.income.interest_and_dividends', 0.85, 'seed'),
  (NULL, 'INTEREST CREDIT', 'Interest & Dividends', 'income.income.interest_and_dividends', 0.85, 'seed'),
  (NULL, 'LOAN PRINCIPAL', 'Loan Principal', 'transfer.transfers.loan_principal', 0.85, 'seed'),
  (NULL, 'CASHBACK', 'Refunds & Reimbursements', 'income.income.refunds_and_reimbursements', 0.85, 'seed'),
  (NULL, 'REFUND', 'Refunds & Reimbursements', 'income.income.refunds_and_reimbursements', 0.85, 'seed'),
  (NULL, 'REIMBURSEMENT', 'Refunds & Reimbursements', 'income.income.refunds_and_reimbursements', 0.85, 'seed'),
  (NULL, 'RENTAL INCOME', 'Rental Income', 'income.income.rental_income', 0.85, 'seed'),
  (NULL, 'PAYROLL', 'Salary & Income', 'income.income.salary_and_income', 0.85, 'seed'),
  (NULL, 'SALARY', 'Salary & Income', 'income.income.salary_and_income', 0.85, 'seed'),
  (NULL, 'WALLET TOPUP', 'Wallet Top-up', 'transfer.transfers.wallet_top_up', 0.85, 'seed')
ON CONFLICT (normalized_pattern) WHERE household_id IS NULL
DO UPDATE SET
  category_name = EXCLUDED.category_name,
  category_key = EXCLUDED.category_key,
  confidence = EXCLUDED.confidence,
  source = EXCLUDED.source,
  is_active = true,
  updated_at = now()
WHERE public.payee_pattern_categories.source = 'seed';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.global_category_templates WHERE is_active) <> 98 THEN
    RAISE EXCEPTION 'Expected 98 active global category templates';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.global_category_templates child
    LEFT JOIN public.global_category_templates parent ON parent.key = child.parent_key
    WHERE child.parent_key IS NOT NULL AND parent.key IS NULL
  ) THEN
    RAISE EXCEPTION 'Global category template has a missing parent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.global_merchant_dictionary dictionary
    LEFT JOIN public.global_category_templates template
      ON template.key = dictionary.suggested_category_key
    WHERE dictionary.suggested_category_key IS NOT NULL
      AND template.key IS NULL
  ) THEN
    RAISE EXCEPTION 'Merchant dictionary contains an invalid category key';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payee_pattern_categories pattern
    LEFT JOIN public.global_category_templates template ON template.key = pattern.category_key
    WHERE pattern.category_key IS NOT NULL AND template.key IS NULL
  ) THEN
    RAISE EXCEPTION 'Pattern category contains an invalid category key';
  END IF;
END;
$$;

