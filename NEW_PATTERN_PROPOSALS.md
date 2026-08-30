# New Global Payee-Pattern Proposals â€” Review Data

Status: **IMPLEMENTED in `supabase/migrations/20260830000000_default_category_taxonomy.sql`; migration execution against the target Supabase database is still required.**

These rows fill coverage gaps in the proposed 98-row default taxonomy. Merchant/biller rows go to both `global_merchant_dictionary` and the global layer of `payee_pattern_categories`. Semantic rows such as salary or credit-card settlement go only to global PPC because they are transaction meanings, not merchants.

Rules applied:

- Exact normalized patterns only; no substring matching in the dictionary.
- Exclude generic payment rails (UPI apps) unless the narration explicitly says wallet top-up.
- Do not seed rent, gifts, or person-to-person transfers globally; those are household-specific.
- Use confidence 0.90 for merchant/biller rows and 0.85 for deterministic semantic rows.
- Proposed counts: 189 total; 176 merchant/biller rows; 13 semantic PPC-only rows.

| # | Pattern | Canonical payee | Proposed category | Target | Confidence | Rationale |
|---:|---|---|---|---|---:|---|
| 1 | MAMAEARTH | Mamaearth | Beauty & Personal Care | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 2 | PURPLLE | Purplle | Beauty & Personal Care | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 3 | GSTN | GST Network | Business Taxes & Fees | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 4 | BLUSMART | BluSmart | Cab & Auto | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 5 | JUGNOO | Jugnoo | Cab & Auto | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 6 | SAVAARI | Savaari | Cab & Auto | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 7 | CASH DEPOSIT | Cash Deposit | Cash & ATM | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 8 | AKSHAYA PATRA | Akshaya Patra | Charity & Donations | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 9 | CRY INDIA | CRY India | Charity & Donations | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 10 | GOONJ | Goonj | Charity & Donations | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 11 | ISKCON DONATION | ISKCON Donation | Charity & Donations | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 12 | UNICEF INDIA | UNICEF India | Charity & Donations | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 13 | FABINDIA | Fabindia | Clothing & Footwear | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 14 | MANYAVAR | Manyavar | Clothing & Footwear | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 15 | MAX FASHION | Max Fashion | Clothing & Footwear | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 16 | RELIANCE TRENDS | Reliance Trends | Clothing & Footwear | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 17 | ADANI TOTAL GAS | Adani Total Gas | Cooking Gas | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 18 | BHARAT GAS | Bharat Gas | Cooking Gas | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 19 | GUJARAT GAS | Gujarat Gas | Cooking Gas | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 20 | HP GAS | HP Gas | Cooking Gas | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 21 | INDANE | Indane | Cooking Gas | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 22 | CARD BILL PAYMENT | Credit Card Payment | Credit Card Payment | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 23 | CREDIT CARD BILL PAYMENT | Credit Card Payment | Credit Card Payment | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 24 | CLOVE DENTAL | Clove Dental | Dental & Vision | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 25 | SABKA DENTIST | Sabka Dentist | Dental & Vision | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 26 | APOLLO DIAGNOSTICS | Apollo Diagnostics | Diagnostics | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 27 | METROPOLIS | Metropolis Healthcare | Diagnostics | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 28 | VIJAYA DIAGNOSTIC | Vijaya Diagnostic | Diagnostics | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 29 | ASTER HOSPITAL | Aster Hospital | Doctor & Hospital | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 30 | CLOUDNINE | Cloudnine | Doctor & Hospital | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 31 | KIMS HOSPITAL | KIMS Hospital | Doctor & Hospital | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 32 | MEDIBUDDY | MediBuddy | Doctor & Hospital | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 33 | MOTHERHOOD HOSPITAL | Motherhood Hospital | Doctor & Hospital | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 34 | YASHODA HOSPITAL | Yashoda Hospital | Doctor & Hospital | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 35 | APSPDCL | APSPDCL | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 36 | BSES RAJDHANI | BSES Rajdhani | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 37 | BSES YAMUNA | BSES Yamuna | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 38 | DHBVN | DHBVN | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 39 | GESCOM | GESCOM | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 40 | MESCOM | MESCOM | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 41 | PSPCL | PSPCL | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 42 | TATA POWER DDL | Tata Power DDL | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 43 | TSSPDCL | TSSPDCL | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 44 | UHBVN | UHBVN | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 45 | UPPCL | UPPCL | Electricity | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 46 | CASHIFY | Cashify | Electronics | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 47 | POORVIKA | Poorvika | Electronics | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 48 | SANGEETHA MOBILES | Sangeetha Mobiles | Electronics | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 49 | RBI RETAIL DIRECT | RBI Retail Direct | Fixed Income & Deposits | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 50 | WINT WEALTH | Wint Wealth | Fixed Income & Deposits | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 51 | AIR INDIA EXPRESS | Air India Express | Flights | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 52 | ALLIANCE AIR | Alliance Air | Flights | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 53 | FLY91 | Fly91 | Flights | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 54 | EATSURE | EatSure | Food Delivery | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 55 | LUNCHBOX | LunchBox | Food Delivery | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 56 | MOJO PIZZA | MOJO Pizza | Food Delivery | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 57 | OVEN STORY | Oven Story Pizza | Food Delivery | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 58 | SLAY COFFEE | SLAY Coffee | Food Delivery | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 59 | ATHER GRID | Ather Grid | Fuel | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 60 | BHARATPETROLEUM | Bharat Petroleum | Fuel | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 61 | HINDUSTAN PETROLEUM | Hindustan Petroleum | Fuel | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 62 | INDIANOIL | IndianOil | Fuel | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 63 | JIO BP | Jio-bp | Fuel | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 64 | NAYARA ENERGY | Nayara Energy | Fuel | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 65 | TATA POWER EZ CHARGE | Tata Power EZ Charge | Fuel | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 66 | HOMELANE | HomeLane | Furniture & Appliances | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 67 | LIVSPACE | Livspace | Furniture & Appliances | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 68 | RENTOMOJO | Rentomojo | Furniture & Appliances | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 69 | URBAN LADDER | Urban Ladder | Furniture & Appliances | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 70 | JAR GOLD | Jar | Gold & Commodities | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 71 | SAFEGOLD | SafeGold | Gold & Commodities | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 72 | MCA SERVICES | MCA Services | Government Fees | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 73 | PARIVAHAN | Parivahan | Government Fees | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 74 | PASSPORT SEVA | Passport Seva | Government Fees | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 75 | BB NOW | BB Now | Groceries | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 76 | DMART READY | DMart Ready | Groceries | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 77 | EASYDAY | Easyday | Groceries | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 78 | RELIANCE SMART | Reliance Smart | Groceries | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 79 | VISHAL MEGA MART | Vishal Mega Mart | Groceries | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 80 | ADITYA BIRLA HEALTH | Aditya Birla Health Insurance | Health Insurance | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 81 | HOME CENTRE | Home Centre | Home & Kitchen | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 82 | HOME TOWN | HomeTown | Home & Kitchen | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 83 | HDFC HOME LOAN | HDFC Home Loan | Home Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 84 | LIC HOUSING FINANCE | LIC Housing Finance | Home Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 85 | HI CARE | HiCare | Home Repairs | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 86 | PEST CONTROL INDIA | Pest Control India | Home Repairs | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 87 | CLUB MAHINDRA | Club Mahindra | Hotels & Stay | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 88 | GINGER HOTELS | Ginger Hotels | Hotels & Stay | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 89 | HOSTELLER | The Hosteller | Hotels & Stay | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 90 | LEMON TREE | Lemon Tree Hotels | Hotels & Stay | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 91 | INCOME TAX E FILING | Income Tax e-Filing | Income & Property Tax | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 92 | NSDL TAX | NSDL Tax | Income & Property Tax | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 93 | TIN NSDL | TIN NSDL | Income & Property Tax | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 94 | DIVIDEND CREDIT | Dividend Credit | Interest & Dividends | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 95 | INTEREST CREDIT | Interest Credit | Interest & Dividends | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 96 | BAJAJ LIFE | Bajaj Life | Life Insurance | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 97 | HDFC LIFE INSURANCE | HDFC Life | Life Insurance | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 98 | LIC INDIA | LIC | Life Insurance | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 99 | LOAN PRINCIPAL | Loan Principal | Loan Principal | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 100 | APOLLO 247 | Apollo 24/7 | Medicines | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 101 | TRUEMEDS | Truemeds | Medicines | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 102 | ALLIANCE BROADBAND | Alliance Broadband | Mobile & Internet | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 103 | EXCITEL | Excitel | Mobile & Internet | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 104 | RAILWIRE | RailWire | Mobile & Internet | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 105 | SPECTRA | Spectra | Mobile & Internet | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 106 | YOU BROADBAND | You Broadband | Mobile & Internet | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 107 | DISTRICT ZOMATO | District by Zomato | Movies & Events | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 108 | PAYTM INSIDER | Paytm Insider | Movies & Events | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 109 | PVR INOX | PVR INOX | Movies & Events | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 110 | BSE STAR MF | BSE StAR MF | Mutual Funds & SIP | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 111 | CAMS ONLINE | CAMS | Mutual Funds & SIP | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 112 | KFINTECH | KFintech | Mutual Funds & SIP | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 113 | MF CENTRAL | MF Central | Mutual Funds & SIP | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 114 | NSE NMF | NSE NMF | Mutual Funds & SIP | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 115 | SCRIPBOX | Scripbox | Mutual Funds & SIP | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 116 | ICICI LOMBARD | ICICI Lombard | Other Insurance | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 117 | RELIANCE GENERAL | Reliance General Insurance | Other Insurance | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 118 | UNITED INDIA INSURANCE | United India Insurance | Other Insurance | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 119 | HDFC FASTAG | HDFC FASTag | Parking & Tolls | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 120 | ICICI FASTAG | ICICI FASTag | Parking & Tolls | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 121 | PARK PLUS | Park+ | Parking & Tolls | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 122 | PAYTM FASTAG | Paytm FASTag | Parking & Tolls | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 123 | CASHE | CASHe | Personal Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 124 | EARLYSALARY | EarlySalary | Personal Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 125 | FIBE | Fibe | Personal Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 126 | KISSHT | Kissht | Personal Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 127 | KREDITBEE | KreditBee | Personal Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 128 | MONEYVIEW | Moneyview | Personal Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 129 | NAVI LOAN | Navi | Personal Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 130 | HEADS UP FOR TAILS | Heads Up For Tails | Pets | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 131 | SUPERTAILS | Supertails | Pets | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 132 | ZIGLY | Zigly | Pets | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 133 | APSRTC | APSRTC | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 134 | HYDERABAD METRO | Hyderabad Metro | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 135 | JAIPUR METRO | Jaipur Metro | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 136 | KOCHI METRO | Kochi Metro | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 137 | KSRTC | KSRTC | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 138 | MMRDA METRO | Mumbai Metro | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 139 | MSRTC | MSRTC | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 140 | NOIDA METRO | Noida Metro | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 141 | TNSTC | TNSTC | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 142 | TSRTC | TSRTC | Public Transport | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 143 | CASHBACK | Cashback | Refunds & Reimbursements | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 144 | REFUND | Refund | Refunds & Reimbursements | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 145 | REIMBURSEMENT | Reimbursement | Refunds & Reimbursements | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 146 | RENTAL INCOME | Rental Income | Rental Income | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 147 | BIKANERVALA | Bikanervala | Restaurants & Cafes | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 148 | PARADISE BIRYANI | Paradise Biryani | Restaurants & Cafes | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 149 | SAGAR RATNA | Sagar Ratna | Restaurants & Cafes | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 150 | SARAVANA BHAVAN | Saravana Bhavan | Restaurants & Cafes | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 151 | THEOBROMA | Theobroma | Restaurants & Cafes | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 152 | NATIONAL PENSION SYSTEM | National Pension System | Retirement Savings | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 153 | PAYROLL | Payroll Credit | Salary & Income | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 154 | SALARY | Salary Credit | Salary & Income | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 155 | LEAD SCHOOL | LEAD School | School & College Fees | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 156 | APPLE ICLOUD | Apple iCloud | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 157 | AWS INDIA | Amazon Web Services India | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 158 | FRESHWORKS | Freshworks | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 159 | GODADDY | GoDaddy | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 160 | GOOGLE CLOUD | Google Cloud | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 161 | GOOGLE ONE | Google One | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 162 | HOSTINGER | Hostinger | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 163 | MICROSOFT 365 | Microsoft 365 | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 164 | MICROSOFT AZURE | Microsoft Azure | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 165 | ZOHO | Zoho | Software & Apps | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 166 | INDMONEY | INDmoney | Stocks & ETFs | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 167 | AHA VIDEO | aha | Streaming Services | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 168 | FAN CODE | FanCode | Streaming Services | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 169 | HOICHOI | Hoichoi | Streaming Services | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 170 | MANORAMA MAX | ManoramaMAX | Streaming Services | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 171 | SUN NXT | Sun NXT | Streaming Services | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 172 | UTS MOBILE | UTS Mobile | Trains & Buses | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 173 | SOTC | SOTC | Travel Services | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 174 | THOMAS COOK | Thomas Cook India | Travel Services | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 175 | TRIVAGO | Trivago | Travel Services | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 176 | AAKASH INSTITUTE | Aakash Institute | Tuition & Courses | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 177 | ADDA247 | Adda247 | Tuition & Courses | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 178 | ALLEN CAREER | Allen Career Institute | Tuition & Courses | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 179 | NIIT | NIIT | Tuition & Courses | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 180 | PHYSICS WALLAH | Physics Wallah | Tuition & Courses | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 181 | SCALER | Scaler | Tuition & Courses | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 182 | TESTBOOK | Testbook | Tuition & Courses | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 183 | SUN DIRECT | Sun Direct | TV & DTH | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 184 | MAHINDRA FINANCE | Mahindra Finance | Vehicle Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 185 | TVS CREDIT | TVS Credit | Vehicle Loan EMI | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 186 | WALLET TOPUP | Wallet Top-up | Wallet Top-up | global PPC only | 0.85 | Semantic transaction pattern; not a merchant dictionary entry. |
| 187 | CMWSSB | Chennai Metro Water | Water | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 188 | DELHI JAL BOARD | Delhi Jal Board | Water | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
| 189 | HMWSSB | Hyderabad Water Board | Water | GMD + global PPC | 0.90 | High-specificity merchant, biller or product narration. |
