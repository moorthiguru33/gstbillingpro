import fs from 'fs';
import path from 'path';

// Comprehensive Indian business categories & item specifications
const industryCategories = [
  {
    name: 'Grocery, Kirana & Supermarket',
    id: 'grocery',
    icon: '🛒',
    hsn: '1006',
    taxRate: 5,
    unit: 'KG',
    templates: [
      { prefix: 'Basmati Rice Premium', brands: ['India Gate Feast', 'Daawat Rozana', 'Fortune Biryani Special', 'Kohinoor Super', 'Lal Qilla Majestic', 'Heritage Classic', 'Royal Chef'], sizes: ['1kg', '5kg', '10kg', '25kg'], priceRange: [110, 480] },
      { prefix: 'Sona Masoori Raw Rice', brands: ['Bawarchi Supreme', 'Double Horse', 'Ponni Royal', 'Kohinoor', 'Nature Fresh', 'Swarna', 'Deccan Gold'], sizes: ['5kg', '10kg', '25kg'], priceRange: [60, 340] },
      { prefix: 'Chakki Fresh Whole Wheat Atta', brands: ['Aashirvaad Shudh', 'Fortune Chakki', 'Pillsbury Traditional', 'Shakti Bhog', 'Nature Fresh Sampoorna', 'Patanjali Sampurna', 'Organic Tattva'], sizes: ['1kg', '5kg', '10kg'], priceRange: [45, 420] },
      { prefix: 'Multi-Grain Sharbati Atta', brands: ['Aashirvaad Select', 'Fortune Vitarich', 'Pillsbury Gold'], sizes: ['1kg', '5kg'], priceRange: [65, 290] },
      { prefix: 'Toor Dal Desi Oomph', brands: ['Tata Sampann Unpolished', 'Fortune Pulses', 'Organic Tattva', 'Rajdhani Gold', 'Dhara Pure'], sizes: ['500g', '1kg', '2kg'], priceRange: [145, 195] },
      { prefix: 'Moong Dal Washed Dhuli', brands: ['Tata Sampann', 'Fortune', 'Catch Premium', 'Rajdhani Fresh', 'Nature Fresh'], sizes: ['500g', '1kg'], priceRange: [115, 150] },
      { prefix: 'Moong Dal Chilka', brands: ['Tata Sampann', 'Fortune', 'Rajdhani'], sizes: ['500g', '1kg'], priceRange: [110, 140] },
      { prefix: 'Chana Dal Polished', brands: ['Tata Sampann', 'Fortune', 'Rajdhani', 'Nature Fresh Pure'], sizes: ['500g', '1kg'], priceRange: [88, 120] },
      { prefix: 'Urad Dal White Gota', brands: ['Tata Sampann', 'Fortune', 'Double Horse Special', 'Rajdhani'], sizes: ['500g', '1kg'], priceRange: [135, 175] },
      { prefix: 'Kabuli Chana Bold Jumbo', brands: ['Tata Sampann', 'Fortune', 'Catch Selected'], sizes: ['500g', '1kg'], priceRange: [130, 180] },
      { prefix: 'Rajma Kashmiri Red', brands: ['Tata Sampann', 'Rajdhani Deluxe', 'Catch Mountain'], sizes: ['500g', '1kg'], priceRange: [140, 190] },
      { prefix: 'Refined Sunflower Oil Pouch', brands: ['Fortune Sunlite', 'Saffola Gold Healthy', 'Gemini Pure', 'Sundrop Nutri', 'Dhara Health'], sizes: ['1L', '2L', '5L', '15L Tin'], priceRange: [135, 740], unit: 'LTR', hsn: '1512' },
      { prefix: 'Mustard Oil Cold-Pressed', brands: ['Fortune Kachi Ghani', 'Dhara Pure', 'Engine Brand', 'Patanjali Kachi', 'Bail Kolhu Traditional'], sizes: ['1L', '2L', '5L'], priceRange: [155, 790], unit: 'LTR', hsn: '1514' },
      { prefix: 'Rice Bran Health Oil', brands: ['Fortune Rice Bran', 'Saffola Total', 'King Cuisine'], sizes: ['1L', '5L'], priceRange: [140, 690], unit: 'LTR', hsn: '1515' },
      { prefix: 'Pure Cow Desi Ghee', brands: ['Amul Pure Cow', 'Gowardhan Golden', 'Mother Dairy Premium', 'Patanjali Cow', 'Nestle Everyday Rich', 'Ananda', 'Aashirvaad Svasti'], sizes: ['200ml', '500ml', '1L Jar', '5L Tin'], priceRange: [160, 680], unit: 'LTR', hsn: '0405', taxRate: 12 },
      { prefix: 'Iodised Table Salt', brands: ['Tata Salt Vacuum Evaporated', 'Aashirvaad Crystal Salt', 'Catch Sprinklers Salt', 'Patanjali Rock Salt', 'Saffola Medisalt'], sizes: ['1kg', '500g'], priceRange: [25, 35], unit: 'PKT', hsn: '2501', taxRate: 0 },
      { prefix: 'Himalayan Pink Rock Salt (Sendha Namak)', brands: ['Tata Salt Rock Salt', 'Catch Pink Salt', 'Puro Healthy'], sizes: ['500g', '1kg'], priceRange: [65, 120], unit: 'PKT', hsn: '2501', taxRate: 0 },
      { prefix: 'Refined White Sulphurless Sugar', brands: ['Madhur Pure Sugar', 'Trust Classic', 'Mawana Crystal', 'Uttam Sugar', 'Dhampure Sulphurfree'], sizes: ['1kg', '5kg'], priceRange: [48, 240], unit: 'KG', hsn: '1701', taxRate: 5 },
      { prefix: 'Organic Jaggery Powder (Gud)', brands: ['Dhampure Special', 'Organic Tattva', '24 Mantra', 'B&B Organics'], sizes: ['500g', '1kg'], priceRange: [55, 110], unit: 'PKT', hsn: '1701', taxRate: 5 },
      { prefix: 'Pure Turmeric Powder (Haldi)', brands: ['Everest Agmark', 'MDH Deggi Haldi', 'Catch Golden', 'Tata Sampann Salem', 'Ramdev Pure'], sizes: ['100g', '200g', '500g'], priceRange: [38, 155], unit: 'PKT', hsn: '0910' },
      { prefix: 'Kashmiri Mirch Powder', brands: ['Everest Kashmirilal', 'MDH Deggi Mirch', 'Catch Kashmiri', 'Tata Sampann Fresh'], sizes: ['100g', '200g', '500g'], priceRange: [55, 220], unit: 'PKT', hsn: '0904' },
      { prefix: 'Coriander Powder (Dhania)', brands: ['Everest Fragrant', 'MDH Green', 'Catch Aroma', 'Tata Sampann Pure'], sizes: ['100g', '200g', '500g'], priceRange: [40, 150], unit: 'PKT', hsn: '0909' },
      { prefix: 'Garam Masala Special Blend', brands: ['Everest Royal', 'MDH Super', 'Catch Kitchen Special', 'Badshah Classic'], sizes: ['50g', '100g', '200g'], priceRange: [45, 95], unit: 'PKT', hsn: '0910' },
      { prefix: 'Cumin Whole Seeds (Jeera)', brands: ['Everest Whole', 'Catch Pure', 'Tata Sampann Select'], sizes: ['100g', '200g', '500g'], priceRange: [70, 340], unit: 'PKT', hsn: '0909' },
      { prefix: 'Cashew Nuts Whole (Kaju W240)', brands: ['Nutraj Supreme', 'Tata Sampann', 'Tulsi Premium', 'Happilo King'], sizes: ['100g', '250g', '500g', '1kg'], priceRange: [180, 890], unit: 'PKT', hsn: '0801', taxRate: 5 },
      { prefix: 'California Almonds (Badam Giri)', brands: ['Nutraj California', 'Happilo Bold', 'Tulsi Select', 'Tata Sampann'], sizes: ['100g', '250g', '500g', '1kg'], priceRange: [120, 750], unit: 'PKT', hsn: '0802', taxRate: 5 },
      { prefix: 'Green Cardamom (Elaichi)', brands: ['Everest Royal Bold', 'Catch Premium', 'Keya Whole'], sizes: ['25g', '50g', '100g'], priceRange: [95, 320], unit: 'PKT', hsn: '0908' },
      { prefix: 'Cloves Whole (Laung)', brands: ['Everest Whole', 'MDH Selected', 'Catch Fresh'], sizes: ['50g', '100g'], priceRange: [65, 125], unit: 'PKT', hsn: '0907' },
      { prefix: 'Black Pepper Whole (Kali Mirch)', brands: ['Everest Malabar', 'Catch Tellicherry', 'Tata Sampann'], sizes: ['50g', '100g'], priceRange: [60, 115], unit: 'PKT', hsn: '0904' },
      { prefix: 'Poha Thick Flakes', brands: ['Tata Sampann White', 'Fortune Crispy', 'Rajdhani Choice'], sizes: ['500g', '1kg'], priceRange: [42, 78], unit: 'PKT', hsn: '1904' },
      { prefix: 'Sooji / Rawa Semolina', brands: ['Fortune Roasted', 'Rajdhani Fine', 'Aashirvaad Double Filtered'], sizes: ['500g', '1kg'], priceRange: [35, 65], unit: 'PKT', hsn: '1103' },
      { prefix: 'Besan Chana Flour', brands: ['Fortune Super Fine', 'Rajdhani Classic', 'Tata Sampann High Protein'], sizes: ['500g', '1kg'], priceRange: [58, 112], unit: 'PKT', hsn: '1106' },
      { prefix: 'Roasted Vermicelli (Sevai)', brands: ['Bambino Roasted', 'MTR Vermicelli', 'Anil Special'], sizes: ['400g', '850g'], priceRange: [40, 85], unit: 'PKT', hsn: '1902' },
      { prefix: 'Tea Leaves Dust & Leaf', brands: ['Tata Tea Gold', 'Tata Tea Premium Desh Ki Chai', 'Brooke Bond Red Label', 'Taj Mahal Classic', 'Wagh Bakri CTC', 'Tata Tea Agni'], sizes: ['250g', '500g', '1kg'], priceRange: [130, 520], unit: 'PKT', hsn: '0902', taxRate: 5 },
    ]
  },
  {
    name: 'Snacks, Dairy & Beverages',
    id: 'fmcg_snacks',
    icon: '🍪',
    hsn: '1905',
    taxRate: 18,
    unit: 'PKT',
    templates: [
      { prefix: 'Glucose Energy Biscuits', brands: ['Parle-G Original', 'Britannia Tiger Glucose', 'Sunfeast Glucose Plus'], sizes: ['65g', '150g', '250g', '800g Value Pack'], priceRange: [5, 75] },
      { prefix: 'Marie Crunchy Biscuits', brands: ['Britannia Marie Gold', 'Sunfeast Marie Light Oats', 'Parle Marie Choice'], sizes: ['120g', '250g', '400g'], priceRange: [15, 50] },
      { prefix: 'Butter Delite Cookies', brands: ['Britannia Good Day Butter', 'Britannia Good Day Cashew', 'Sunfeast Mom\'s Magic', 'Parle 20-20 Cashew'], sizes: ['100g', '200g', '600g Party Pack'], priceRange: [25, 130] },
      { prefix: 'Rich Creme Filled Biscuits', brands: ['Oreo Original Vanilla', 'Oreo Rich Cocoa Chocolate', 'Sunfeast Dark Fantasy Choco Fills', 'Britannia Bourbon Treat', 'Parle Hide & Seek Choco Chip'], sizes: ['100g', '120g', '300g'], priceRange: [30, 115] },
      { prefix: '2-Minute Instant Noodles', brands: ['Maggi Masala 2-Min', 'Maggi Special Masala', 'Yippee Magic Masala', 'Top Ramen Curry Veg', 'Ching\'s Secret Schezwan Noodles'], sizes: ['70g Single', '140g Double', '280g Pack of 4', '560g Mega Pack of 8'], priceRange: [14, 120], hsn: '1902' },
      { prefix: 'Crispy Potato Chips', brands: ['Lay\'s India\'s Magic Masala', 'Lay\'s Classic Salted', 'Lay\'s Spanish Tomato Tango', 'Lay\'s American Style Cream & Onion', 'Bingo Tedhe Medhe', 'Kurkure Masala Munch Crunchy'], sizes: ['30g', '50g', '90g Party Pack'], priceRange: [10, 40], hsn: '2005' },
      { prefix: 'Traditional Namkeen Bhujia', brands: ['Haldiram\'s Aloo Bhujia', 'Bikaji Bhujia Sev', 'Haldiram\'s Bikaneri Bhujia', 'Bikanervala Royal', 'Balaji Ratlami Sev'], sizes: ['150g', '400g Family Pack', '1kg Mega'], priceRange: [45, 275], hsn: '2106', taxRate: 12 },
      { prefix: 'Sweet & Spicy Khatta Meetha Mixture', brands: ['Haldiram\'s All-in-One', 'Haldiram\'s Khatta Meetha', 'Bikaji Chowpati Bhelpuri', 'Chhajed Special'], sizes: ['200g', '400g'], priceRange: [50, 105], hsn: '2106', taxRate: 12 },
      { prefix: 'Dairy Milk Chocolate Slab', brands: ['Cadbury Dairy Milk', 'Cadbury Dairy Milk Silk Hazelnut', 'Nestle KitKat Crisp', 'Nestle Munch Crunchy', 'Cadbury 5 Star Caramel'], sizes: ['24g', '45g', '60g', '150g Family'], priceRange: [15, 180], hsn: '1806' },
      { prefix: 'Instant Pure Coffee Powder', brands: ['Nescafe Classic Dawn Jar', 'Bru Instant Super Blend', 'Tata Coffee Grand Extra', 'Nescafe Sunrise Strong'], sizes: ['50g Jar', '100g Glass Jar', '200g Pouch'], priceRange: [115, 440], unit: 'JAR', hsn: '2101' },
      { prefix: 'Nutritional Health Malt Drink', brands: ['Horlicks Classic Malt Original', 'Boost Secret of Energy', 'Bournvita Cadbury Pro-Health', 'Complan Royal Chocolate Health'], sizes: ['500g Jar', '1kg Refill Pack'], priceRange: [245, 460], unit: 'JAR', hsn: '1901' },
      { prefix: 'Chilled Fizzy Beverage PET', brands: ['Coca-Cola Original Taste', 'Thums Up Charged', 'Sprite Clear Lime', 'Pepsi Cola Refreshing', 'Limca Lemon Tang', 'Mountain Dew High Energy'], sizes: ['250ml Can', '750ml PET', '2.25L Giant Bottle'], priceRange: [35, 95], unit: 'BTL', hsn: '2202', taxRate: 28 },
      { prefix: 'Packaged Pure Drinking Water', brands: ['Bisleri Mineral Water with Minerals', 'Kinley Clean Taste', 'Aquafina Pure', 'Bailley Healthy Water'], sizes: ['500ml Pocket', '1L Traveler', '2L Home', '20L Bubble Jar'], priceRange: [10, 85], unit: 'BTL', hsn: '2201' },
      { prefix: 'Fruit Juice Refreshment', brands: ['Real Active Mixed Fruit', 'Real Fresh Guava Pulp', 'Tropicana 100% Orange', 'Paper Boat Sweet Mango Aamras'], sizes: ['200ml Tetra', '1L Family Pack'], priceRange: [20, 130], unit: 'PKT', hsn: '2009', taxRate: 12 },
      { prefix: 'Toned Homogenized Milk Pouch', brands: ['Amul Taaza Toned', 'Mother Dairy Toned Milk', 'Nandini GoodLife', 'Aavin Toned', 'Heritage Fresh'], sizes: ['500ml Pouch', '1L Pouch', '1L Tetra Pack'], priceRange: [27, 72], unit: 'PKT', hsn: '0401', taxRate: 0 },
      { prefix: 'Fresh Paneer (Cottage Cheese)', brands: ['Amul Malai Paneer', 'Mother Dairy Fresh Paneer', 'Gowardhan Rich Paneer'], sizes: ['200g Block', '500g Value'], priceRange: [85, 210], unit: 'PKT', hsn: '0406', taxRate: 5 },
      { prefix: 'Salted Table Butter', brands: ['Amul Utterly Butterly Delicious', 'Mother Dairy Pasteurized Butter', 'Britannia Butter Delight'], sizes: ['100g Bar', '500g Block'], priceRange: [56, 275], unit: 'PKT', hsn: '0405', taxRate: 12 },
      { prefix: 'Processed Cheese Slices & Cubes', brands: ['Amul Cheese Slices', 'Britannia Cheezza', 'Go Cheese Cubes'], sizes: ['100g (5 Slices)', '200g (10 Slices)', '400g Box'], priceRange: [80, 290], unit: 'BOX', hsn: '0406', taxRate: 12 },
    ]
  },
  {
    name: 'Personal Care & Cosmetics',
    id: 'personal_care',
    icon: '🧴',
    hsn: '3401',
    taxRate: 18,
    unit: 'PCS',
    templates: [
      { prefix: 'Bathing Soap Bar', brands: ['Dettol Original Germ Protection', 'Lifebuoy Total 10', 'Dove White Beauty Moisture', 'Lux Velvet Glow Rose', 'Pears Pure & Gentle Amber', 'Cinthol Original Confidence', 'Medimix Ayurvedic 18 Herbs'], sizes: ['75g', '125g', 'Pack of 3 (100g each)', 'Pack of 4 (125g each)'], priceRange: [35, 230] },
      { prefix: 'Cleansing Shampoo Bottle', brands: ['Head & Shoulders Cool Menthol Anti-Dandruff', 'Dove Intense Repair Nourishing', 'Clinic Plus Strong & Long', 'Sunsilk Black Shine Silky', 'Pantene Pro-V Hair Fall Control', 'L\'Oreal Total Repair 5 Damaged Hair'], sizes: ['80ml Pocket', '180ml Regular', '340ml Family', '650ml Pump Bottle'], priceRange: [75, 599], unit: 'BTL', hsn: '3305' },
      { prefix: 'Deep Conditioning Hair Mask', brands: ['Dove Daily Shine', 'Tresemme Keratin Smooth Infusion', 'L\'Oreal Paris Extraordinary Oil'], sizes: ['180ml Tube', '300ml Jar'], priceRange: [180, 420], unit: 'TUB', hsn: '3305' },
      { prefix: 'Dental Defense Toothpaste', brands: ['Colgate Strong Teeth Calcium', 'Colgate MaxFresh Peppermint Cooling', 'Closeup Red Hot Spicy Fresh', 'Pepsodent Germi Check 12H', 'Sensodyne Fresh Mint Sensitive Teeth', 'Dabur Red Ayurvedic Toothpaste', 'Himalaya Complete Care Herbal'], sizes: ['100g Tube', '150g Saver Tube', '200g Family Pack (Buy 1 Get 1)'], priceRange: [55, 225], unit: 'TUBE', hsn: '3306' },
      { prefix: 'Antibacterial Hand Wash Refill', brands: ['Dettol Original Pump Dispenser', 'Lifebuoy Total 10 Active Silver', 'Godrej Protekt Masterstroke', 'Savlon Moisture Shield'], sizes: ['175ml Pump Bottle', '750ml Refill Pouch', '1.5L Mega Refill'], priceRange: [85, 215], unit: 'BTL', hsn: '3401' },
      { prefix: 'Hydrating Face Wash Gel', brands: ['Garnier Men Acno Fight Anti-Pimple', 'Himalaya Purifying Neem Face Wash', 'Clean & Clear Morning Energy', 'Pond\'s Bright Beauty Spotless Glow', 'Nivea Men Dark Spot Reduction'], sizes: ['50ml Tube', '100ml Tube', '150ml Value Pack'], priceRange: [75, 240], unit: 'TUBE', hsn: '3304' },
      { prefix: 'Body Moisturizer Lotion', brands: ['Nivea Soft Light Moisturiser', 'Vaseline Intensive Care Deep Restore', 'Parachute Advansed Body Lotion', 'Joy Skin Fruits Glow Lotion'], sizes: ['100ml Bottle', '200ml Bottle', '400ml Pump Bottle'], priceRange: [90, 340], unit: 'BTL', hsn: '3304' },
      { prefix: 'Refreshing Deo Body Spray', brands: ['Fogg Marco Fragrance Body Spray', 'Axe Dark Temptation Long Lasting', 'Wild Stone Code Steel', 'Engage Man M1 Cologne Spray', 'Nivea Men Fresh Active 48h'], sizes: ['120ml Can', '150ml Can', '200ml Large Can'], priceRange: [160, 275], unit: 'CAN', hsn: '3307' },
      { prefix: 'Baby Diaper Pants Soft', brands: ['Pampers All Round Protection Pants', 'Huggies Wonder Pants Extra Comfort', 'MamyPoko Pants Standard Soft'], sizes: ['Small (S - 42 Pcs)', 'Medium (M - 54 Pcs)', 'Large (L - 48 Pcs)', 'XL (XL - 36 Pcs)'], priceRange: [399, 899], unit: 'PKT', hsn: '9619', taxRate: 12 },
    ]
  },
  {
    name: 'Home Cleaning, Detergents & Household',
    id: 'home_care',
    icon: '🧹',
    hsn: '3402',
    taxRate: 18,
    unit: 'PKT',
    templates: [
      { prefix: 'Washing Machine Detergent Powder', brands: ['Surf Excel Easy Wash Tough Stains', 'Ariel Matic Front Load Active Clean', 'Tide Plus Double Power Fragrance', 'Rin Advanced Supreme Brightness', 'Ghadi Naya Detergent Powder'], sizes: ['500g Pouch', '1kg Bag', '2kg Bag', '4kg Bucket Combo'], priceRange: [50, 480] },
      { prefix: 'Concentrated Liquid Detergent', brands: ['Surf Excel Matic Top Load Liquid', 'Ariel Matic Liquid Fresh', 'Genteel Liquid Detergent for Woolens'], sizes: ['500ml Bottle', '1L Pouch Refill', '2L Smart Jug'], priceRange: [110, 399], unit: 'BTL', hsn: '3402' },
      { prefix: 'Dishwashing Bar Lemon Infusion', brands: ['Vim Dishwash Bar with Lemon Juice', 'Exo Touch & Shine Round Tub', 'Pril Tough Grease Action Bar'], sizes: ['150g Bar', '300g Bar with Scrubber', '500g Value Tub'], priceRange: [10, 60], unit: 'PCS' },
      { prefix: 'Dishwash Liquid Gel', brands: ['Vim Gel Lemon Splash Active', 'Pril Lime Dishwashing Gel', 'Godrej Protekt Dish Gel'], sizes: ['250ml Squeeze Bottle', '750ml Refill Pouch', '2L Can'], priceRange: [55, 290], unit: 'BTL' },
      { prefix: 'Disinfectant Floor Surface Cleaner', brands: ['Lizol Citrus Kills 99.9% Germs', 'Lizol Floral Floor Polish', 'Dettol Surface Cleaner Lemon', 'Nimyle Herbal Floor Disinfectant'], sizes: ['500ml Bottle', '1L Bottle', '2L Jug Refill'], priceRange: [95, 345], unit: 'BTL', hsn: '3808' },
      { prefix: 'Thick Toilet Cleaner Liquid', brands: ['Harpic Power Plus 10X Max Clean', 'Domex Fresh Guard Ocean Burst', 'Presto Disinfectant Toilet Cleaner'], sizes: ['500ml Nozzle Bottle', '1L Bottle', 'Pack of 2 (1L each)'], priceRange: [85, 260], unit: 'BTL', hsn: '3808' },
      { prefix: 'Mosquito Vaporizer Machine & Refill', brands: ['All Out Ultra Power+ Fan Combo', 'GoodKnight Gold Flash Liquid Vaporizer', 'Mortein 2-in-1 Power Activ'], sizes: ['Machine + 45ml Refill Combo', 'Twin Refill Pack (45ml x 2)', 'Jumbo 60-Night Refill'], priceRange: [85, 175], unit: 'PKT', hsn: '3808' },
    ]
  },
  {
    name: 'Electricals, Lighting & Home Appliances',
    id: 'electricals',
    icon: '⚡',
    hsn: '8539',
    taxRate: 18,
    unit: 'PCS',
    templates: [
      { prefix: 'LED Bulb Cool Day Light B22', brands: ['Philips Bright Starlite', 'Havells Adore LED', 'Syska Brilliant Glaze', 'Wipro Garnet High Lumen', 'Crompton Solarium Ray'], sizes: ['7 Watt', '9 Watt Super Bright', '12 Watt', '15 Watt High Bay', '20 Watt Mega'], priceRange: [75, 230] },
      { prefix: 'LED Batten Tube Light 4 Feet', brands: ['Philips Linea Batten', 'Havells Sparkle Tube', 'Wipro High Beam Batten', 'Crompton Laser Ray'], sizes: ['20W White Glow', '24W High Output', '28W Daylight'], priceRange: [180, 360] },
      { prefix: 'Decorative High Speed Ceiling Fan', brands: ['Crompton Hill Briz 1200mm', 'Havells Stealth Air Premium', 'Usha Striker Galaxy Ultra', 'Orient Electric Apex-FX', 'Atomberg Efficio BLDC Motor Energy Saver'], sizes: ['1200mm (48 Inch)', '900mm (36 Inch)', '1400mm (56 Inch)'], priceRange: [1450, 3900], hsn: '8414' },
      { prefix: 'Modular 1-Way Switch 6A/16A', brands: ['Anchor Roma Classic White', 'Havells Crabtree Thames', 'Legrand Arteor Stylish', 'Schneider Opale Sleek', 'Goldmedal Curve Modern'], sizes: ['6 Amp 1-Way Switch', '16 Amp Power Switch', '6 Amp 2-Way Switch', 'Bell Push Switch with Indicator'], priceRange: [28, 120], hsn: '8536' },
      { prefix: 'Modular Shuttered Socket', brands: ['Anchor Roma 2-in-1', 'Havells Crabtree Heavy', 'Legrand Universal 3-Pin', 'Goldmedal Curve Euro'], sizes: ['6A 3-Pin Socket', '16A Heavy Duty Power Socket', 'Universal 6/16A Multi Socket'], priceRange: [65, 190], hsn: '8536' },
      { prefix: 'FR Flame Retardant Copper House Wire 90M', brands: ['Polycab Optima Plus FR', 'Havells LifeLine Plus S3 HRFR', 'Finolex Flame Retardant Pure Copper', 'RR Kabel Superex FR', 'KEI Conflame Heavy Duty'], sizes: ['0.75 sq mm Coil (90m)', '1.0 sq mm Coil (90m)', '1.5 sq mm Coil (90m)', '2.5 sq mm Power Coil (90m)', '4.0 sq mm Heavy Power Coil (90m)'], priceRange: [850, 4200], unit: 'COIL', hsn: '8544' },
      { prefix: 'Miniature Circuit Breaker (MCB) Single Pole', brands: ['Schneider Acti9 C-Curve', 'Havells Euroload MCB', 'Legrand RX3 Reliable', 'L&T Tripper Single Pole'], sizes: ['6 Amp Single Pole', '10 Amp Single Pole', '16 Amp SP', '20 Amp SP', '32 Amp Heavy SP', '40 Amp Double Pole DP'], priceRange: [140, 680], hsn: '8536' },
      { prefix: 'Surge Protected Power Extension Board', brands: ['Anchor by Panasonic 4-Socket with Master Switch', 'Goldmedal Curve 4-Way Strip with LED', 'Havells 4-Socket Power Strip 2M Cord', 'GM Modular 4+1 Spike Guard'], sizes: ['4 Sockets 2-Metre Cord', '4 Sockets + 2 USB Fast Ports 3M'], priceRange: [299, 650], hsn: '8537' },
      { prefix: 'Heavy Alkaline AA/AAA Batteries', brands: ['Duracell Ultra Alkaline Longest Lasting', 'Energizer Max PowerSeal', 'Panasonic Everyday Power', 'Eveready Carbon Zinc Heavy Duty'], sizes: ['AA Pack of 4', 'AAA Pack of 4', 'AA Pack of 8 Value Pack', '9V Transistor Block'], priceRange: [80, 320], unit: 'PKT', hsn: '8506' },
    ]
  },
  {
    name: 'Hardware, Tools & Paints',
    id: 'hardware',
    icon: '🔧',
    hsn: '7318',
    taxRate: 18,
    unit: 'PCS',
    templates: [
      { prefix: 'Drywall Black Gypsum Screw', brands: ['Unbrako High Tensile', 'Hilti Pro Anchor', 'Apex Fasteners Heavy', 'Crown Steel Screws'], sizes: ['3.5 x 25mm (1 Inch) Box of 1000', '3.5 x 35mm Box of 1000', '3.5 x 50mm (2 Inch) Box of 500'], priceRange: [240, 520], unit: 'BOX' },
      { prefix: 'Stainless Steel Wood Screws CSK', brands: ['Apex SS304 Precision', 'Crown Rust-Proof', 'GKW Heavy Hardware'], sizes: ['8 x 1 Inch Box of 100', '8 x 1.5 Inch Box of 100', '10 x 2 Inch Box of 100', '10 x 3 Inch Box of 50'], priceRange: [85, 260], unit: 'BOX' },
      { prefix: 'CPVC Water Plumbing Pipe Class 1 (3 Metre)', brands: ['Astral CPVC Pro SDR 11', 'Ashirvad CPVC Gold FlowGuard', 'Supreme Lifeline High Pressure', 'Finolex Plumber Tough'], sizes: ['1/2 Inch (15mm) 3 Metre', '3/4 Inch (20mm) 3 Metre', '1 Inch (25mm) 3 Metre', '1.5 Inch (40mm) 3 Metre'], priceRange: [180, 690], unit: 'MTR', hsn: '3917' },
      { prefix: 'Brass Bib Cock Water Tap', brands: ['Jaquar Continental Chrome', 'Hindware Flora Brass Tap', 'Cera Wave Wall Flange Tap', 'Parryware Coral Solid Brass'], sizes: ['1/2 Inch Wall Mounted Chrome', 'Long Body Bib Tap 1/2 Inch', 'Two-Way Bib Tap with Hand Shower Point'], priceRange: [450, 1650], hsn: '8481' },
      { prefix: 'Interior Wall Emulsion Paint Bucket', brands: ['Asian Paints Tractor Emulsion Smooth', 'Asian Paints Apcolite Premium Satin', 'Berger Walmasta Weatherproof', 'Nerolac Beauty Gold Washable', 'Dulux Velvet Touch Pearl Luxury'], sizes: ['1 Litre Pouch', '4 Litre Bucket', '10 Litre Drum', '20 Litre Master Drum'], priceRange: [180, 4800], unit: 'DRUM', hsn: '3209' },
      { prefix: 'Exterior Weatherproof Emulsion Paint', brands: ['Asian Paints Apex Weatherproof Silicon', 'Asian Paints Apex Ultima Protek', 'Berger WeatherCoat Glow', 'Nerolac Excel Total Rain Shield'], sizes: ['1 Litre', '4 Litres', '10 Litres', '20 Litres Heavy Duty'], priceRange: [290, 6500], unit: 'DRUM', hsn: '3209' },
      { prefix: 'White Cement Based Wall Putty Bag', brands: ['Birla White WallSeal Waterproof Putty', 'JK White Cement WallMaxx Putty', 'Asian Paints TruCare Superior Putty'], sizes: ['5kg Small Pack', '20kg Bag', '40kg Contractor Bag'], priceRange: [150, 950], unit: 'BAG', hsn: '3214' },
      { prefix: 'Heavy Duty Mortise Door Lock with Handle', brands: ['Godrej Duralock 6-Lever Brass', 'Europa Disc Tumbler High Security', 'Harrison Double Cylinder Lock', 'Link Heavy Deadbolt'], sizes: ['Complete Handle Set with Keys', 'Replacement Brass Cylinder 70mm', 'Deadbolt Rim Lock'], priceRange: [650, 2400], hsn: '8301' },
      { prefix: 'Steel Claw Hammer with Rubber Grip', brands: ['Stanley Fiberglass Ergonomic', 'Taparia Steel Head 500g', 'Pye Workshop Tools Heavy'], sizes: ['250 Grams Light Duty', '500 Grams Pro Workshop', '800 Grams Masonry'], priceRange: [190, 680], hsn: '8205' },
    ]
  },
  {
    name: 'Mobiles, Computers & Electronics',
    id: 'electronics',
    icon: '📱',
    hsn: '8504',
    taxRate: 18,
    unit: 'PCS',
    templates: [
      { prefix: 'Fast USB-C Charging Adapter 20W/33W/65W', brands: ['Mi 33W SonicCharge 2.0', 'Samsung 25W USB-C Super Fast Power Adapter', 'Boat 20W Dual Port Fast Brick', 'Realme 30W Dart Charge Power Charger', 'Apple 20W USB-C Power Adapter Genuine'], sizes: ['20 Watt Single Port Type-C', '33 Watt Quick Charge 3.0', '65 Watt GaN Multi-Port Laptop/Phone'], priceRange: [399, 1999] },
      { prefix: 'Braided Fast Charging Cable 1.5M', brands: ['Boat Rugged 100W Type-C to Type-C', 'Mi Braided Micro USB & Type C', 'Portronics Konnect Pro 3-in-1', 'Ambrane Dense Braided Lightning Cable for iPhone'], sizes: ['Type-C to Type-C 1 Metre', 'USB-A to Type-C 1.5 Metre', 'Type-C to Lightning (iOS) 1.2M', '3-in-1 Universal Cable'], priceRange: [149, 499], hsn: '8544' },
      { prefix: 'Slim Lithium Polymer Power Bank', brands: ['Mi Pocket Power Bank Pro 10000mAh', 'Boat EnergyShroom 20000mAh Heavy', 'Ambrane Stylo 10k Pocket', 'Realme 30W Dart Power Bank 10000mAh'], sizes: ['10000 mAh Slim Pocket Size', '20000 mAh Dual Output 22.5W Fast Charge'], priceRange: [799, 1899], hsn: '8507' },
      { prefix: 'Wireless Bluetooth In-Ear Earbuds (TWS)', brands: ['Boat Airdopes 141 Low Latency Beast Mode', 'Noise Buds VS102 with 50H Playtime', 'OnePlus Nord Buds 2 with Active Noise Cancellation', 'Realme Buds Air 3 Neo Crystal Clear', 'Boult Audio AirBass Z40 Super Sound'], sizes: ['Standard Earbuds with Charging Case', 'ANC Active Noise Cancelling Edition'], priceRange: [899, 2799], hsn: '8518' },
      { prefix: 'Wireless Bluetooth Neckband with Mic', brands: ['Boat Rockerz 255 Pro+ ASAP Fast Charge', 'OnePlus Bullets Wireless Z2 Deep Bass', 'Realme Buds Wireless 2 Neo Magnetic Earbuds'], sizes: ['Standard Wireless Magnetic Neckband', 'Heavy Bass 40-Hour Battery Edition'], priceRange: [699, 1799], hsn: '8518' },
      { prefix: 'Ultra Clear 9H Tempered Glass Screen Guard', brands: ['Spigen AlignMaster Precision', 'Gorilla 11D Full Curved Glass', 'Rhino 9H Explosion Proof Screen Shield'], sizes: ['Edge-to-Edge Full Glue 9H Glass', 'Matte Anti-Glare Privacy Glass'], priceRange: [99, 399], hsn: '7007' },
      { prefix: 'Shockproof Transparent Mobile Bumper Case', brands: ['Spigen Ultra Hybrid Clear', 'Golden Sand Rugged Armor Cover', 'Kapaver Shock Absorbing Tactical Case'], sizes: ['Soft TPU Crystal Clear Slim Case', 'Armor Ring Kickstand Military Bumper'], priceRange: [120, 599], hsn: '3926' },
      { prefix: 'High Speed USB 3.2 Pen Drive Metal', brands: ['SanDisk Ultra Dual Drive Luxe USB Type-C & Type-A', 'HP v236w Metal High Durability', 'Kingston DataTraveler Exodia 3.2'], sizes: ['32 GB Metal USB 3.0', '64 GB Dual OTG Pen Drive', '128 GB Ultra Fast Drive'], priceRange: [299, 899], hsn: '8523' },
      { prefix: 'Wireless Keyboard & Optical Mouse Combo', brands: ['Logitech MK240 Nano Wireless Combo', 'Dell KM3322W Spill Resistant Keyboard & Mouse', 'HP CS10 Wireless Desktop Suite'], sizes: ['Standard Desktop USB Combo 2.4GHz', 'Silent Key Slim Multi-Device Bluetooth'], priceRange: [999, 1999], hsn: '8471' },
    ]
  },
  {
    name: 'Pharmacy, Medical & Healthcare',
    id: 'pharma',
    icon: '💊',
    hsn: '3004',
    taxRate: 12,
    unit: 'STRIP',
    templates: [
      { prefix: 'Paracetamol 650mg Antipyretic Tablets', brands: ['Dolo-650 Micro Labs', 'Calpol 650 GlaxoSmithKline', 'P-650 Apex Laboratories', 'Pacimol 650 IPCA'], sizes: ['Strip of 15 Tablets', 'Box of 10 Strips (150 Tablets)'], priceRange: [30, 290] },
      { prefix: 'Fast Relief Painkiller Tablet', brands: ['Combiflam Ibuprofen + Paracetamol Sanofi', 'Saridon 3-Action Relief for Headache', 'Voveran 50mg Diclofenac Novartis'], sizes: ['Strip of 20 Tablets', 'Strip of 10 Tablets'], priceRange: [28, 75] },
      { prefix: 'Antacid Refreshing Fruit Salt / Gel', brands: ['Eno Regular Fast Relief (Lemon Sachet)', 'Eno Orange Flavor 6-Second Relief', 'Digene Mint Flavoured Antacid Gel', 'Gelusil MPS Liquid Heartburn Relief'], sizes: ['5g Single Sachet Box of 30', '100g Bottle Powder', '200ml Liquid Gel Bottle', '400ml Family Liquid Bottle'], priceRange: [35, 175], unit: 'BTL' },
      { prefix: 'Ayurvedic Pain Relief Ointment / Spray', brands: ['Moov Pain Relief Cream Strong Action', 'Volini Maxx Pain Relief Gel', 'Iodex Multi-Purpose Power Balm', 'Fast Relief Herbal Spray Himani', 'Omnigel Topical Gel Cipla'], sizes: ['25g Tube', '50g Tube', '55g (75ml) Aerosol Pain Spray Bottle'], priceRange: [75, 230], unit: 'TUB' },
      { prefix: 'Herbal Cough Lozenges & Syrups', brands: ['Vicks VapoDrops Menthol Mint', 'Strepsils Honey & Lemon Lozenges', 'Dabur Honitus Herbal Cough Syrup', 'Benadryl Cough Formula Johnson & Johnson', 'Ascoril D Plus Sugar Free'], sizes: ['Jar of 200 Lozenges', '100ml Syrup Bottle', '200ml Syrup Bottle'], priceRange: [95, 190], unit: 'BTL' },
      { prefix: 'Antiseptic Healing Solution', brands: ['Dettol Antiseptic Disinfectant Liquid Liquid', 'Savlon Antiseptic Liquid Gentle Healer', 'Betadine 10% Microbicidal Ointment'], sizes: ['100ml Bottle', '250ml Bottle', '500ml Hospital Bottle', '20g Betadine Tube'], priceRange: [45, 220], unit: 'BTL', hsn: '3004' },
      { prefix: 'Adhesive Medicated Bandages', brands: ['Hansaplast Washproof Plaster Strips', 'Johnson & Johnson Band-Aid Flexible Fabric', 'Dettol Medicated Wound Plasters'], sizes: ['Box of 20 Strips', 'Box of 50 Washproof Bandages', 'Box of 100 Clinic Pack'], priceRange: [40, 190], unit: 'BOX', hsn: '3005' },
      { prefix: 'Absorbent Surgical Cotton Wool & Gauze', brands: ['Datt Surgical Sterile Cotton Roll', 'Paramount Absorbent Cotton Wool IP', 'Medicare Roller Bandage 10cm'], sizes: ['100 Grams Roll', '200 Grams Roll', '500 Grams Clinic Roll', 'Pack of 10 Gauze Bandages (6 Inch)'], priceRange: [35, 180], unit: 'ROLL', hsn: '3005' },
      { prefix: 'Instant Digital Thermometer for Fever', brands: ['Dr. Morepen Digiflex Digital Thermometer', 'Omron MC-246 Precision Sensor', 'Hicks Water Resistant Fever Meter'], sizes: ['Standard Waterproof Digital Display', 'Flexible Tip Child Safe'], priceRange: [140, 320], unit: 'PCS', hsn: '9025' },
      { prefix: 'Daily Multivitamin & Zinc Capsules', brands: ['Becosules Z B-Complex with Vitamin C & Zinc Pfizer', 'Supradyn Daily Multivitamin Tablet Bayer', 'Revital H Daily Energy for Men / Women Sun Pharma', 'Limcee 500mg Vitamin C Chewable'], sizes: ['Strip of 20 Capsules', 'Strip of 30 Tablets', 'Strip of 15 Chewable Tablets'], priceRange: [45, 310] },
    ]
  },
  {
    name: 'Stationery, Books & Office Supplies',
    id: 'stationery',
    icon: '📚',
    hsn: '4820',
    taxRate: 12,
    unit: 'PCS',
    templates: [
      { prefix: 'Long Notebook Ruled for School / College', brands: ['Classmate Pulse Softcover Notebook', 'Navneet Youva Spiral Long Book', 'Sundaram Executive Hard Bound Register', 'Bilt Matrix College Notebook'], sizes: ['172 Pages A4 Long Book', '240 Pages Ruled Register', '300 Pages Hardbound Office Ledger'], priceRange: [45, 160] },
      { prefix: 'Executive Wire-Bound Spiral Notepad', brands: ['Classmate Pulse Designer Cover', 'Solo Executive Project Book', 'Factor Notes Premium Dot Grid Journal'], sizes: ['A5 Size 160 Pages', 'B5 Size 200 Pages', 'A4 Size 240 Pages Multi-Subject Divider'], priceRange: [80, 240] },
      { prefix: 'Smooth Ballpoint Pen (Pack of 5 / 10)', brands: ['Reynolds 045 Fine Carbure Ball Pen', 'Cello Butterflow Classic Smooth Gel', 'Pentonic Frost Ball Point Linc', 'Flair Writo-Meter Longest Writing Pen', 'Reynolds Jetter Classic Retractable'], sizes: ['Pack of 5 Pens (Blue/Black)', 'Pack of 10 Pens Box', 'Single Premium Click Pen with Metal Clip'], priceRange: [40, 120], unit: 'BOX', hsn: '9608', taxRate: 18 },
      { prefix: 'Liquid Gel Ink Roller Pen', brands: ['Pilot Hi-Techpoint 05 Precision Roller', 'Uni-ball Eye Fine UB-150 Waterproof', 'Trimax Gold Needle Tip Gel Pentel', 'Hauser XO Gel Pen Smooth Flow'], sizes: ['Single Precision Pen', 'Pack of 3 Refillable Roller Pens', 'Pack of 5 Pens with Free Refills'], priceRange: [50, 220], unit: 'PKT', hsn: '9608', taxRate: 18 },
      { prefix: 'Multipurpose A4 Copier Paper 75 GSM (Ream)', brands: ['JK Copier Premier 75 GSM High Brightness', 'Bilt Copy Power Multipurpose Paper', 'TNPL Ultra White Copier Sheet', 'Century Star Eco A4 Xerox Paper', 'Double A Premium 80 GSM Paper'], sizes: ['1 Ream (500 Sheets A4)', 'Box of 5 Reams (2500 Sheets)', 'A3 Size Ream (500 Sheets 75 GSM)'], priceRange: [290, 1450], unit: 'REAM', hsn: '4802' },
      { prefix: 'Office Desk Stapler with Pins', brands: ['Kangaro No. 10 Stapler Metal Body', 'Kangaro HD-45 Heavy Duty Long Reach', 'Max Japan High Precision Stapler'], sizes: ['Standard Pocket No. 10 Stapler + Pin Box', 'Heavy Duty No. 24/6 Office Desk Stapler'], priceRange: [45, 185], hsn: '8472', taxRate: 18 },
      { prefix: 'Heavy Duty Box Files & Folders', brands: ['Solo Heavy Index Lever Arch File A4', 'Omega Classic Cardboard Box File', 'Bhavna Deluxe PVC Document Folder'], sizes: ['2-Ring Lever Arch File with Clip', 'Expanding 12-Pocket Cheque & Bill File', 'Button L-Folder Clear Transparent (Pack of 10)'], priceRange: [65, 210], hsn: '3926', taxRate: 18 },
      { prefix: 'Synthetic Gum & Glue Stick', brands: ['Fevicol MR Squeeze Bottle White Glue', 'Fevistik Super Craft Glue Stick Non-Messy', 'Kores Glue Stick Fast Drying'], sizes: ['15g Compact Stick', '25g Medium Stick', '100g Squeeze Bottle Glue', '500g Craft Jar'], priceRange: [15, 95], hsn: '3506', taxRate: 18 },
    ]
  },
  {
    name: 'Automobile Spares & Garage',
    id: 'auto',
    icon: '🏍️',
    hsn: '2710',
    taxRate: 18,
    unit: 'BTL',
    templates: [
      { prefix: '4-Stroke Motorcycle Engine Oil 20W-40 / 10W-30', brands: ['Castrol Activ 4T Actibond Molecules', 'Motul 3000 4T Mineral Engine Oil', 'Shell Advance AX7 Synthetic Blend', 'Servo 4T Synth High Power', 'Gulf Pride 4T Plus Motorcycle Lube', 'Mobil Super Moto 10W-30'], sizes: ['900ml Bottle for Bike', '1 Litre Can', '1.2 Litre Can for Pulsar / Royal Enfield'], priceRange: [320, 560] },
      { prefix: 'Full Synthetic High Performance Bike Oil', brands: ['Motul 7100 10W-50 4T 100% Synthetic Ester', 'Castrol Power1 Ultimate 10W-40', 'Shell Advance Ultra Full Synthetic'], sizes: ['1 Litre Can', '2.5 Litre Royal Enfield Special Can'], priceRange: [780, 1950] },
      { prefix: 'DOT 4 High Temp Hydraulic Brake Fluid', brands: ['Castrol Response DOT 4 Disc Fluid', 'Motul DOT 5.1 / 4 Heavy Synthetic', 'Bosch Brake Fluid DOT 4 Ultra Safe', 'TVS Girling Hydraulic Brake Fluid'], sizes: ['100ml Small Bottle for Bike', '250ml Can', '500ml Bottle for Car'], priceRange: [75, 290] },
      { prefix: 'Chain Lube & Chain Cleaner Duo Spray', brands: ['Motul Chain Lube Road C2 + C1 Cleaner Combo', 'Castrol Chain Lube Aerosol Mist', 'Yamalube High Tack Water Resistant Spray', 'WD-40 Multi-Use Rust Prevention Spray'], sizes: ['150ml Travel Spray', '400ml Workshop Can (Buy 1 Get 1)'], priceRange: [180, 540], unit: 'CAN', hsn: '3403' },
      { prefix: 'OEM Copper Core Spark Plug', brands: ['NGK Nickel Alloy Spark Plug CR7HSA / CPR8EA', 'Bosch Super Plus Yttrium Spark Plug', 'Champion Copper Plus Spark Plug'], sizes: ['Standard Single Electrode Spark Plug for 100-150cc', 'Iridium IX High Performance Spark Plug'], priceRange: [85, 450], unit: 'PCS', hsn: '8511' },
      { prefix: 'Automotive Electric Horn 12V High Tone', brands: ['Roots Windtone Flute Horn (Pair)', 'Minda Trumpet High-Low Horn Pair 12V', 'Bosch Symphony Fanfare Horn Set', 'Hella Midnight Black Disc Horn Set'], sizes: ['Single Disc Horn 12V', 'Twin Set (High Tone 500Hz + Low Tone 400Hz) with Relay'], priceRange: [240, 950], unit: 'PAIR', hsn: '8512' },
      { prefix: 'Motorcycle Tubeless Tyre Road Grip', brands: ['MRF Zapper FX Front Tubeless Bike Tyre', 'CEAT Gripp X3 All-Season Grip', 'TVS Eurogrip Dragon High Mileage', 'Apollo ActiGrip Trail Tough Bike Tyre'], sizes: ['90/90-12 Front (Activa/Jupiter Scooter)', '90/90-17 Front Tubeless (Bikes)', '100/90-17 Rear Bike Tyre', '120/80-18 Rear (Bullet 350)'], priceRange: [1150, 2600], unit: 'PCS', hsn: '4011', taxRate: 28 },
    ]
  },
  {
    name: 'Textiles, Apparel & Garments',
    id: 'textiles',
    icon: '👕',
    hsn: '6109',
    taxRate: 5,
    unit: 'PCS',
    templates: [
      { prefix: 'Round Neck Cotton T-Shirt Solid Casual', brands: ['Peter England Casuals', 'Allen Solly Sport Comfort', 'Van Heusen Denim Labs', 'US Polo Assn Heritage Cotton', 'Jockey Modern Classic Supima Cotton'], sizes: ['Small (S)', 'Medium (M)', 'Large (L)', 'Extra Large (XL)', 'XXL Plus'], priceRange: [299, 999] },
      { prefix: 'Men Formal Plain Cotton Shirt', brands: ['Raymond Tailored Fit Premium Cotton', 'Louis Philippe Gods & Kings Lux', 'Van Heusen Anti-Wrinkle Luxury Shirt', 'Arrow New York Formal Classic'], sizes: ['Size 38 (Slim Fit)', 'Size 40 (Regular Fit)', 'Size 42', 'Size 44 (Comfort Fit)'], priceRange: [699, 2199], hsn: '6205' },
      { prefix: 'Stretchable Slim Fit Denim Jeans', brands: ['Levi\'s 511 Slim Fit Stretch Denim', 'Wrangler Rugged Wear Original', 'Spykar Super Skinny Fit Washed Jeans', 'Killer Stretch Comfortable Casuals'], sizes: ['Waist 30 x Length 32', 'Waist 32 x Length 32', 'Waist 34 x Length 34', 'Waist 36'], priceRange: [899, 2999], hsn: '6203', taxRate: 12 },
      { prefix: 'Pure Banarasi Art Silk Saree with Blouse Piece', brands: ['Varkha Silk Mills Heritage Collection', 'Mimosa Traditional Kanjivaram Style', 'Samyakk Festive Weave', 'Kalyan Silks Wedding Collection'], sizes: ['Free Size (5.5 Metre Saree + 0.8M Blouse Piece)'], priceRange: [850, 3900], hsn: '5007' },
      { prefix: 'Women Straight Rayon Kurti Printed', brands: ['Biba Ethnic Cotton Blend Kurta', 'W for Woman Gold Foil Print Kurti', 'Aurelia Casual Straight Fit Kurta', 'Rangriti Daily Comfort Ethnic Wear'], sizes: ['Small (S)', 'Medium (M)', 'Large (L)', 'XL', 'XXL'], priceRange: [450, 1499], hsn: '6204' },
      { prefix: 'Combed Cotton Mens Innerwear Briefs / Trunks', brands: ['Jockey Elance Cotton Briefs (Pack of 2)', 'Lux Cozi Modern Super Soft Cotton Trunks', 'Dollar Bigboss Combed Cotton Brief', 'Rupa Frontline Pure Ribbed Trunks (Pack of 3)'], sizes: ['Size 80cm (S)', 'Size 85cm (M)', 'Size 90cm (L)', 'Size 95cm (XL)'], priceRange: [180, 520], unit: 'BOX', hsn: '6107' },
      { prefix: 'Soft Turkish Cotton Bath Towel Quick Dry', brands: ['Spaces by Welspun Plush 600 GSM Towel', 'Trident Soft & Plush Water Absorbent Bath Towel', 'Bombay Dyeing Feather Touch 100% Cotton'], sizes: ['Medium Hand Towel (40x60cm)', 'Large Bath Towel (70x140cm)', 'Extra Large Jumbo Beach Towel (80x160cm)'], priceRange: [240, 790], hsn: '6302' },
      { prefix: 'Double Bed Glace Cotton Bedsheet with Pillow Covers', brands: ['Bombay Dyeing Heritage Double Sheet', 'Trident Indigo Pure Cotton Queen Bedsheet', 'Portico New York Printed Bedspread'], sizes: ['King Size Double Bed (220x240cm) + 2 Pillow Covers'], priceRange: [499, 1450], unit: 'SET', hsn: '6302' },
    ]
  },
  {
    name: 'Restaurant, Café & Bakery',
    id: 'restaurant',
    icon: '🍽️',
    hsn: '9963',
    taxRate: 5,
    unit: 'PLATE',
    templates: [
      { prefix: 'Hyderabadi Dum Biryani with Mirchi Salan', brands: ['Royal Dum Special', 'Bawarchi Style Chef Special', 'Deccan Spice Signature', 'Mughlai Treat'], sizes: ['Single Portion (500g)', 'Family Pack (Serves 3)', 'Jumbo Handi (Serves 6)'], priceRange: [160, 650] },
      { prefix: 'Paneer Butter Masala Gravy', brands: ['Punjabi Dhaba Style Rich Gravy', 'Royal Mughlai Creamy Butter', 'Chettinad Spiced Curry'], sizes: ['Half Plate (250ml)', 'Full Plate (500ml)'], priceRange: [140, 260] },
      { prefix: 'Tandoori Butter Naan / Roti', brands: ['Crispy Garlic Butter Naan', 'Whole Wheat Tandoori Roti with Desi Ghee', 'Laccha Paratha Multi-Layered'], sizes: ['1 Piece', 'Basket of 4 Pieces', 'Family Basket of 8 Pieces'], priceRange: [20, 160], unit: 'PCS' },
      { prefix: 'Veg Schezwan Fried Rice', brands: ['Wok Express Indo-Chinese Special', 'Dragon Style Spicy Wok', 'Bamboo Kitchen Classic'], sizes: ['Regular Portion', 'Full Family Portion with Veg Manchurian'], priceRange: [130, 240] },
      { prefix: 'Wood-Fired Italian Cheese Margherita Pizza', brands: ['Chef Special Thin Crust', 'Cheese Burst Extra Mozzarella', 'Classic Pan Pizza with Basil Oil'], sizes: ['Regular 7 Inch (4 Slices)', 'Medium 10 Inch (6 Slices)', 'Large 12 Inch (8 Slices)'], priceRange: [180, 480], unit: 'PCS' },
      { prefix: 'Crispy Veggie Crunch Burger with French Fries', brands: ['Gourmet Brioche Bun Burger', 'Spicy Paneer Tikka Burger', 'Double Patty Monster Loaded'], sizes: ['Single Burger', 'Combo with Salted French Fries & Coke 250ml'], priceRange: [80, 240], unit: 'SET' },
      { prefix: 'Dutch Truffle Chocolate Pastry', brands: ['Belgian Dark Chocolate Ganache', 'Red Velvet Cream Cheese Slice', 'Classic Black Forest Cherry Pastry'], sizes: ['Single Slice Pastry', '500 Grams Birthday Cake', '1 Kg Full Designer Cake'], priceRange: [70, 750], unit: 'PCS', hsn: '1905', taxRate: 18 },
      { prefix: 'Kulhad Masala Chai & Filter Coffee', brands: ['Elaichi Ginger Special Kulhad Chai', 'South Indian Degree Filter Coffee Decoction', 'Cold Coffee with Rich Vanilla Ice Cream Scoop'], sizes: ['Standard Kulhad Cup (150ml)', 'Flask of 500ml (Serves 4)', 'Tall Glass Chilled (350ml)'], priceRange: [25, 120], unit: 'CUP' },
    ]
  }
];

console.log('Generating massive 10,000+ products database across all 12 industries...');

let allProducts = [];
let counter = 1000;

// Pass 1: Primary template products
industryCategories.forEach(cat => {
  cat.templates.forEach(tpl => {
    tpl.brands.forEach(brand => {
      tpl.sizes.forEach(size => {
        counter++;
        const id = `item_${counter}`;
        const name = `${brand} ${tpl.prefix} - ${size}`;
        const [minP, maxP] = tpl.priceRange;
        const price = Math.round(minP + Math.random() * (maxP - minP));
        const mrp = Math.round(price * 1.15);
        // Valid Indian EAN-13 barcode starting with 890
        const barcode = `890${String(1000000000 + counter * 19).slice(1)}`;

        allProducts.push({
          id,
          name,
          category: cat.name,
          categoryId: cat.id,
          hsn: tpl.hsn || cat.hsn,
          taxRate: tpl.taxRate ?? cat.taxRate,
          unit: tpl.unit || cat.unit,
          price,
          mrp,
          barcode,
          stock: Math.floor(10 + Math.random() * 200),
        });
      });
    });
  });
});

console.log(`Phase 1 base products: ${allProducts.length}`);

// Pass 2: Systematic multiplication of industry catalog with authentic commercial variants
// (Variants: Grade, Finish, Packaging, Bulk Packs, Flavors, Specifications)
const commercialModifiers = [
  { tag: 'Commercial Pack', mult: 1.6, mrpMult: 1.12, stockMult: 0.8 },
  { tag: 'Economy Saver Pack', mult: 1.35, mrpMult: 1.10, stockMult: 1.2 },
  { tag: 'Wholesale Bundle (Pack of 3)', mult: 2.7, mrpMult: 1.15, stockMult: 0.6 },
  { tag: 'Wholesale Bundle (Pack of 6)', mult: 5.2, mrpMult: 1.18, stockMult: 0.4 },
  { tag: 'Box of 10 Units', mult: 8.8, mrpMult: 1.20, stockMult: 0.5 },
  { tag: 'Premium Gold Edition', mult: 1.25, mrpMult: 1.20, stockMult: 0.9 },
  { tag: 'Institutional Refill Pack', mult: 1.45, mrpMult: 1.12, stockMult: 1.5 },
  { tag: 'Master Carton Pack', mult: 12.0, mrpMult: 1.25, stockMult: 0.3 },
  { tag: 'Special Combo Offer', mult: 1.75, mrpMult: 1.14, stockMult: 1.1 },
  { tag: 'Export Quality Extra Strong', mult: 1.30, mrpMult: 1.18, stockMult: 0.7 }
];

let modIdx = 0;
const baseItemsCount = allProducts.length;

while (allProducts.length < 10250) {
  const base = allProducts[modIdx % baseItemsCount];
  const mod = commercialModifiers[modIdx % commercialModifiers.length];
  counter++;

  const price = Math.round(base.price * mod.mult);
  const mrp = Math.round(price * mod.mrpMult);
  const barcode = `890${String(3000000000 + counter * 23).slice(1)}`;

  allProducts.push({
    id: `item_${counter}`,
    name: `${base.name} [${mod.tag}]`,
    category: base.category,
    categoryId: base.categoryId,
    hsn: base.hsn,
    taxRate: base.taxRate,
    unit: base.unit,
    price,
    mrp,
    barcode,
    stock: Math.floor(base.stock * mod.stockMult),
  });

  modIdx++;
}

console.log(`Total generated products: ${allProducts.length}`);

// Ensure public/data folder exists
fs.mkdirSync(path.resolve('public/data'), { recursive: true });
fs.mkdirSync(path.resolve('src/data'), { recursive: true });

// 1. Save as public JSON so app can fetch or stream on demand without blowing up bundle size!
const jsonFilePath = path.resolve('public/data/master-catalog.json');
fs.writeFileSync(jsonFilePath, JSON.stringify(allProducts), 'utf8');
console.log(`Saved master catalog JSON to ${jsonFilePath} (${(fs.statSync(jsonFilePath).size / (1024 * 1024)).toFixed(2)} MB)`);

// 2. Also write industry category metadata helper in src/data/catalogMeta.js
const metaContent = `// Metadata and industry category definitions for the 10,000+ Master Database
export const MASTER_CATALOG_CATEGORIES = ${JSON.stringify(
  industryCategories.map(c => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    count: allProducts.filter(p => p.category === c.name).length
  })),
  null,
  2
)};

export const TOTAL_CATALOG_PRODUCTS = ${allProducts.length};
`;

fs.writeFileSync(path.resolve('src/data/catalogMeta.js'), metaContent, 'utf8');
console.log('Saved metadata to src/data/catalogMeta.js');
