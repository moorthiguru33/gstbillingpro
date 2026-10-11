import fs from 'fs';
import path from 'path';

// Deterministic PRNG (mulberry32) so every build/regeneration produces the
// exact same catalogue - prices, stock and barcodes no longer change between
// deploys.
let prngState = 20261011;
const rand = () => {
  prngState = (prngState + 0x6D2B79F5) | 0;
  let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const categories = [
  {
    name: 'Grocery & Staples',
    hsn: '1006',
    taxRate: 5,
    unit: 'KG',
    templates: [
      { prefix: 'Basmati Rice', brands: ['India Gate', 'Daawat', 'Fortune', 'Kohinoor', 'Lal Qilla'], sizes: ['1kg', '5kg', '10kg', '25kg'], priceRange: [90, 450] },
      { prefix: 'Sona Masoori Rice', brands: ['Royal', 'Bawarchi', 'Double Horse', 'Ponni'], sizes: ['5kg', '10kg', '25kg'], priceRange: [55, 320] },
      { prefix: 'Chakki Fresh Atta', brands: ['Aashirvaad', 'Fortune', 'Pillsbury', 'Shakti Bhog', 'Nature Fresh'], sizes: ['1kg', '5kg', '10kg'], priceRange: [42, 380] },
      { prefix: 'Toor Dal Premium', brands: ['Tata Sampann', 'Fortune', 'Organic Tattva', 'Rajdhani'], sizes: ['500g', '1kg', '2kg'], priceRange: [140, 180] },
      { prefix: 'Moong Dal Dhuli', brands: ['Tata Sampann', 'Fortune', 'Catch', 'Rajdhani'], sizes: ['500g', '1kg'], priceRange: [110, 140] },
      { prefix: 'Chana Dal', brands: ['Tata Sampann', 'Fortune', 'Rajdhani', 'Nature Fresh'], sizes: ['500g', '1kg'], priceRange: [85, 110] },
      { prefix: 'Urad Dal Gota', brands: ['Tata Sampann', 'Fortune', 'Double Horse'], sizes: ['500g', '1kg'], priceRange: [130, 160] },
      { prefix: 'Kabuli Chana (Chickpeas)', brands: ['Tata Sampann', 'Fortune', 'Catch'], sizes: ['500g', '1kg'], priceRange: [120, 160] },
      { prefix: 'Rajma Chitra', brands: ['Tata Sampann', 'Rajdhani', 'Catch'], sizes: ['500g', '1kg'], priceRange: [130, 170] },
      { prefix: 'Refined Sunflower Oil', brands: ['Fortune Sunlite', 'Saffola Gold', 'Gemini', 'Sundrop', 'Dhara'], sizes: ['1L', '5L', '15L'], priceRange: [125, 680], unit: 'LTR', hsn: '1512' },
      { prefix: 'Mustard Oil (Kachi Ghani)', brands: ['Fortune', 'Dhara', 'Engine', 'Patanjali', 'Bail Kolhu'], sizes: ['1L', '2L', '5L'], priceRange: [145, 750], unit: 'LTR', hsn: '1514' },
      { prefix: 'Pure Cow Ghee', brands: ['Amul', 'Gowardhan', 'Mother Dairy', 'Patanjali', 'Nestle Everyday'], sizes: ['200ml', '500ml', '1L'], priceRange: [150, 650], unit: 'LTR', hsn: '0405', taxRate: 12 },
      { prefix: 'Iodised Salt', brands: ['Tata Salt', 'Aashirvaad Salt', 'Catch', 'Patanjali', 'Saffola'], sizes: ['1kg'], priceRange: [24, 30], unit: 'PKT', hsn: '2501', taxRate: 0 },
      { prefix: 'Refined White Sugar', brands: ['Madhur Pure & Hygienic', 'Trust', 'Mawana', 'Uttam'], sizes: ['1kg', '5kg'], priceRange: [46, 230], unit: 'KG', hsn: '1701', taxRate: 5 },
      { prefix: 'Turmeric Powder (Haldi)', brands: ['Everest', 'MDH', 'Catch', 'Tata Sampann', 'Ramdev'], sizes: ['100g', '200g', '500g'], priceRange: [35, 140], unit: 'PKT', hsn: '0910' },
      { prefix: 'Red Chilli Powder (Lal Mirch)', brands: ['Everest Tikhalal', 'MDH Deggi Mirch', 'Catch', 'Tata Sampann'], sizes: ['100g', '200g', '500g'], priceRange: [45, 195], unit: 'PKT', hsn: '0904' },
      { prefix: 'Coriander Powder (Dhania)', brands: ['Everest', 'MDH', 'Catch', 'Tata Sampann'], sizes: ['100g', '200g', '500g'], priceRange: [38, 145], unit: 'PKT', hsn: '0909' },
      { prefix: 'Garam Masala Blend', brands: ['Everest', 'MDH', 'Catch', 'Badshah'], sizes: ['50g', '100g'], priceRange: [42, 85], unit: 'PKT', hsn: '0910' },
      { prefix: 'Cumin Seeds (Jeera)', brands: ['Everest', 'Catch', 'Tata Sampann'], sizes: ['100g', '200g', '500g'], priceRange: [65, 320], unit: 'PKT', hsn: '0909' },
      { prefix: 'Mustard Seeds (Rai)', brands: ['Everest', 'Catch', 'Tata Sampann'], sizes: ['100g', '200g'], priceRange: [25, 48], unit: 'PKT', hsn: '1207' },
      { prefix: 'Poha (Flattened Rice)', brands: ['Tata Sampann', 'Fortune', 'Rajdhani'], sizes: ['500g', '1kg'], priceRange: [38, 72], unit: 'PKT', hsn: '1904' },
      { prefix: 'Sooji (Semolina / Rawa)', brands: ['Fortune', 'Rajdhani', 'Aashirvaad'], sizes: ['500g', '1kg'], priceRange: [32, 60], unit: 'PKT', hsn: '1103' },
      { prefix: 'Besan (Gram Flour)', brands: ['Fortune', 'Rajdhani', 'Tata Sampann'], sizes: ['500g', '1kg'], priceRange: [55, 105], unit: 'PKT', hsn: '1106' },
      { prefix: 'Maida (All Purpose Flour)', brands: ['Rajdhani', 'Fortune', 'Aashirvaad'], sizes: ['500g', '1kg'], priceRange: [30, 58], unit: 'PKT', hsn: '1101' },
    ]
  },
  {
    name: 'Snacks, Biscuits & Beverages',
    hsn: '1905',
    taxRate: 18,
    unit: 'PKT',
    templates: [
      { prefix: 'Glucose Biscuits', brands: ['Parle-G', 'Britannia Tiger', 'Sunfeast Glucose'], sizes: ['100g', '250g', '800g'], priceRange: [10, 80] },
      { prefix: 'Marie Biscuits', brands: ['Britannia Marie Gold', 'Sunfeast Marie Light', 'Parle Marie'], sizes: ['150g', '300g'], priceRange: [20, 45] },
      { prefix: 'Cream Biscuits', brands: ['Oreo Vanilla', 'Oreo Chocolate', 'Sunfeast Dark Fantasy', 'Britannia Bourbon', 'Parle Hide & Seek'], sizes: ['100g', '120g', '300g'], priceRange: [30, 110] },
      { prefix: 'Good Day Butter Cookies', brands: ['Britannia Good Day Butter', 'Britannia Good Day Cashew'], sizes: ['100g', '200g', '600g'], priceRange: [25, 120] },
      { prefix: 'Instant Noodles 2-Minute', brands: ['Maggi Masala', 'Yippee Magic Masala', 'Top Ramen Curry', 'Ching Secret Schezwan'], sizes: ['70g', '140g', '280g (Pack of 4)', '560g (Pack of 8)'], priceRange: [14, 115], hsn: '1902' },
      { prefix: 'Potato Chips', brands: ['Lay\'s India\'s Magic Masala', 'Lay\'s Classic Salted', 'Lay\'s American Style Cream & Onion', 'Bingo Tedhe Medhe', 'Kurkure Masala Munch'], sizes: ['30g', '50g', '90g'], priceRange: [10, 40], hsn: '2005' },
      { prefix: 'Namkeen Bhujia', brands: ['Haldiram\'s Aloo Bhujia', 'Bikaji Bhujia Sev', 'Haldiram\'s Plain Bhujia', 'Bikanervala'], sizes: ['150g', '400g', '1kg'], priceRange: [45, 260], hsn: '2106', taxRate: 12 },
      { prefix: 'Khatta Meetha Mixture', brands: ['Haldiram\'s', 'Bikaji', 'Chhajed'], sizes: ['200g', '400g'], priceRange: [50, 100], hsn: '2106', taxRate: 12 },
      { prefix: 'Moong Dal Fried', brands: ['Haldiram\'s', 'Bikaji'], sizes: ['150g', '350g'], priceRange: [45, 110], hsn: '2106', taxRate: 12 },
      { prefix: 'Chocolate Bar', brands: ['Cadbury Dairy Milk', 'Cadbury Dairy Milk Silk', 'Nestle KitKat', 'Nestle Munch', 'Cadbury 5 Star'], sizes: ['20g', '45g', '60g', '150g'], priceRange: [15, 175], hsn: '1806' },
      { prefix: 'Tomato Ketchup Bottle', brands: ['Kissan Fresh Tomato Ketchup', 'Maggi Rich Tomato Sauce', 'Heinz Tomato Ketchup'], sizes: ['500g', '950g', '1kg'], priceRange: [95, 160], unit: 'BTL', hsn: '2103', taxRate: 12 },
      { prefix: 'Tea Leaves (Chai Patti)', brands: ['Tata Tea Gold', 'Tata Tea Premium', 'Red Label Natural Care', 'Taj Mahal', 'Wagh Bakri'], sizes: ['250g', '500g', '1kg'], priceRange: [120, 480], unit: 'PKT', hsn: '0902', taxRate: 5 },
      { prefix: 'Instant Coffee Powder', brands: ['Nescafe Classic', 'Bru Instant', 'Tata Coffee Grand', 'Nescafe Sunrise'], sizes: ['50g', '100g', '200g'], priceRange: [110, 420], unit: 'JAR', hsn: '2101' },
      { prefix: 'Health Drink Powder', brands: ['Horlicks Classic Malt', 'Boost Energy', 'Bournvita Pro Health', 'Complan Royal Chocolate'], sizes: ['500g', '1kg'], priceRange: [240, 450], unit: 'JAR', hsn: '1901' },
      { prefix: 'Carbonated Soft Drink', brands: ['Coca-Cola', 'Thums Up', 'Sprite', 'Pepsi', 'Limca', 'Mountain Dew'], sizes: ['250ml Can', '750ml PET', '2.25L Bottle'], priceRange: [35, 95], unit: 'BTL', hsn: '2202', taxRate: 28 },
      { prefix: 'Packaged Drinking Water', brands: ['Bisleri', 'Kinley', 'Aquafina', 'Bailley'], sizes: ['500ml', '1L', '2L', '20L Jar'], priceRange: [10, 80], unit: 'BTL', hsn: '2201' },
      { prefix: 'Fruit Juice Pack', brands: ['Real Mixed Fruit', 'Real Mango', 'Tropicana 100% Orange', 'Paper Boat Aamras'], sizes: ['200ml', '1L'], priceRange: [20, 125], unit: 'PKT', hsn: '2009', taxRate: 12 },
    ]
  },
  {
    name: 'Dairy & Bakery',
    hsn: '0401',
    taxRate: 5,
    unit: 'PKT',
    templates: [
      { prefix: 'Pasteurised Toned Milk', brands: ['Amul Taaza', 'Mother Dairy Toned', 'Nandini', 'Aavin', 'Verka'], sizes: ['500ml', '1L'], priceRange: [27, 54] },
      { prefix: 'Full Cream Milk', brands: ['Amul Gold', 'Mother Dairy Full Cream', 'Nandini Special'], sizes: ['500ml', '1L'], priceRange: [33, 66] },
      { prefix: 'Pasteurised Butter', brands: ['Amul Butter (Salted)', 'Mother Dairy Butter', 'Nandini Butter'], sizes: ['100g', '500g'], priceRange: [56, 275], hsn: '0405', taxRate: 12 },
      { prefix: 'Fresh Paneer Block', brands: ['Amul Malai Paneer', 'Mother Dairy Paneer', 'Gowardhan Paneer'], sizes: ['200g', '500g', '1kg'], priceRange: [85, 390], hsn: '0406' },
      { prefix: 'Curd / Dahi Pouch', brands: ['Amul Masti Dahi', 'Mother Dairy Classic Dahi', 'Nandini Dahi'], sizes: ['200g', '400g', '1kg'], priceRange: [18, 70] },
      { prefix: 'Cheese Slices Pack', brands: ['Amul Cheese Slices (10s)', 'Britannia Cheese Slices', 'Go Cheese'], sizes: ['200g (10 slices)', '400g (20 slices)'], priceRange: [140, 270], hsn: '0406', taxRate: 12 },
      { prefix: 'Cheese Cubes Box', brands: ['Amul Processed Cheese Cubes', 'Britannia Cheese Cubes'], sizes: ['200g (8 cubes)', '500g'], priceRange: [135, 310], unit: 'BOX', hsn: '0406', taxRate: 12 },
      { prefix: 'White Sandwich Bread', brands: ['Britannia Daily Fresh', 'Modern Family Special', 'Harvest Gold White'], sizes: ['400g', '700g'], priceRange: [35, 60], hsn: '1905', taxRate: 0 },
      { prefix: 'Brown / Whole Wheat Bread', brands: ['Britannia 100% Whole Wheat', 'Harvest Gold Brown', 'Modern 100% Whole Wheat'], sizes: ['400g'], priceRange: [45, 55], hsn: '1905', taxRate: 0 },
      { prefix: 'Condensed Milk Tin', brands: ['Nestle Milkmaid', 'Amul Mithai Mate'], sizes: ['400g'], priceRange: [135, 145], unit: 'CAN', hsn: '0402', taxRate: 12 },
    ]
  },
  {
    name: 'Personal Care & Hygiene',
    hsn: '3401',
    taxRate: 18,
    unit: 'PCS',
    templates: [
      { prefix: 'Bathing Soap Bar', brands: ['Dettol Original', 'Lifebuoy Total', 'Lux Rose', 'Dove Cream Beauty', 'Pears Pure & Gentle', 'Medimix Ayurvedic', 'Santoor Sandal'], sizes: ['75g', '125g', 'Pack of 3 (125g)', 'Pack of 4 (75g)'], priceRange: [28, 180] },
      { prefix: 'Toothpaste Tube', brands: ['Colgate Strong Teeth', 'Colgate Total', 'Closeup Red Hot Gel', 'Sensodyne Fresh Mint', 'Dabur Red Paste', 'Pepsodent Expert'], sizes: ['100g', '150g', '200g', '300g (Pack of 2)'], priceRange: [60, 210], hsn: '3306' },
      { prefix: 'Toothbrush Ergonomic', brands: ['Oral-B Shiny Clean', 'Colgate Super Flexi', 'Sensodyne Sensitive'], sizes: ['Medium 1 Pc', 'Pack of 4 Triple Action'], priceRange: [25, 95], hsn: '9603' },
      { prefix: 'Hair Shampoo Bottle', brands: ['Head & Shoulders Cool Menthol', 'Clinic Plus Strong & Long', 'Dove Daily Shine', 'Pantene Pro-V Hair Fall Control', 'Tresemme Keratin Smooth', 'Sunsilk Black Shine'], sizes: ['80ml', '180ml', '340ml', '650ml Pump'], priceRange: [55, 520], unit: 'BTL', hsn: '3305' },
      { prefix: 'Hair Oil Bottle', brands: ['Parachute Pure Coconut Oil', 'Bajaj Almond Drops', 'Dabur Amla Hair Oil', 'Navratna Ayurvedic Cool Oil'], sizes: ['100ml', '200ml', '500ml'], priceRange: [42, 210], unit: 'BTL', hsn: '3305' },
      { prefix: 'Liquid Handwash Refill', brands: ['Dettol Original Handwash', 'Lifebuoy Total Handwash', 'Savlon Moisture Shield', 'Godrej Protekt'], sizes: ['175ml Pouch', '675ml Refill Pouch', '1.5L Big Pack'], priceRange: [35, 185], unit: 'PKT', hsn: '3402' },
      { prefix: 'Face Wash Gel', brands: ['Himalaya Purifying Neem', 'Garnier Men Acno Fight', 'Clean & Clear Foaming', 'Nivea Dark Spot Reduction'], sizes: ['50ml', '100ml', '150ml'], priceRange: [75, 230], unit: 'TUBE', hsn: '3304' },
      { prefix: 'Skin Moisturising Cream / Lotion', brands: ['Nivea Soft Light Moisturiser', 'Vaseline Total Moisture Body Lotion', 'Ponds Cold Cream', 'Boroline Antiseptic'], sizes: ['50ml', '100ml', '400ml Pump'], priceRange: [45, 340], unit: 'BTL', hsn: '3304' },
      { prefix: 'Deodorant Spray Can', brands: ['Fogg Marco', 'Axe Signature Champion', 'Wild Stone Edge', 'Nivea Men Fresh Active', 'Engage W1 Perfume Spray'], sizes: ['150ml Can'], priceRange: [180, 250], unit: 'PCS', hsn: '3307' },
      { prefix: 'Shaving Cream / Foam', brands: ['Gillette Foamy Regular', 'Old Spice Original Shaving Cream', 'Dettol Cool Shaving Cream'], sizes: ['70g', '200g Can'], priceRange: [65, 175], unit: 'PCS', hsn: '3307' },
      { prefix: 'Shaving Razor / Blades', brands: ['Gillette Mach 3 Razor', 'Gillette Guard Razor', 'Gillette Guard Blade Pack (6s)', '7 O Clock Super Platinum (5s)'], sizes: ['1 Pc', 'Pack of 5'], priceRange: [25, 299], unit: 'PKT', hsn: '8212' },
    ]
  },
  {
    name: 'Household & Cleaning',
    hsn: '3402',
    taxRate: 18,
    unit: 'PKT',
    templates: [
      { prefix: 'Washing Powder / Detergent', brands: ['Surf Excel Quick Wash', 'Surf Excel Easy Wash', 'Ariel Matic Front Load', 'Tide Plus Double Power', 'Rin Advanced', 'Wheel Active 2 in 1', 'Ghadi Detergent'], sizes: ['500g', '1kg', '2kg', '4kg + 1kg Free'], priceRange: [50, 650] },
      { prefix: 'Liquid Detergent Bottle', brands: ['Surf Excel Matic Top Load Liquid', 'Ariel Matic Liquid', 'Genteel Liquid Detergent'], sizes: ['500ml', '1L', '2L'], priceRange: [110, 410], unit: 'BTL' },
      { prefix: 'Detergent Bar / Cake', brands: ['Rin Detergent Bar', 'Surf Excel Stain Eraser Bar', 'Wheel Active Bar'], sizes: ['140g', '250g', 'Pack of 4 (250g)'], priceRange: [15, 60], unit: 'PCS', hsn: '3401' },
      { prefix: 'Dishwash Bar', brands: ['Vim Dishwash Bar with Lemon', 'Exo Touch & Shine Bar', 'Pril Tamarind Bar'], sizes: ['135g', '300g Tub', '500g Bar'], priceRange: [10, 52], unit: 'PCS' },
      { prefix: 'Dishwash Gel Liquid', brands: ['Vim Gel Lemon', 'Pril Kraft Dishwash Gel', 'Scotch-Brite Cleanmatic'], sizes: ['250ml', '500ml', '750ml Pouch', '2L Big Jar'], priceRange: [55, 340], unit: 'BTL' },
      { prefix: 'Toilet Cleaner Liquid', brands: ['Harpic Power Plus Original', 'Harpic Platinum Bleach', 'Sanifresh Ultra Shine'], sizes: ['200ml', '500ml', '1L'], priceRange: [40, 180], unit: 'BTL' },
      { prefix: 'Floor Cleaner Surface Disinfectant', brands: ['Lizol Citrus', 'Lizol Floral', 'Nimyle Herbal Floor Cleaner', 'Dettol Multi-Action Cleaner'], sizes: ['500ml', '1L', '2L'], priceRange: [85, 290], unit: 'BTL' },
      { prefix: 'Mosquito Vaporizer Machine & Refill', brands: ['All Out Ultra Refill', 'Goodknight Gold Flash Refill', 'Mortein 2-in-1 Vaporizer'], sizes: ['45ml Twin Pack', 'Machine + Refill Pack'], priceRange: [75, 145], unit: 'PKT', hsn: '3808' },
      { prefix: 'Garbage Disposal Bags Roll', brands: ['Shalimar Premium Oxo-Biodegradable', 'Ezee Garbage Bags'], sizes: ['Medium 30 Bags', 'Large 30 Bags (19x21)'], priceRange: [75, 120], unit: 'ROLL', hsn: '3923' },
      { prefix: 'Kitchen Scrub Pad & Sponge', brands: ['Scotch-Brite Heavy Duty Scrub Pad', 'Scotch-Brite Sponge Wipe (3s)'], sizes: ['Pack of 3', 'Pack of 5'], priceRange: [30, 95], unit: 'PKT', hsn: '6805' },
    ]
  },
  {
    name: 'Stationery & Office Supplies',
    hsn: '4820',
    taxRate: 12,
    unit: 'PCS',
    templates: [
      { prefix: 'Long Notebook Ruled', brands: ['Classmate Pulse', 'Classmate Hard Bound', 'Navneet Youva', 'Sundaram Super'], sizes: ['140 Pages', '160 Pages', '240 Pages'], priceRange: [45, 95] },
      { prefix: 'A4 Copier Paper Ream (75 GSM)', brands: ['JK Copier Paper', 'Bilt Copy Power', 'TNPL Copier', 'Century Star'], sizes: ['500 Sheets Ream'], priceRange: [240, 310], unit: 'REAM', hsn: '4802' },
      { prefix: 'Ball Point Pen Blue / Black', brands: ['Cello Butterflow', 'Reynolds 045 Fine Carbure', 'Rorito Flymax', 'Montex Mega Top', 'Pentonic Linc'], sizes: ['Single Pc', 'Pack of 5', 'Jar of 20 Pens'], priceRange: [10, 190], unit: 'PKT', hsn: '9608', taxRate: 18 },
      { prefix: 'Gel Pen Smooth Ink', brands: ['Pilot Hi-Techpoint V5', 'Pilot V7', 'Pentel EnerGel 0.7', 'Trimax Gold Rorito'], sizes: ['1 Pc', 'Pack of 3'], priceRange: [45, 160], unit: 'PCS', hsn: '9608', taxRate: 18 },
      { prefix: 'Permanent Marker Pen', brands: ['Camlin Whiteboard Marker (4s)', 'Luxor Permanent Bullet Tip', 'Faber-Castell Textliner'], sizes: ['Single Pc', 'Set of 4 Assorted'], priceRange: [20, 110], unit: 'PKT', hsn: '9608', taxRate: 18 },
      { prefix: 'Office Stapler & Pins', brands: ['Kangaro No. 10 Stapler', 'Kangaro Staple Pins 10-1M', 'Kangaro Heavy Duty HD-45'], sizes: ['Standard No. 10', 'Box of 1000 Pins'], priceRange: [15, 120], unit: 'BOX', hsn: '8305', taxRate: 18 },
      { prefix: 'Document Clear Folder File', brands: ['Solo Display Book 20 Pockets', 'Neelam Button Folder', 'Solo Ring Binder File'], sizes: ['FS Size', 'A4 Size'], priceRange: [25, 140], unit: 'PCS', hsn: '3926', taxRate: 18 },
      { prefix: 'Desktop Calculator 12-Digit', brands: ['Casio MJ-120D Plus', 'Citizen CT-512', 'Orpat Check & Correct OT-512T'], sizes: ['12 Digits Solar & Battery'], priceRange: [290, 480], unit: 'PCS', hsn: '8470', taxRate: 18 },
      { prefix: 'Sticky Notes Pad Assorted', brands: ['3M Post-it Notes 3x3', 'Oddy Pastel Sticky Notes'], sizes: ['100 Sheets Pad', 'Cube of 400 Sheets'], priceRange: [40, 130], unit: 'PAD', hsn: '4820' },
      { prefix: 'Adhesive Glue Stick', brands: ['Fevistik Super PVA Glue', 'Fevicol MR Squeezy Bottle'], sizes: ['8g', '15g', '100g Bottle'], priceRange: [15, 45], unit: 'PCS', hsn: '3506', taxRate: 18 },
    ]
  },
  {
    name: 'Electricals & Hardware',
    hsn: '8539',
    taxRate: 18,
    unit: 'PCS',
    templates: [
      { prefix: 'LED Bulb Cool Day White B22', brands: ['Havells 9W LED', 'Philips 9W Stellar LED', 'Syska 9W SSK', 'Crompton 10W LED', 'Wipro 12W Garnet'], sizes: ['9W Base B22', '12W Base B22', '14W Base B22'], priceRange: [85, 160] },
      { prefix: 'LED Batten Tube Light 20W', brands: ['Philips 20W LED Batten', 'Havells 20W Adore', 'Crompton 20W Laser Ray'], sizes: ['4 Feet 20W Slim'], priceRange: [195, 290] },
      { prefix: 'Modular Switch 6A 1-Way', brands: ['Anchor Roma Classic', 'Havells Crabtree', 'Legrand Mylinc', 'Schneider Opale'], sizes: ['6A 240V White'], priceRange: [24, 65], hsn: '8536' },
      { prefix: 'Modular Socket 6A / 16A Universal', brands: ['Anchor Roma 6/16A Combo Socket', 'Havells Crabtree Socket', 'Legrand Socket'], sizes: ['Universal 3-Pin / 5-Pin'], priceRange: [75, 160], hsn: '8536' },
      { prefix: 'Extension Cord Board with Surge', brands: ['Anchor 4-Way Strip 1.5m', 'Goldmedal Curve 4-Way 2m', 'Havells 4-Socket Surge Protector'], sizes: ['4 Socket + 1 Master Switch'], priceRange: [240, 480], hsn: '8537' },
      { prefix: 'PVC Insulation Electrical Tape', brands: ['Steelgrip PVC Grip Tape Black', 'Anchor Fire Retardant Tape'], sizes: ['7.5m Roll', '10m Roll (Pack of 5)'], priceRange: [12, 55], unit: 'ROLL', hsn: '3919' },
      { prefix: 'Alkaline Pencil Battery AA / AAA', brands: ['Duracell Ultra AA (Pack of 4)', 'Duracell Chhota Power AAA (Pack of 2)', 'Eveready Carbon Zinc 1012 AA (Pack of 4)'], sizes: ['Pack of 2', 'Pack of 4'], priceRange: [35, 160], unit: 'PKT', hsn: '8506' },
      { prefix: 'Fast Charging USB Cable Type-C', brands: ['Boat Rugged V3 Type-C 1.5m', 'Mi Braided 1m Cable', 'Ambrane 3A Fast Cable'], sizes: ['1 Meter', '1.5 Meter Tough Braided'], priceRange: [129, 299], hsn: '8544' },
      { prefix: 'Wall Fast Charger Adapter 20W / 33W', brands: ['Mi 33W SonicCharge 2.0', 'Boat Dual Port 20W', 'Ambrane Fast Adapter'], sizes: ['Type-C PD Output'], priceRange: [399, 799], hsn: '8504' },
      { prefix: 'Steel Measuring Tape Auto-Lock', brands: ['Stanley 3m Tylon Tape', 'Stanley 5m Locking Tape', 'Freemans Pro 5m'], sizes: ['3 Meter (10 Feet)', '5 Meter (16 Feet)'], priceRange: [110, 240], hsn: '9017' },
    ]
  },
  {
    name: 'Pharma & First Aid',
    hsn: '3004',
    taxRate: 12,
    unit: 'STRIP',
    templates: [
      { prefix: 'Paracetamol 650mg Tablets', brands: ['Dolo 650', 'Calpol 650', 'Crocin 650'], sizes: ['Strip of 15 Tablets'], priceRange: [30, 34] },
      { prefix: 'Digestive Antacid Gel / Fizz', brands: ['Eno Fruit Salt Lemon 5g (Pouch)', 'Gelusil MPS Liquid Mint 200ml', 'Digene Gel Orange 200ml'], sizes: ['5g Sachet', '200ml Bottle'], priceRange: [9, 140], unit: 'BTL' },
      { prefix: 'Pain Relief Balm & Spray', brands: ['Moov Pain Relief Spray 50g', 'Volini Maxx Pain Relief Gel 30g', 'Iodex Double Power Balm 40g', 'Amrutanjan Strong Balm 50g'], sizes: ['30g Gel', '50g Spray Can'], priceRange: [65, 185], unit: 'PCS' },
      { prefix: 'Antiseptic Liquid Disinfectant', brands: ['Dettol Antiseptic Liquid 100ml', 'Dettol 250ml', 'Savlon Antiseptic Liquid 200ml'], sizes: ['100ml Bottle', '250ml Bottle', '500ml Bottle'], priceRange: [38, 165], unit: 'BTL' },
      { prefix: 'Medicated Adhesive Bandages', brands: ['Hansaplast Washproof Plaster (10s)', 'Band-Aid First Aid Strips (20s)'], sizes: ['Pack of 10 Strips', 'Pack of 20 Strips'], priceRange: [25, 45], unit: 'PKT', hsn: '3005' },
      { prefix: 'Absorbent Cotton Roll Surgical', brands: ['Apollo Surgical Cotton 100g', 'Bengal Waterproof Cotton 200g'], sizes: ['100g Roll', '200g Roll'], priceRange: [40, 75], unit: 'ROLL', hsn: '3005' },
      { prefix: 'Electrolyte Energy Drink ORS', brands: ['Enerzal Energy Drink Orange 100g', 'Electral WHO ORS Powder 21.8g Sachet'], sizes: ['21.8g Sachet', '100g Pouch'], priceRange: [22, 65], unit: 'PKT', hsn: '2106' },
      { prefix: 'Herbal Cough Lozenges Drops', brands: ['Vicks Cough Drops Ginger (Pack of 20)', 'Strepsils Honey & Lemon (Strip of 8)', 'Halls Mentho-Lyptus'], sizes: ['Strip of 8', 'Pouch of 25'], priceRange: [32, 60], unit: 'PKT', hsn: '3004' },
    ]
  }
];

let items = [];
let counter = 1001;

categories.forEach((cat) => {
  cat.templates.forEach((tpl) => {
    tpl.brands.forEach((brand) => {
      tpl.sizes.forEach((size) => {
        const id = `item_${counter++}`;
        const name = `${brand} ${tpl.prefix} ${size}`;
        const [minP, maxP] = tpl.priceRange;
        const price = Math.round(minP + rand() * (maxP - minP));
        const mrp = Math.round(price * 1.12);
        // Realistic EAN-13 barcode starting with 890 (India country code)
        const barcode = `890${String(1000000000 + counter * 37).slice(1)}`;
        items.push({
          id,
          name,
          category: cat.name,
          hsn: tpl.hsn || cat.hsn,
          taxRate: tpl.taxRate ?? cat.taxRate,
          unit: tpl.unit || cat.unit,
          price,
          mrp,
          barcode,
          stock: Math.floor(20 + rand() * 150),
        });
      });
    });
  });
});

// If count is less than 1000, expand with popular retail variants
const variants = ['Economy Pack', 'Special Offer', 'Value Pack', 'Refill Pack', 'Mega Pack'];
let i = 0;
while (items.length < 1050) {
  const base = items[i % items.length];
  const variant = variants[i % variants.length];
  counter++;
  const price = Math.round(base.price * 1.8);
  const mrp = Math.round(price * 1.15);
  items.push({
    id: `item_${counter}`,
    name: `${base.name} (${variant})`,
    category: base.category,
    hsn: base.hsn,
    taxRate: base.taxRate,
    unit: base.unit,
    price,
    mrp,
    barcode: `890${String(2000000000 + counter * 53).slice(1)}`,
    stock: Math.floor(15 + rand() * 80),
  });
  i++;
}

console.log(`Generated ${items.length} starter products across ${categories.length} categories.`);

const fileContent = `// ============================================================
// GST Billing Pro — Master 1000+ Indian Products Catalog
// Realistic items across Kirana, FMCG, Dairy, Stationery, Hardware, Electronics, Pharma
// ============================================================

export const STARTER_CATALOG = ${JSON.stringify(items, null, 2)};

export const CATALOG_CATEGORIES = [
  'All Categories',
  ${categories.map(c => `'${c.name}'`).join(',\n  ')}
];
`;

fs.mkdirSync(path.resolve('src/data'), { recursive: true });
fs.writeFileSync(path.resolve('src/data/starterCatalog.js'), fileContent, 'utf8');
console.log('Saved to src/data/starterCatalog.js');
