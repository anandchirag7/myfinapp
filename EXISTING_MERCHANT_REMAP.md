# Existing Global Merchant Seed Remap â€” Review Data

Source: the 76 original seeds plus the 259 value rows in `20260829000000_payee_pattern_categories.sql`.

- Unique normalized patterns: **334**
- Implemented automatic upserts: **319**
- Human-review rows: **9**
- Implemented seed-only removals: **6**
- Implemented by `supabase/migrations/20260830000000_default_category_taxonomy.sql`; the 9 `REVIEW` rows remain untouched.

`REMOVE` means delete only when `confidence_source='seed'`, and delete the matching global PPC row only when `household_id IS NULL` and `source='seed'`.

| # | Pattern | Canonical payee | Current category | Proposed category | Action | Review note |
|---:|---|---|---|---|---|---|
| 1 | 1MG | Tata 1mg | Health & Medical | Medicines | UPSERT | â€” |
| 2 | 5PAISA | 5Paisa | Investments | Stocks & ETFs | UPSERT | â€” |
| 3 | 99ACRES | 99acres | Housing & Rent | Rent | UPSERT | â€” |
| 4 | ABHIBUS | AbhiBus | Travel | Trains & Buses | UPSERT | â€” |
| 5 | ACKO | Acko | Insurance | Other Insurance | UPSERT | â€” |
| 6 | ACT FIBERNET | ACT Fibernet | Bills & Utilities | Mobile & Internet | UPSERT | â€” |
| 7 | ADANI ELECTRICITY | Adani Electricity | Bills & Utilities | Electricity | UPSERT | â€” |
| 8 | ADOBE | Adobe | Subscriptions | Software & Apps | UPSERT | â€” |
| 9 | ADVANCE TAX | Advance Tax | Taxes | Income & Property Tax | UPSERT | â€” |
| 10 | AGODA | Agoda | Travel | Hotels & Stay | UPSERT | â€” |
| 11 | AIR INDIA | Air India | Travel | Flights | UPSERT | â€” |
| 12 | AIRASIA | AirAsia | Travel | Flights | UPSERT | â€” |
| 13 | AIRBNB | Airbnb | Travel | Hotels & Stay | UPSERT | â€” |
| 14 | AIRTEL | Airtel | Bills & Utilities | Mobile & Internet | UPSERT | â€” |
| 15 | AIRTEL DTH | Airtel DTH | Bills & Utilities | TV & DTH | UPSERT | â€” |
| 16 | AJIO | Ajio | Shopping | Clothing & Footwear | UPSERT | â€” |
| 17 | AKASA AIR | Akasa Air | Travel | Flights | UPSERT | â€” |
| 18 | ALT BALAJI | ALTBalaji | Entertainment | Streaming Services | UPSERT | â€” |
| 19 | AMAZON | Amazon | Shopping | Shopping | REVIEW | Amazon spans groceries, shopping, subscriptions and digital purchases. |
| 20 | AMAZON FRESH | Amazon Fresh | Groceries | Groceries | UPSERT | â€” |
| 21 | AMAZON PANTRY | Amazon Pantry | Groceries | Groceries | UPSERT | â€” |
| 22 | AMAZON PAY | Amazon Pay | Shopping | Shopping | REVIEW | Payment rail is not a purchase purpose. |
| 23 | AMAZON PAY WALLET | Amazon Pay Wallet | Transfers | Wallet Top-up | UPSERT | â€” |
| 24 | AMAZON PRIME | Amazon Prime | Subscriptions | Streaming Services | UPSERT | â€” |
| 25 | ANGEL BROKING | Angel One | Investments | Stocks & ETFs | UPSERT | â€” |
| 26 | ANGEL ONE | Angel One | Investments | Stocks & ETFs | UPSERT | â€” |
| 27 | ANNUAL FEE | Annual Fee | Fees & Charges | Penalties & Processing Fees | UPSERT | â€” |
| 28 | APARTMENTADDA | ApartmentAdda | Housing & Rent | Society Maintenance | UPSERT | â€” |
| 29 | APOLLO HOSPITAL | Apollo Hospital | Health & Medical | Doctor & Hospital | UPSERT | â€” |
| 30 | APOLLO PHARMACY | Apollo Pharmacy | Health & Medical | Medicines | UPSERT | â€” |
| 31 | APPLE | Apple | Subscriptions | Software & Apps | REVIEW | Generic platform name can represent hardware, ads, apps or subscriptions. |
| 32 | ATM CASH | ATM Withdrawal | Cash & ATM | Cash & ATM | UPSERT | â€” |
| 33 | ATM WDL | ATM Withdrawal | Cash & ATM | Cash & ATM | UPSERT | â€” |
| 34 | BAJAJ ALLIANZ | Bajaj Allianz | Insurance | Other Insurance | UPSERT | â€” |
| 35 | BAJAJ FINANCE | Bajaj Finance | Loans & EMI | Personal Loan EMI | UPSERT | â€” |
| 36 | BAJAJ FINSERV | Bajaj Finserv | Loans & EMI | Personal Loan EMI | UPSERT | â€” |
| 37 | BANGALORE WATER | Bangalore Water | Bills & Utilities | Water | UPSERT | â€” |
| 38 | BARBEQUE NATION | Barbeque Nation | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 39 | BARISTA | Barista | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 40 | BASKIN ROBBINS | Baskin Robbins | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 41 | BATA | Bata | Shopping | Clothing & Footwear | UPSERT | â€” |
| 42 | BBMP | BBMP | Bills & Utilities | Government Fees | UPSERT | Civic authority; property-tax patterns should be more specific. |
| 43 | BEHROUZ | Behrouz Biryani | Food & Dining | Food Delivery | UPSERT | â€” |
| 44 | BESCOM | BESCOM | Bills & Utilities | Electricity | UPSERT | â€” |
| 45 | BEST BUS | BEST Bus | Transport | Public Transport | UPSERT | â€” |
| 46 | BEWAKOOF | Bewakoof | Shopping | Clothing & Footwear | UPSERT | â€” |
| 47 | BHARAT PETROLEUM | Bharat Petroleum | Fuel | Fuel | UPSERT | â€” |
| 48 | BHIM | BHIM | Transfers | â€” | REMOVE | Payment rail does not identify transaction purpose. |
| 49 | BIGBASKET | BigBasket | Groceries | Groceries | UPSERT | â€” |
| 50 | BLINKIT | Blinkit | Groceries | Groceries | UPSERT | â€” |
| 51 | BMTC | BMTC | Transport | Public Transport | UPSERT | â€” |
| 52 | BODYCRAFT | Bodycraft | Personal Care | Beauty & Personal Care | UPSERT | â€” |
| 53 | BOOKING COM | Booking.com | Travel | Hotels & Stay | UPSERT | â€” |
| 54 | BOOKMYSHOW | BookMyShow | Entertainment | Movies & Events | UPSERT | â€” |
| 55 | BOUNCE | Bounce | Transport | Cab & Auto | UPSERT | â€” |
| 56 | BOX8 | Box8 | Food & Dining | Food Delivery | UPSERT | â€” |
| 57 | BPCL | BPCL | Fuel | Fuel | UPSERT | â€” |
| 58 | BSNL | BSNL | Bills & Utilities | Mobile & Internet | UPSERT | â€” |
| 59 | BURGER KING | Burger King | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 60 | BWSSB | BWSSB | Bills & Utilities | Water | UPSERT | â€” |
| 61 | BYJUS | Byjus | Education | Tuition & Courses | UPSERT | â€” |
| 62 | CAFE COFFEE DAY | Cafe Coffee Day | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 63 | CANVA | Canva | Subscriptions | Software & Apps | UPSERT | â€” |
| 64 | CARE HEALTH | Care Health | Insurance | Health Insurance | UPSERT | â€” |
| 65 | CASH WITHDRAWAL | Cash Withdrawal | Cash & ATM | Cash & ATM | UPSERT | â€” |
| 66 | CCD | Cafe Coffee Day | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 67 | CESC | CESC | Bills & Utilities | Electricity | UPSERT | â€” |
| 68 | CHAAYOS | Chaayos | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 69 | CHAI POINT | Chai Point | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 70 | CHATGPT | ChatGPT | Subscriptions | Software & Apps | UPSERT | â€” |
| 71 | CHENNAI METRO | Chennai Metro | Transport | Public Transport | UPSERT | â€” |
| 72 | CHUMBAK | Chumbak | Shopping | Home & Kitchen | UPSERT | â€” |
| 73 | CINEPOLIS | Cinepolis | Entertainment | Movies & Events | UPSERT | â€” |
| 74 | CLEARTRIP | Cleartrip | Travel | Travel Services | UPSERT | â€” |
| 75 | COIN ZERODHA | Zerodha Coin | Investments | Mutual Funds & SIP | UPSERT | â€” |
| 76 | CONVENIENCE FEE | Convenience Fee | Fees & Charges | Penalties & Processing Fees | UPSERT | â€” |
| 77 | COUNTRY DELIGHT | Country Delight | Groceries | Groceries | UPSERT | â€” |
| 78 | COURSERA | Coursera | Education | Tuition & Courses | UPSERT | â€” |
| 79 | CRED | CRED | Loans & EMI | Credit Card Payment | UPSERT | â€” |
| 80 | CROMA | Croma | Shopping | Electronics | UPSERT | â€” |
| 81 | CULT FIT | Cultfit | Health & Medical | Games & Hobbies | UPSERT | â€” |
| 82 | D2H | D2H | Bills & Utilities | TV & DTH | UPSERT | â€” |
| 83 | DECATHLON | Decathlon | Shopping | Shopping | UPSERT | â€” |
| 84 | DELHI METRO | Delhi Metro | Transport | Public Transport | UPSERT | â€” |
| 85 | DHAN | Dhan | Investments | Stocks & ETFs | UPSERT | â€” |
| 86 | DIGIT INSURANCE | Digit Insurance | Insurance | Other Insurance | UPSERT | â€” |
| 87 | DISH TV | Dish TV | Bills & Utilities | TV & DTH | UPSERT | â€” |
| 88 | DMART | DMart | Groceries | Groceries | UPSERT | â€” |
| 89 | DOMINOS | Dominos Pizza | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 90 | DR LAL PATH | Dr Lal PathLabs | Health & Medical | Diagnostics | UPSERT | â€” |
| 91 | DROPBOX | Dropbox | Subscriptions | Software & Apps | UPSERT | â€” |
| 92 | DUNZO | Dunzo | Groceries | Groceries | REVIEW | Courier/quick-commerce use is ambiguous. |
| 93 | DUOLINGO | Duolingo | Education | Tuition & Courses | UPSERT | â€” |
| 94 | EASEMYTRIP | EaseMyTrip | Travel | Travel Services | UPSERT | â€” |
| 95 | EAT FIT | EatFit | Food & Dining | Food Delivery | UPSERT | â€” |
| 96 | ET MONEY | ET Money | Investments | Mutual Funds & SIP | UPSERT | â€” |
| 97 | EXPRESSVPN | ExpressVPN | Subscriptions | Software & Apps | UPSERT | â€” |
| 98 | FAASOS | Faasos | Food & Dining | Food Delivery | UPSERT | â€” |
| 99 | FABHOTELS | FabHotels | Travel | Hotels & Stay | UPSERT | â€” |
| 100 | FASTAG | FASTag | Transport | Parking & Tolls | UPSERT | â€” |
| 101 | FI MONEY | Fi Money | Loans & EMI | Bank Transfer | REMOVE | Banking apps are not loan merchants. |
| 102 | FIRST CRY | FirstCry | Shopping | Kids & Baby | UPSERT | â€” |
| 103 | FIRSTCRY | FirstCry | Kids & Family | Kids & Baby | UPSERT | â€” |
| 104 | FLIPKART | Flipkart | Shopping | Shopping | UPSERT | â€” |
| 105 | FLIPKART GROCERY | Flipkart Grocery | Groceries | Groceries | UPSERT | â€” |
| 106 | FORECLOSURE | Foreclosure Charge | Fees & Charges | Penalties & Processing Fees | UPSERT | â€” |
| 107 | FORTIS | Fortis | Health & Medical | Doctor & Hospital | UPSERT | â€” |
| 108 | FREECHARGE | FreeCharge | Transfers | Wallet Top-up | UPSERT | â€” |
| 109 | FRESHMENU | FreshMenu | Groceries | Food Delivery | UPSERT | â€” |
| 110 | GAIL GAS | GAIL Gas | Bills & Utilities | Cooking Gas | UPSERT | â€” |
| 111 | GITHUB | GitHub | Subscriptions | Software & Apps | UPSERT | â€” |
| 112 | GIVE INDIA | GiveIndia | Gifts & Donations | Charity & Donations | UPSERT | â€” |
| 113 | GOAIR | Go First | Travel | Flights | UPSERT | â€” |
| 114 | GOIBIBO | Goibibo | Travel | Travel Services | UPSERT | â€” |
| 115 | GOOGLE | Google | Subscriptions | Software & Apps | REVIEW | Generic platform name can represent hardware, ads, apps or subscriptions. |
| 116 | GOOGLE PAY | Google Pay | Transfers | â€” | REMOVE | Payment rail does not identify transaction purpose. |
| 117 | GRAMMARLY | Grammarly | Subscriptions | Software & Apps | UPSERT | â€” |
| 118 | GREAT LEARNING | Great Learning | Education | Tuition & Courses | UPSERT | â€” |
| 119 | GREEN TRENDS | Green Trends | Personal Care | Beauty & Personal Care | UPSERT | â€” |
| 120 | GROWW | Groww | Investments | Stocks & ETFs | UPSERT | â€” |
| 121 | GST | GST | Fees & Charges | Business Taxes & Fees | UPSERT | â€” |
| 122 | H M | H&M | Shopping | Clothing & Footwear | UPSERT | â€” |
| 123 | HALDIRAM | Haldirams | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 124 | HATHWAY | Hathway | Bills & Utilities | Mobile & Internet | UPSERT | â€” |
| 125 | HDFC ERGO | HDFC ERGO | Insurance | Other Insurance | UPSERT | â€” |
| 126 | HDFC LIFE | HDFC Life | Insurance | Life Insurance | UPSERT | â€” |
| 127 | HDFC LTD | HDFC Ltd | Loans & EMI | Home Loan EMI | UPSERT | â€” |
| 128 | HDFC SECURITIES | HDFC Securities | Investments | Stocks & ETFs | UPSERT | â€” |
| 129 | HDFCERGO | HDFC ERGO | Insurance | Other Insurance | UPSERT | â€” |
| 130 | HEALTHIANS | Healthians | Health & Medical | Diagnostics | UPSERT | â€” |
| 131 | HOME CREDIT | Home Credit | Loans & EMI | Credit Card Payment | UPSERT | â€” |
| 132 | HOPSCOTCH | Hopscotch | Kids & Family | Kids & Baby | UPSERT | â€” |
| 133 | HOTSTAR | Disney+ Hotstar | Entertainment | Streaming Services | UPSERT | â€” |
| 134 | HOUSING COM | Housing.com | Housing & Rent | Rent | UPSERT | â€” |
| 135 | HP PETROL | HP Petrol | Fuel | Fuel | UPSERT | â€” |
| 136 | HPCL | HPCL | Fuel | Fuel | UPSERT | â€” |
| 137 | ICICI DIRECT | ICICI Direct | Investments | Stocks & ETFs | UPSERT | â€” |
| 138 | ICICI PRUDENTIAL | ICICI Prudential | Insurance | Life Insurance | UPSERT | â€” |
| 139 | ICLOUD | iCloud | Subscriptions | Software & Apps | UPSERT | â€” |
| 140 | IFFCO TOKIO | IFFCO Tokio | Insurance | Other Insurance | UPSERT | â€” |
| 141 | IGL | IGL | Bills & Utilities | Cooking Gas | UPSERT | â€” |
| 142 | IIFL | IIFL | Investments | Stocks & ETFs | UPSERT | â€” |
| 143 | IKEA | IKEA | Shopping | Home & Kitchen | UPSERT | â€” |
| 144 | IMPS TRANSFER | IMPS Transfer | Transfers | Bank Transfer | UPSERT | â€” |
| 145 | INCOME TAX | Income Tax | Taxes | Income & Property Tax | UPSERT | â€” |
| 146 | INDANE GAS | Indane Gas | Bills & Utilities | Cooking Gas | UPSERT | â€” |
| 147 | INDIAN OIL | Indian Oil | Fuel | Fuel | UPSERT | â€” |
| 148 | INDIGO | IndiGo | Travel | Flights | UPSERT | â€” |
| 149 | INOX | INOX | Entertainment | Movies & Events | UPSERT | â€” |
| 150 | IOCL | IOCL | Fuel | Fuel | UPSERT | â€” |
| 151 | IRCTC | IRCTC | Travel | Trains & Buses | UPSERT | â€” |
| 152 | ITC HOTELS | ITC Hotels | Travel | Hotels & Stay | UPSERT | â€” |
| 153 | IXIGO | ixigo | Travel | Travel Services | UPSERT | â€” |
| 154 | JAWED HABIB | Jawed Habib | Personal Care | Beauty & Personal Care | UPSERT | â€” |
| 155 | JIO | Jio | Bills & Utilities | Mobile & Internet | UPSERT | â€” |
| 156 | JIOCINEMA | JioCinema | Entertainment | Streaming Services | UPSERT | â€” |
| 157 | JIOMART | JioMart | Groceries | Groceries | UPSERT | â€” |
| 158 | JUPITER | Jupiter | Loans & EMI | Bank Transfer | REMOVE | Banking apps are not loan merchants. |
| 159 | KALYAN JEWELLERS | Kalyan Jewellers | Shopping | Shopping | UPSERT | â€” |
| 160 | KETTO | Ketto | Gifts & Donations | Charity & Donations | UPSERT | â€” |
| 161 | KFC | KFC | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 162 | KIDSTOPPRESS | KidsStopPress | Kids & Family | Kids & Baby | UPSERT | â€” |
| 163 | KOTAK LIFE | Kotak Life | Insurance | Life Insurance | UPSERT | â€” |
| 164 | KOTAK SECURITIES | Kotak Securities | Investments | Stocks & ETFs | UPSERT | â€” |
| 165 | KSEB | KSEB | Bills & Utilities | Electricity | UPSERT | â€” |
| 166 | KUVERA | Kuvera | Investments | Mutual Funds & SIP | UPSERT | â€” |
| 167 | LAKME | Lakme | Personal Care | Beauty & Personal Care | UPSERT | â€” |
| 168 | LATE FEE | Late Fee | Fees & Charges | Penalties & Processing Fees | UPSERT | â€” |
| 169 | LAZYPAY | LazyPay | Loans & EMI | Consumer EMI | UPSERT | â€” |
| 170 | LENSKART | Lenskart | Shopping / Health & Medical | Dental & Vision | UPSERT | Consolidate duplicate Shopping/Health seed to Dental & Vision. |
| 171 | LIC | LIC | Insurance | Life Insurance | UPSERT | â€” |
| 172 | LICIOUS | Licious | Groceries | Groceries | UPSERT | â€” |
| 173 | LIFESTYLE | Lifestyle | Shopping | Clothing & Footwear | UPSERT | â€” |
| 174 | LINKEDIN | LinkedIn | Subscriptions | Software & Apps | UPSERT | â€” |
| 175 | LINKEDIN LEARNING | LinkedIn Learning | Education | Tuition & Courses | UPSERT | â€” |
| 176 | MAGICBRICKS | MagicBricks | Housing & Rent | Rent | UPSERT | â€” |
| 177 | MAGICPIN | Magicpin | Food & Dining | Restaurants & Cafes | REVIEW | Aggregator can represent food, shopping or offers. |
| 178 | MAHANAGAR GAS | Mahanagar Gas | Bills & Utilities | Cooking Gas | UPSERT | â€” |
| 179 | MAKEMYTRIP | MakeMyTrip | Travel | Travel Services | UPSERT | â€” |
| 180 | MALABAR GOLD | Malabar Gold | Shopping | Shopping | UPSERT | â€” |
| 181 | MANAPPURAM | Manappuram | Loans & EMI | Personal Loan EMI | UPSERT | â€” |
| 182 | MANIPAL CIGNA | Manipal Cigna | Insurance | Health Insurance | UPSERT | â€” |
| 183 | MANIPAL HOSPITAL | Manipal Hospital | Health & Medical | Doctor & Hospital | UPSERT | â€” |
| 184 | MARKS SPENCER | Marks & Spencer | Shopping | Clothing & Footwear | UPSERT | â€” |
| 185 | MARRIOTT | Marriott | Travel | Hotels & Stay | UPSERT | â€” |
| 186 | MAX HOSPITAL | Max Hospital | Health & Medical | Doctor & Hospital | UPSERT | â€” |
| 187 | MAX LIFE | Max Life | Insurance | Life Insurance | UPSERT | â€” |
| 188 | MCDONALDS | McDonalds | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 189 | MEDPLUS | MedPlus | Health & Medical | Medicines | UPSERT | â€” |
| 190 | MEESHO | Meesho | Shopping | Clothing & Footwear | UPSERT | â€” |
| 191 | MERU CABS | Meru Cabs | Transport | Cab & Auto | UPSERT | â€” |
| 192 | METRO CASH | Metro Cash & Carry | Groceries | Groceries | UPSERT | â€” |
| 193 | METRO SMART CARD | Metro Smart Card | Transport | Public Transport | UPSERT | â€” |
| 194 | MICROSOFT | Microsoft | Subscriptions | Software & Apps | REVIEW | Generic platform name can represent hardware, ads, apps or subscriptions. |
| 195 | MILAAP | Milaap | Gifts & Donations | Charity & Donations | UPSERT | â€” |
| 196 | MILKBASKET | Milkbasket | Groceries | Groceries | UPSERT | â€” |
| 197 | MOBIKWIK | MobiKwik | Transfers | Wallet Top-up | UPSERT | â€” |
| 198 | MORE RETAIL | More Retail | Groceries | Groceries | UPSERT | â€” |
| 199 | MOTHERCARE | Mothercare | Kids & Family | Kids & Baby | UPSERT | â€” |
| 200 | MOTILAL OSWAL | Motilal Oswal | Investments | Stocks & ETFs | UPSERT | â€” |
| 201 | MSEB | MSEDCL | Bills & Utilities | Electricity | UPSERT | â€” |
| 202 | MSEDCL | MSEDCL | Bills & Utilities | Electricity | UPSERT | â€” |
| 203 | MTNL | MTNL | Bills & Utilities | Mobile & Internet | UPSERT | â€” |
| 204 | MUTHOOT | Muthoot | Loans & EMI | Personal Loan EMI | UPSERT | â€” |
| 205 | MUTUAL FUND | Mutual Fund | Investments | Mutual Funds & SIP | UPSERT | â€” |
| 206 | MX PLAYER | MX Player | Entertainment | Streaming Services | UPSERT | â€” |
| 207 | MYGATE | MyGate | Housing & Rent | Society Maintenance | UPSERT | â€” |
| 208 | MYNTRA | Myntra | Shopping | Clothing & Footwear | UPSERT | â€” |
| 209 | NAMMA METRO | Namma Metro | Transport | Public Transport | UPSERT | â€” |
| 210 | NAMMA YATRI | Namma Yatri | Transport | Cab & Auto | UPSERT | â€” |
| 211 | NARAYANA HEALTH | Narayana Health | Health & Medical | Doctor & Hospital | UPSERT | â€” |
| 212 | NATIONAL INSURANCE | National Insurance | Insurance | Other Insurance | UPSERT | â€” |
| 213 | NATURE BASKET | Natures Basket | Groceries | Groceries | UPSERT | â€” |
| 214 | NAYARA | Nayara | Fuel | Fuel | UPSERT | â€” |
| 215 | NEFT TRANSFER | NEFT Transfer | Transfers | Bank Transfer | UPSERT | â€” |
| 216 | NESTAWAY | Nestaway | Housing & Rent | Rent | UPSERT | â€” |
| 217 | NETFLIX | Netflix | Entertainment | Streaming Services | UPSERT | â€” |
| 218 | NETMEDS | Netmeds | Health & Medical | Medicines | UPSERT | â€” |
| 219 | NEW INDIA ASSURANCE | New India Assurance | Insurance | Other Insurance | UPSERT | â€” |
| 220 | NHAI FASTAG | NHAI FASTag | Transport | Parking & Tolls | UPSERT | â€” |
| 221 | NIVA BUPA | Niva Bupa | Insurance | Health Insurance | UPSERT | â€” |
| 222 | NOBROKER | NoBroker | Housing & Rent | Rent | UPSERT | â€” |
| 223 | NORDVPN | NordVPN | Subscriptions | Software & Apps | UPSERT | â€” |
| 224 | NOTION | Notion | Subscriptions | Software & Apps | UPSERT | â€” |
| 225 | NPS | NPS | Investments | Retirement Savings | UPSERT | â€” |
| 226 | NYKAA | Nykaa | Shopping | Beauty & Personal Care | UPSERT | â€” |
| 227 | OLA | Ola | Transport | Cab & Auto | UPSERT | â€” |
| 228 | OLA AUTO | Ola Auto | Transport | Cab & Auto | UPSERT | â€” |
| 229 | ONECARD | OneCard | Loans & EMI | Credit Card Payment | UPSERT | â€” |
| 230 | OPENAI | OpenAI | Subscriptions | Software & Apps | UPSERT | â€” |
| 231 | OPTICALS | Opticals | Health & Medical | Dental & Vision | UPSERT | â€” |
| 232 | ORIENTAL INSURANCE | Oriental Insurance | Insurance | Other Insurance | UPSERT | â€” |
| 233 | OYO | OYO | Travel | Hotels & Stay | UPSERT | â€” |
| 234 | PANTALOONS | Pantaloons | Shopping | Clothing & Footwear | UPSERT | â€” |
| 235 | PARKING | Parking | Transport | Parking & Tolls | UPSERT | â€” |
| 236 | PAYTM | Paytm | Transfers | â€” | REMOVE | Payment rail does not identify transaction purpose. |
| 237 | PAYTM MONEY | Paytm Money | Investments | Stocks & ETFs | UPSERT | â€” |
| 238 | PAYTM POSTPAID | Paytm Postpaid | Loans & EMI | Consumer EMI | UPSERT | â€” |
| 239 | PEPPERFRY | Pepperfry | Shopping | Home & Kitchen | UPSERT | â€” |
| 240 | PHARMEASY | PharmEasy | Health & Medical | Medicines | UPSERT | â€” |
| 241 | PHONEPE | PhonePe | Transfers | â€” | REMOVE | Payment rail does not identify transaction purpose. |
| 242 | PIZZA HUT | Pizza Hut | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 243 | POLICYBAZAAR | PolicyBazaar | Insurance | Other Insurance | REVIEW | Aggregator can represent any insurance type. |
| 244 | PPF | PPF | Investments | Retirement Savings | UPSERT | â€” |
| 245 | PRACTO | Practo | Health & Medical | Doctor & Hospital | UPSERT | â€” |
| 246 | PROCESSING FEE | Processing Fee | Fees & Charges | Penalties & Processing Fees | UPSERT | â€” |
| 247 | PROFESSIONAL TAX | Professional Tax | Taxes | Income & Property Tax | UPSERT | â€” |
| 248 | PROPERTY TAX | Property Tax | Taxes | Income & Property Tax | UPSERT | â€” |
| 249 | PVR | PVR Cinemas | Entertainment | Movies & Events | UPSERT | â€” |
| 250 | RAPIDO | Rapido | Transport | Cab & Auto | UPSERT | â€” |
| 251 | REBEL FOODS | Rebel Foods | Food & Dining | Food Delivery | UPSERT | â€” |
| 252 | REDBUS | redBus | Travel | Trains & Buses | UPSERT | â€” |
| 253 | RELIANCE DIGITAL | Reliance Digital | Shopping | Electronics | UPSERT | â€” |
| 254 | RELIANCE ENERGY | Reliance Energy | Bills & Utilities | Electricity | UPSERT | â€” |
| 255 | RELIANCE FRESH | Reliance Fresh | Groceries | Groceries | UPSERT | â€” |
| 256 | RELIANCE PETROL | Reliance Petrol | Fuel | Fuel | UPSERT | â€” |
| 257 | RELIANCE RETAIL | Reliance Retail | Shopping | Shopping | UPSERT | â€” |
| 258 | RTGS TRANSFER | RTGS Transfer | Transfers | Bank Transfer | UPSERT | â€” |
| 259 | SALON | Salon | Personal Care | Beauty & Personal Care | UPSERT | â€” |
| 260 | SBI LIFE | SBI Life | Insurance | Life Insurance | UPSERT | â€” |
| 261 | SBI SECURITIES | SBI Securities | Investments | Stocks & ETFs | UPSERT | â€” |
| 262 | SELF TRANSFER | Self Transfer | Transfers | Self Transfer | UPSERT | â€” |
| 263 | SERVO | Servo | Fuel | Fuel | UPSERT | â€” |
| 264 | SHAREKHAN | Sharekhan | Investments | Stocks & ETFs | UPSERT | â€” |
| 265 | SHELL | Shell | Fuel | Fuel | UPSERT | â€” |
| 266 | SHOPPERS STOP | Shoppers Stop | Shopping | Clothing & Footwear | UPSERT | â€” |
| 267 | SIMPL | Simpl | Loans & EMI | Consumer EMI | UPSERT | â€” |
| 268 | SIMPLILEARN | Simplilearn | Education | Tuition & Courses | UPSERT | â€” |
| 269 | SIP | SIP Investment | Investments | Mutual Funds & SIP | UPSERT | â€” |
| 270 | SKILLSHARE | Skillshare | Education | Tuition & Courses | UPSERT | â€” |
| 271 | SLICE | Slice | Loans & EMI | Credit Card Payment | UPSERT | â€” |
| 272 | SMALLCASE | Smallcase | Investments | Stocks & ETFs | UPSERT | â€” |
| 273 | SNAPDEAL | Snapdeal | Shopping | Shopping | UPSERT | â€” |
| 274 | SONY LIV | SonyLIV | Entertainment | Streaming Services | UPSERT | â€” |
| 275 | SPA | Spa | Personal Care | Beauty & Personal Care | UPSERT | â€” |
| 276 | SPENCER | Spencers | Groceries | Groceries | UPSERT | â€” |
| 277 | SPICEJET | SpiceJet | Travel | Flights | UPSERT | â€” |
| 278 | SPOTIFY | Spotify | Entertainment | Streaming Services | UPSERT | â€” |
| 279 | SRL DIAGNOSTICS | SRL Diagnostics | Health & Medical | Diagnostics | UPSERT | â€” |
| 280 | STAMP DUTY | Stamp Duty | Fees & Charges | Government Fees | UPSERT | â€” |
| 281 | STAR BAZAAR | Star Bazaar | Groceries | Groceries | UPSERT | â€” |
| 282 | STAR HEALTH | Star Health | Insurance | Health Insurance | UPSERT | â€” |
| 283 | STARBUCKS | Starbucks | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 284 | SUBWAY | Subway | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 285 | SUPR DAILY | Supr Daily | Groceries | Groceries | UPSERT | â€” |
| 286 | SWIGGY | Swiggy | Food & Dining | Food Delivery | UPSERT | â€” |
| 287 | SWIGGY INSTAMART | Swiggy Instamart | Groceries | Groceries | UPSERT | â€” |
| 288 | TACO BELL | Taco Bell | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 289 | TAJ HOTELS | Taj Hotels | Travel | Hotels & Stay | UPSERT | â€” |
| 290 | TANGEDCO | TANGEDCO | Bills & Utilities | Electricity | UPSERT | â€” |
| 291 | TANISHQ | Tanishq | Shopping | Shopping | UPSERT | â€” |
| 292 | TATA AIA | Tata AIA | Insurance | Life Insurance | UPSERT | â€” |
| 293 | TATA CAPITAL | Tata Capital | Loans & EMI | Personal Loan EMI | UPSERT | â€” |
| 294 | TATA CLIQ | Tata CLiQ | Shopping | Shopping | UPSERT | â€” |
| 295 | TATA PLAY | Tata Play | Bills & Utilities | TV & DTH | UPSERT | â€” |
| 296 | TATA POWER | Tata Power | Bills & Utilities | Electricity | UPSERT | â€” |
| 297 | TATA SKY | Tata Play | Bills & Utilities | TV & DTH | UPSERT | â€” |
| 298 | TDS | TDS | Taxes | Income & Property Tax | UPSERT | â€” |
| 299 | THYROCARE | Thyrocare | Health & Medical | Diagnostics | UPSERT | â€” |
| 300 | TIKONA | Tikona | Bills & Utilities | Mobile & Internet | UPSERT | â€” |
| 301 | TITAN | Titan | Shopping | Electronics | UPSERT | â€” |
| 302 | TOLL PLAZA | Toll Plaza | Transport | Parking & Tolls | UPSERT | â€” |
| 303 | TORRENT POWER | Torrent Power | Bills & Utilities | Electricity | UPSERT | â€” |
| 304 | TREEBO | Treebo | Travel | Hotels & Stay | UPSERT | â€” |
| 305 | UBER | Uber | Transport | Cab & Auto | UPSERT | â€” |
| 306 | UBER AUTO | Uber Auto | Transport | Cab & Auto | UPSERT | â€” |
| 307 | UBER MOTO | Uber Moto | Transport | Cab & Auto | UPSERT | â€” |
| 308 | UDEMY | Udemy | Education | Tuition & Courses | UPSERT | â€” |
| 309 | UNACADEMY | Unacademy | Education | Tuition & Courses | UPSERT | â€” |
| 310 | UNI CARD | Uni Card | Loans & EMI | Credit Card Payment | UPSERT | â€” |
| 311 | UNIQLO | Uniqlo | Shopping | Clothing & Footwear | UPSERT | â€” |
| 312 | UPGRAD | upGrad | Education | Tuition & Courses | UPSERT | â€” |
| 313 | UPSTOX | Upstox | Investments | Stocks & ETFs | UPSERT | â€” |
| 314 | URBAN COMPANY | Urban Company | Personal Care | Household | REVIEW | Can be cleaning, repairs or beauty services. |
| 315 | VEDANTU | Vedantu | Education | Tuition & Courses | UPSERT | â€” |
| 316 | VIJAY SALES | Vijay Sales | Shopping | Electronics | UPSERT | â€” |
| 317 | VISTARA | Vistara | Travel | Flights | UPSERT | â€” |
| 318 | VODAFONE IDEA | Vi | Bills & Utilities | Mobile & Internet | UPSERT | â€” |
| 319 | VOOT | Voot | Entertainment | Streaming Services | UPSERT | â€” |
| 320 | WBSEDCL | WBSEDCL | Bills & Utilities | Electricity | UPSERT | â€” |
| 321 | WESTSIDE | Westside | Shopping | Clothing & Footwear | UPSERT | â€” |
| 322 | WHITEHAT JR | WhiteHat Jr | Education | Tuition & Courses | UPSERT | â€” |
| 323 | WOW MOMO | Wow Momo | Food & Dining | Restaurants & Cafes | UPSERT | â€” |
| 324 | YATRA | Yatra | Travel | Travel Services | UPSERT | â€” |
| 325 | YOUTUBE | YouTube | Entertainment | Streaming Services | UPSERT | â€” |
| 326 | YULU | Yulu | Transport | Cab & Auto | UPSERT | â€” |
| 327 | ZARA | Zara | Shopping | Clothing & Footwear | UPSERT | â€” |
| 328 | ZEE5 | Zee5 | Entertainment | Streaming Services | UPSERT | â€” |
| 329 | ZEPTO | Zepto | Groceries | Groceries | UPSERT | â€” |
| 330 | ZERODHA | Zerodha | Investments | Stocks & ETFs | UPSERT | â€” |
| 331 | ZEST MONEY | ZestMoney | Loans & EMI | Consumer EMI | UPSERT | â€” |
| 332 | ZOMATO | Zomato | Food & Dining | Food Delivery | UPSERT | â€” |
| 333 | ZOOM | Zoom | Subscriptions | Software & Apps | UPSERT | â€” |
| 334 | ZOSTEL | Zostel | Travel | Hotels & Stay | UPSERT | â€” |
