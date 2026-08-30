# Default Category & Global Pattern Reconciliation â€” Review Plan

Status: **IMPLEMENTED in `20260830000000_default_category_taxonomy.sql`; migration execution against the target Supabase database is still required.**

## Executive recommendation

Reduce the attached 2,466-row taxonomy to **98 unique default rows** with at most two levels. The defaults stay personal-finance-first while retaining a compact business branch. Category names are globally unique, so the current name-based resolver remains deterministic.

Source audit:

- 2,466 rows: 2,101 expense, 175 income, 100 investment, 90 transfer.
- 1,864 personal-scope and 602 business-scope rows.
- 226 duplicate-name groups covering 576 rows.
- 429 parent references point to a name that appears more than once, so the supplied parent-name format cannot reconstruct every path unambiguously.
- All rows have `is_hidden=false`; tax codes are empty.

## Architecture decision proposed for approval

1. Add a versioned `global_category_templates` table with stable `key`, `parent_key`, `name`, `kind`, `scope`, `sort_order`, `description`, and `is_active`.
2. Add nullable `template_key` to household `categories`, unique per household when present.
3. Rewrite `seed_default_categories()` to copy active global templates, parent first and child second.
4. For existing households, add missing template categories only. Do **not** rename, delete, reparent, or overwrite customized categories.
5. Keep `suggested_category` / `category_name` for compatibility, but add stable `suggested_category_key` to `global_merchant_dictionary` and `category_key` to `payee_pattern_categories`.
6. Change seed upserts from `DO NOTHING` to `DO UPDATE` for rows where `confidence_source='seed'`. Never overwrite `user_confirmed` or household-scoped rows.
7. Synchronize global `payee_pattern_categories` with the canonical global dictionary in the same migration.
8. Align `PIPELINE_CATEGORIES`, keyword resolver aliases, import prompts, and category seed tests with the approved template.

## Source taxonomy reconciliation policy

The complete CSV is used as a coverage checklist, not copied as defaults:

| Source branch | Compact destination |
|---|---|
| Food & Dining + Groceries & Daily Needs | Food & Dining and its 3 children |
| Transportation & Commute + Vehicle Ownership | Transport and its 5 children |
| Housing & Rent + Household Utilities | Housing & Utilities and its 7 children |
| Domestic Help + Home/Furniture/Appliances | Household and its 3 children |
| Health & Medical | Health & Medical and its 4 children |
| Insurance | Insurance and its 4 children |
| Education + Professional Development | Education and its 3 children |
| Clothing, Electronics, Personal Care, Children | Shopping and its 5 children |
| Entertainment + Subscriptions | Entertainment & Subscriptions and its 4 children |
| Travel & Holidays | Travel and its 4 children |
| Festivals, Events, Gifts, Pets, Elder Care | Family & Lifestyle and its 4 children |
| Loans & EMIs | Loans & EMI and its 4 children |
| Banking Fees + Taxes/Government | Taxes & Fees and its 4 children |
| 11 business-expense branches | Business Expenses and its 8 children |
| Personal/Business income branches | Income and its 6 children |
| Personal/Business investments | Investments and its 5 children |
| Personal/Business transfers + Savings + Cash | Transfers and its 6 children |
| UPI & Digital Payments | **No spend category**; resolve the underlying merchant or leave uncategorized |

## Proposed exact default category data (98 rows)

| # | Kind | Parent | Name | Purpose |
|---:|---|---|---|---|
| 1 | expense | â€” | Food & Dining | Everyday food spending |
| 2 | expense | Food & Dining | Groceries | Supermarkets, kirana, meat, dairy and household food |
| 3 | expense | Food & Dining | Restaurants & Cafes | Dine-in, takeaway, cafes and quick-service restaurants |
| 4 | expense | Food & Dining | Food Delivery | Prepared-food delivery and cloud kitchens |
| 5 | expense | â€” | Transport | Local commute and vehicle running costs |
| 6 | expense | Transport | Cab & Auto | Taxi, auto-rickshaw and bike taxi |
| 7 | expense | Transport | Public Transport | Bus and metro |
| 8 | expense | Transport | Fuel | Petrol, diesel, CNG and EV charging |
| 9 | expense | Transport | Parking & Tolls | Parking, tolls and FASTag |
| 10 | expense | Transport | Vehicle Maintenance | Service, repairs, tyres and spares |
| 11 | expense | â€” | Housing & Utilities | Home occupancy and recurring utilities |
| 12 | expense | Housing & Utilities | Rent | Home rent and rental platforms |
| 13 | expense | Housing & Utilities | Society Maintenance | Apartment and housing-society charges |
| 14 | expense | Housing & Utilities | Electricity | Electricity bills |
| 15 | expense | Housing & Utilities | Water | Water bills |
| 16 | expense | Housing & Utilities | Cooking Gas | Piped gas and LPG |
| 17 | expense | Housing & Utilities | Mobile & Internet | Mobile, landline and broadband |
| 18 | expense | Housing & Utilities | TV & DTH | DTH and cable television |
| 19 | expense | â€” | Household | Home services and durable goods |
| 20 | expense | Household | Domestic Help | Maid, cook, driver and household staff |
| 21 | expense | Household | Home Repairs | Cleaning, repairs, pest control and maintenance |
| 22 | expense | Household | Furniture & Appliances | Furniture, appliances and home improvement |
| 23 | expense | â€” | Health & Medical | Healthcare excluding insurance premiums |
| 24 | expense | Health & Medical | Doctor & Hospital | Consultations, procedures and hospitalization |
| 25 | expense | Health & Medical | Medicines | Pharmacy and medicine purchases |
| 26 | expense | Health & Medical | Diagnostics | Labs, scans and health tests |
| 27 | expense | Health & Medical | Dental & Vision | Dentist, optical and eye care |
| 28 | expense | â€” | Insurance | Insurance premium payments |
| 29 | expense | Insurance | Health Insurance | Health and medical insurance |
| 30 | expense | Insurance | Life Insurance | Term, endowment and life policies |
| 31 | expense | Insurance | Vehicle Insurance | Motor and two-wheeler insurance |
| 32 | expense | Insurance | Other Insurance | Travel, home and general insurance |
| 33 | expense | â€” | Education | Formal education and skills |
| 34 | expense | Education | School & College Fees | School, college and institutional fees |
| 35 | expense | Education | Tuition & Courses | Coaching, online courses and tuition |
| 36 | expense | Education | Books & Supplies | Books, uniforms and learning supplies |
| 37 | expense | â€” | Shopping | Personal and household retail |
| 38 | expense | Shopping | Clothing & Footwear | Apparel, footwear and accessories |
| 39 | expense | Shopping | Electronics | Devices and consumer electronics |
| 40 | expense | Shopping | Home & Kitchen | Homeware, kitchenware and decor |
| 41 | expense | Shopping | Beauty & Personal Care | Salon, spa, cosmetics and grooming |
| 42 | expense | Shopping | Kids & Baby | Baby products, toys and children's retail |
| 43 | expense | â€” | Entertainment & Subscriptions | Leisure and recurring digital services |
| 44 | expense | Entertainment & Subscriptions | Movies & Events | Cinema, concerts, events and tickets |
| 45 | expense | Entertainment & Subscriptions | Streaming Services | Video, music and news streaming |
| 46 | expense | Entertainment & Subscriptions | Software & Apps | Productivity software, cloud and app subscriptions |
| 47 | expense | Entertainment & Subscriptions | Games & Hobbies | Gaming, sports and hobbies |
| 48 | expense | â€” | Travel | Outstation and holiday travel |
| 49 | expense | Travel | Flights | Air tickets and airline charges |
| 50 | expense | Travel | Trains & Buses | Rail and intercity bus travel |
| 51 | expense | Travel | Hotels & Stay | Hotels, hostels and holiday accommodation |
| 52 | expense | Travel | Travel Services | Booking portals, tours, visa and travel services |
| 53 | expense | â€” | Family & Lifestyle | Social, family and lifestyle commitments |
| 54 | expense | Family & Lifestyle | Gifts | Personal gifts and social obligations |
| 55 | expense | Family & Lifestyle | Festivals & Religious | Festivals, ceremonies and religious expenses |
| 56 | expense | Family & Lifestyle | Weddings & Functions | Weddings, parties and functions |
| 57 | expense | Family & Lifestyle | Pets | Pet food, healthcare and supplies |
| 58 | expense | â€” | Loans & EMI | Debt servicing excluding credit-card settlement |
| 59 | expense | Loans & EMI | Home Loan EMI | Home-loan EMI and interest |
| 60 | expense | Loans & EMI | Vehicle Loan EMI | Vehicle-loan EMI and interest |
| 61 | expense | Loans & EMI | Personal Loan EMI | Personal, gold and education-loan EMI |
| 62 | expense | Loans & EMI | Consumer EMI | BNPL and consumer-durable EMI |
| 63 | expense | â€” | Taxes & Fees | Taxes, banking and statutory fees |
| 64 | expense | Taxes & Fees | Income & Property Tax | Income, advance and property tax |
| 65 | expense | Taxes & Fees | Bank Charges | Bank and card charges |
| 66 | expense | Taxes & Fees | Government Fees | Stamp duty and government service fees |
| 67 | expense | Taxes & Fees | Penalties & Processing Fees | Late, convenience, processing and foreclosure fees |
| 68 | expense | â€” | Business Expenses | Compact business-expense defaults |
| 69 | expense | Business Expenses | Office & Coworking | Office rent, utilities and coworking |
| 70 | expense | Business Expenses | Inventory & Supplies | Inventory, raw material, packaging and logistics |
| 71 | expense | Business Expenses | Payroll & Contractors | Payroll, contractors and employee costs |
| 72 | expense | Business Expenses | Marketing & Sales | Advertising, promotions and commissions |
| 73 | expense | Business Expenses | Professional Services | Legal, accounting, consulting and audit |
| 74 | expense | Business Expenses | Software & SaaS | Business software, cloud and hosting |
| 75 | expense | Business Expenses | Business Travel | Business travel and client entertainment |
| 76 | expense | Business Expenses | Business Taxes & Fees | GST, compliance, licences and business banking fees |
| 77 | expense | â€” | Charity & Donations | Verified charity and donation payments |
| 78 | expense | â€” | Uncategorized | Fallback only; never an AI-preferred category |
| 79 | income | â€” | Income | All incoming money |
| 80 | income | Income | Salary & Income | Salary, wages, bonus and pension |
| 81 | income | Income | Business Income | Sales, freelance and professional receipts |
| 82 | income | Income | Interest & Dividends | Interest, dividends and capital distributions |
| 83 | income | Income | Rental Income | Property rental receipts |
| 84 | income | Income | Refunds & Reimbursements | Refunds, cashback and reimbursements |
| 85 | income | Income | Other Income | Income not covered elsewhere |
| 86 | investment | â€” | Investments | Asset purchases and long-term savings |
| 87 | investment | Investments | Mutual Funds & SIP | Mutual funds and systematic plans |
| 88 | investment | Investments | Stocks & ETFs | Brokerage, stocks and exchange-traded funds |
| 89 | investment | Investments | Fixed Income & Deposits | FD, RD, bonds and debt products |
| 90 | investment | Investments | Retirement Savings | PPF, EPF and NPS |
| 91 | investment | Investments | Gold & Commodities | Digital gold, sovereign gold and commodities |
| 92 | transfer | â€” | Transfers | Non-income/non-expense money movement |
| 93 | transfer | Transfers | Self Transfer | Transfers between own accounts |
| 94 | transfer | Transfers | Bank Transfer | NEFT, IMPS and RTGS transfers without a merchant purpose |
| 95 | transfer | Transfers | Wallet Top-up | Loading a wallet or prepaid balance |
| 96 | transfer | Transfers | Credit Card Payment | Credit-card bill settlement |
| 97 | transfer | Transfers | Cash & ATM | Cash withdrawal and cash deposit |
| 98 | transfer | Transfers | Loan Principal | Principal-only debt movement when separately identified |

## Implemented migration sequence

1. Create template/key columns and constraints.
2. Insert the approved 98-row global taxonomy.
3. Replace `seed_default_categories()`.
4. Backfill only missing template categories for existing households.
5. Upsert merchant seed corrections from the companion review table.
6. Remove only explicitly approved unsafe **seed** patterns.
7. Insert approved new global patterns and sync global PPC rows.
8. Add reconciliation assertions: unique pattern, valid category key, no missing parent, no duplicate template name, no household rows touched.
9. Update resolver constants/tests and run the full build + import regression suite.
10. Deploy migration only after a dry-run report shows expected row counts.

## Approval decisions applied

- The 98-row hierarchy is implemented, including the compact Business Expenses branch.
- All `UPSERT` rows and the six seed-only `REMOVE` rows are implemented.
- The nine `REVIEW` patterns remain unchanged because they are intentionally ambiguous.
- All 189 high-precision new patterns are implemented; semantic patterns are global-PPC-only.

