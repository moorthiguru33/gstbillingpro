import fs from 'fs';
import path from 'path';

// Master Indian Industry Blueprints for 100,000+ Products Database
const industryConfigs = [
  {
    id: 'grocery',
    name: 'Grocery, Kirana & Supermarket',
    icon: '🛒',
    targetCount: 22000,
    subcategories: [
      {
        name: 'Rice & Grains',
        hsn: '1006',
        taxRate: 5,
        unit: 'KG',
        brands: ['India Gate', 'Daawat', 'Fortune', 'Kohinoor', 'Lal Qilla', 'Bawarchi', 'Royal', 'Double Horse', 'Ponni', 'Heritage', 'Swarna', 'Deccan Gold', 'Nature Fresh'],
        items: ['Classic Basmati Rice', 'Rozana Basmati Rice', 'Super Tibar Rice', 'Biryani Special Basmati', 'Sona Masoori Raw Rice', 'Sona Masoori Steam Rice', 'Boiled Ponni Rice', 'Idli Rice', 'Brown Basmati Rice', 'Jeera Samba Rice', 'Gobindobhog Rice', 'Wada Kolam Rice'],
        sizes: ['1kg', '2kg', '5kg', '10kg', '25kg Bag', '50kg Jute Bag'],
        priceRange: [55, 380]
      },
      {
        name: 'Atta, Flours & Sooji',
        hsn: '1101',
        taxRate: 5,
        unit: 'KG',
        brands: ['Aashirvaad', 'Fortune', 'Pillsbury', 'Shakti Bhog', 'Nature Fresh', 'Patanjali', 'Organic Tattva', 'Rajdhani', 'Engine'],
        items: ['Shudh Chakki Whole Wheat Atta', 'Select Sharbati Atta', 'Multi-Grain High Fibre Atta', 'Sugar Balance Atta', 'Fine Maida Flour', 'High Protein Besan', 'Roasted Sooji / Rawa', 'Fine Rice Flour', 'Makka Atta (Corn)', 'Jowar Atta', 'Bajra Atta', 'Ragi Finger Millet Flour'],
        sizes: ['500g', '1kg', '5kg Bag', '10kg Bag'],
        priceRange: [35, 360]
      },
      {
        name: 'Pulses & Dals (Unpolished)',
        hsn: '0713',
        taxRate: 0,
        unit: 'KG',
        brands: ['Tata Sampann', 'Fortune', 'Organic Tattva', 'Rajdhani', 'Catch', 'Nature Fresh', 'Dhara', 'Double Horse'],
        items: ['Toor Dal Desi Oomph', 'Moong Dal Dhuli Washed', 'Moong Dal Chilka Split', 'Moong Whole Green Gram', 'Chana Dal Super Polished', 'Urad Dal White Gota Whole', 'Urad Dal Chilka Split', 'Masoor Dal Red Split', 'Masoor Whole Brown', 'Kabuli Chana Bold', 'Kala Chana Desi Small', 'Rajma Chitra Kashmiri', 'Rajma Red Small', 'White Peas (Matar)', 'Green Peas Dried', 'Lobiya Black Eye Beans'],
        sizes: ['500g Pouch', '1kg Pouch', '2kg Saver', '5kg Bag'],
        priceRange: [85, 210]
      },
      {
        name: 'Edible Oils & Pure Ghee',
        hsn: '1512',
        taxRate: 5,
        unit: 'LTR',
        brands: ['Fortune', 'Saffola', 'Gemini', 'Sundrop', 'Dhara', 'Engine', 'Patanjali', 'Amul', 'Gowardhan', 'Mother Dairy', 'Aashirvaad Svasti', 'Ananda'],
        items: ['Sunlite Refined Sunflower Oil', 'Gold Pro Healthy Blended Oil', 'Kachi Ghani Pure Mustard Oil', 'Total Antioxidant Rice Bran Oil', 'Filtered Groundnut Oil', 'Refined Soyabean Oil', 'Cold Pressed Sesame / Til Oil', 'Extra Virgin Olive Oil', 'Pure Cow Desi Ghee', 'Pure Buffalo Ghee', 'Danedar Desi Ghee'],
        sizes: ['500ml Pouch', '1L Pouch', '1L Pet Bottle', '2L Can', '5L Jar', '15L Tin'],
        priceRange: [120, 850]
      },
      {
        name: 'Spices, Masalas & Seasonings',
        hsn: '0910',
        taxRate: 5,
        unit: 'PKT',
        brands: ['Everest', 'MDH', 'Catch', 'Tata Sampann', 'Badshah', 'Ramdev', 'Aachi', 'Sakthi', 'Eastern'],
        items: ['Turmeric Powder (Haldi)', 'Kashmiri Lal Mirch Powder', 'Tikhalal Red Chilli Powder', 'Coriander Powder (Dhania)', 'Garam Masala Super Blend', 'Cumin Seeds Whole (Jeera)', 'Mustard Seeds (Rai / Sarson)', 'Fenugreek Seeds (Methi)', 'Fennel Seeds (Saunf)', 'Black Pepper Powder', 'Cloves (Laung)', 'Green Cardamom (Elaichi)', 'Black Cardamom (Badi Elaichi)', 'Cinnamon Sticks (Dalchini)', 'Kitchen King Masala', 'Meat Masala Powder', 'Chicken Masala', 'Biryani Masala Special', 'Chana Masala', 'Pav Bhaji Masala', 'Sambhar Masala', 'Rasam Powder'],
        sizes: ['50g Box', '100g Box', '200g Pouch', '500g Value Pack', '1kg Catering Pack'],
        priceRange: [25, 280]
      },
      {
        name: 'Dry Fruits, Nuts & Seeds',
        hsn: '0802',
        taxRate: 5,
        unit: 'PKT',
        brands: ['Nutraj', 'Happilo', 'Tulsi', 'Tata Sampann', 'Farmley', 'Solimo'],
        items: ['California Almonds (Badam Giri)', 'Cashew Nuts W240 Jumbo (Kaju)', 'Cashew Nuts W320 Regular', 'Green Raisins (Kishmish)', 'Black Seedless Raisins', 'Walnut Kernels (Akhrot Giri)', 'Salted Roasted Pistachios (Pista)', 'Dried Figs (Anjeer)', 'Arabian Pitted Dates (Khajoor)', 'Raw Chia Seeds', 'Roasted Flax Seeds', 'Watermelon & Pumpkin Seeds'],
        sizes: ['100g', '200g', '250g Vacuum', '500g Jar', '1kg Zip Pouch'],
        priceRange: [95, 980]
      },
      {
        name: 'Salt, Sugar & Sweeteners',
        hsn: '1701',
        taxRate: 5,
        unit: 'KG',
        brands: ['Tata Salt', 'Aashirvaad', 'Catch', 'Madhur', 'Trust', 'Mawana', 'Patanjali', 'Dhampure', 'Sugar Free'],
        items: ['Vacuum Evaporated Iodised Salt', 'Himalayan Pink Rock Salt', 'Black Salt (Kala Namak)', 'Crystal Sea Salt for Cooking', 'Pure Sulphurless White Sugar', 'Bura Sugar for Sweets', 'Icing Sugar Powder', 'Organic Jaggery Powder (Gud)', 'Jaggery Cubes Block', 'Natural Stevia Sweetener', 'Sugar Free Gold Pellets'],
        sizes: ['500g', '1kg', '5kg Pack'],
        priceRange: [22, 240]
      }
    ]
  },
  {
    id: 'fmcg_snacks',
    name: 'Snacks, Dairy, Beverages & Confectionery',
    icon: '🍪',
    targetCount: 16000,
    subcategories: [
      {
        name: 'Biscuits & Cookies',
        hsn: '1905',
        taxRate: 18,
        unit: 'PKT',
        brands: ['Parle-G', 'Britannia', 'Sunfeast', 'Oreo', 'Cadbury', 'Unibic', 'Patanjali'],
        items: ['Glucose Energy Biscuits', 'Marie Gold Tea Biscuits', 'Good Day Butter Cookies', 'Good Day Cashew Cookies', 'Dark Fantasy Choco Fills', 'Bourbon Chocolate Creme', 'Hide & Seek Choco Chip', 'Milk Bikis Crunchy', 'Nice Sugar Coconut Cracker', '50-50 Maska Chaska Salted', 'Oreo Vanilla Creme Sandwich', 'Oreo Strawberry Creme', 'Unibic Choco Ripple Cookies'],
        sizes: ['50g', '100g', '150g', '250g', '400g Family Pack', '800g Mega Saver'],
        priceRange: [10, 140]
      },
      {
        name: 'Namkeen & Chips',
        hsn: '2106',
        taxRate: 12,
        unit: 'PKT',
        brands: ['Haldiram\'s', 'Bikaji', 'Lay\'s', 'Kurkure', 'Bingo', 'Balaji', 'Chhajed'],
        items: ['Aloo Bhujia Spicy Crunchy', 'Bikaneri Sev Bhujia', 'Khatta Meetha Mixture', 'All-In-One Royal Mixture', 'Moong Dal Salted Fried', 'Chana Jor Garam Spiced', 'Magic Masala Potato Chips', 'Classic Salted Potato Chips', 'Cream & Onion Potato Chips', 'Masala Munch Crunchy Kurkure', 'Tedhe Medhe Spiced Sticks', 'Banana Chips Kerala Style'],
        sizes: ['30g Pocket', '50g Regular', '90g Party Pack', '150g', '400g Family Bag', '1kg Jumbo'],
        priceRange: [10, 260]
      },
      {
        name: 'Chocolates & Candies',
        hsn: '1806',
        taxRate: 18,
        unit: 'PCS',
        brands: ['Cadbury Dairy Milk', 'Nestle KitKat', 'Ferrero Rocher', 'Amul', 'Kinder', 'Mentos', 'Pulse'],
        items: ['Dairy Milk Chocolate Bar', 'Dairy Milk Silk Roasted Almond', 'Dairy Milk Silk Oreo', 'KitKat 4 Finger Crisp', 'KitKat Chunky Caramel', '5 Star Caramel Chewy', 'Munch Chocolate Coated Wafer', 'Perk Double Crunch', 'Ferrero Rocher Hazelnut Ball', 'Pulse Kachha Aam Candy Jar', 'Alpenliebe Creamfills Caramel'],
        sizes: ['15g', '35g', '55g', '150g Large', 'Box of 16 Pieces', 'Jar of 150 Candies'],
        priceRange: [10, 450]
      },
      {
        name: 'Tea, Coffee & Health Drinks',
        hsn: '0902',
        taxRate: 5,
        unit: 'PKT',
        brands: ['Tata Tea', 'Brooke Bond Red Label', 'Taj Mahal', 'Wagh Bakri', 'Nescafe', 'Bru', 'Horlicks', 'Boost', 'Bournvita', 'Complan'],
        items: ['Gold Premium Leaf Tea', 'Red Label Natural Care 5 Herbs', 'Taj Mahal Royal Fragrance Tea', 'CTC Spiced Kadak Chai', 'Green Tea Lemon & Honey Tea Bags', 'Nescafe Classic Instant Coffee', 'Bru Super Strong Instant Coffee', 'Horlicks Malt Health Nutrition', 'Boost 3X Energy Stamina', 'Bournvita Pro-Health Chocolate', 'Complan Royal Growth Powder'],
        sizes: ['100g', '250g Box', '500g Jar', '1kg Refill Bag'],
        priceRange: [75, 520]
      },
      {
        name: 'Dairy Products & Beverages',
        hsn: '0401',
        taxRate: 5,
        unit: 'PKT',
        brands: ['Amul', 'Mother Dairy', 'Nandini', 'Heritage', 'Aavin', 'Gowardhan', 'Britannia'],
        items: ['Taaza Homogenized Toned Milk', 'Gold Full Cream High Fat Milk', 'Fresh Malai Paneer Block', 'Salted Table Butter Pasteurized', 'Processed Cheddar Cheese Slices', 'Cheese Cubes Box', 'Dahi Fresh Curd Pouch', 'Masti Spiced Buttermilk / Chaas', 'Flavoured Milk Chocolate / Kesar', 'Kool Cafe Frappe Chilled'],
        sizes: ['200ml Tetra', '500ml Pouch', '1L Tetra', '200g Block', '500g Block'],
        priceRange: [15, 290]
      }
    ]
  },
  {
    id: 'hardware',
    name: 'Hardware, Sanitaryware, Paints & Tools',
    icon: '🔧',
    targetCount: 16000,
    subcategories: [
      {
        name: 'Plumbing & Pipes (CPVC / PVC)',
        hsn: '3917',
        taxRate: 18,
        unit: 'MTR',
        brands: ['Astral', 'Ashirvad', 'Supreme', 'Finolex', 'Prince', 'Apollo'],
        items: ['CPVC Pro Pipe SDR 11 Class 1', 'UPVC Cold Water Pipe Sch 40', 'SWR Drainage Soil & Waste Pipe', 'CPVC Elbow 90 Degree Brass Threaded', 'CPVC Equal Tee Brass Insert', 'CPVC Male / Female Adapter MTA/FTA', 'CPVC Ball Valve Handle', 'Solvent Cement Heavy Duty Tin'],
        sizes: ['1/2" (15mm) 3 Metre', '3/4" (20mm) 3 Metre', '1" (25mm) 3 Metre', '1.25" (32mm)', '1.5" (40mm)', '2" (50mm)', '100ml Tin', '250ml Tin', '500ml Tin'],
        priceRange: [45, 850]
      },
      {
        name: 'Bath Fittings & Taps',
        hsn: '8481',
        taxRate: 18,
        unit: 'PCS',
        brands: ['Jaquar', 'Hindware', 'Cera', 'Parryware', 'Kohler', 'Watertec'],
        items: ['Brass Chrome Long Body Bib Tap', 'Two-Way Angle Valve with Wall Flange', 'Concealed Stop Cock 15mm/20mm', 'Pillar Cock Basin Tap Chrome', 'Overhead Shower Rain Spray with Arm', 'Health Faucet Hand Spray with 1.2M Hose', 'Sink Cock Swivel Spout Kitchen Tap'],
        sizes: ['Single Chrome Piece', 'Heavy Brass Body Set', 'Standard 1/2" Connection'],
        priceRange: [280, 2400]
      },
      {
        name: 'Paints, Primers & Wall Putty',
        hsn: '3209',
        taxRate: 18,
        unit: 'DRUM',
        brands: ['Asian Paints', 'Berger', 'Nerolac', 'Dulux', 'Birla White', 'JK Cement'],
        items: ['Tractor Emulsion Interior Smooth', 'Apcolite Premium Satin Luxury Paint', 'Apex Weatherproof Exterior Paint', 'Apex Ultima Protek Silicon Paint', 'Decoprime Water Thinnable Wall Primer', 'Synthetic Enamel Gloss Metal/Wood Paint', 'Waterproof WallSeal White Putty', 'Touchwood Polyurethane Clear Wood Polish'],
        sizes: ['500ml Can', '1 Litre Can', '4 Litre Bucket', '10 Litre Drum', '20 Litre Master Drum', '20kg Putty Bag', '40kg Putty Bag'],
        priceRange: [180, 6800]
      },
      {
        name: 'Fasteners, Screws & Nails',
        hsn: '7318',
        taxRate: 18,
        unit: 'BOX',
        brands: ['Unbrako', 'Apex', 'Crown', 'Hilti', 'GKW'],
        items: ['Black Drywall Gypsum Bugle Head Screws', 'Stainless Steel SS304 Wood Screws CSK', 'Self Drilling Hex Washer Metal Screws', 'Anchor Expansion Fastener Bolt with Washer', 'Steel Wire Nails Bright Finish', 'Roofing Screws with EPDM Rubber Washer'],
        sizes: ['1" (25mm) Box of 1000', '1.5" (38mm) Box of 1000', '2" (50mm) Box of 500', '3" (75mm) Box of 200', '1kg Box'],
        priceRange: [95, 620]
      },
      {
        name: 'Door Hardware & Locks',
        hsn: '8301',
        taxRate: 18,
        unit: 'PCS',
        brands: ['Godrej', 'Europa', 'Harrison', 'Link', 'Dorset', 'Yale'],
        items: ['Nav-Tal 6/7/8 Lever Brass Padlock', 'Mortise Door Lock Handle Set with Cylinder', 'Disc Tumbler Deadbolt Rim Night Latch', 'Main Door Stainless Steel Pull Handle', 'Hydraulic Door Closer Heavy Arm', 'Tower Bolt Aluminium / Brass Finish', 'Aldrop Rod Set with Hinges'],
        sizes: ['50mm Brass', '60mm Brass', '70mm Brass with 3 Keys', '8 Inch', '10 Inch', '12 Inch Set'],
        priceRange: [150, 3200]
      }
    ]
  },
  {
    id: 'electricals',
    name: 'Electricals, Lighting & Cables',
    icon: '⚡',
    targetCount: 15000,
    subcategories: [
      {
        name: 'LED Lighting & Fixtures',
        hsn: '8539',
        taxRate: 18,
        unit: 'PCS',
        brands: ['Philips', 'Havells', 'Syska', 'Wipro', 'Crompton', 'Orient', 'Anchor'],
        items: ['Cool Day Light B22 LED Bulb', 'Warm White Warm Glow LED Bulb', 'Inverter Emergency LED Bulb with Battery', 'Slim Downlight Concealed Ceiling Panel', 'Surface Mount Round LED Panel', 'LED Batten 4-Feet Tube Light', 'High Output Flood Light Outdoor IP65', 'Decorative Strip COB Light 5 Metre'],
        sizes: ['7 Watt', '9 Watt', '12 Watt', '15 Watt', '20 Watt', '24 Watt', '50 Watt Outdoor'],
        priceRange: [75, 1250]
      },
      {
        name: 'Modular Switches & Sockets',
        hsn: '8536',
        taxRate: 18,
        unit: 'PCS',
        brands: ['Anchor Roma', 'Havells Crabtree', 'Legrand', 'Schneider', 'Goldmedal', 'GM Modular'],
        items: ['6A 1-Way Modular Switch White', '16A Heavy Power Switch with Indicator', '6A Shuttered 3-Pin Safety Socket', '16A 3-Pin Power Heavy Socket', 'Fan Speed Step Regulator Electronic', 'Bell Push Switch with LED Light', 'RJ45 Computer Internet Lan Socket', '12-Module Cover Plate with Grid Frame'],
        sizes: ['1 Module', '2 Module', '3 Module', '4 Module Plate', '6 Module Plate', '8 Module Plate'],
        priceRange: [28, 480]
      },
      {
        name: 'Wires, Cables & MCBs',
        hsn: '8544',
        taxRate: 18,
        unit: 'COIL',
        brands: ['Polycab', 'Havells LifeLine', 'Finolex', 'RR Kabel', 'KEI', 'Schneider Acti9', 'Legrand RX3'],
        items: ['FR PVC Insulated Copper House Wire', 'FRLS-H Zero Halogen Fire Safety Wire', 'Submersible 3-Core Flat Water Pump Cable', 'CAT6 High Speed Network Internet Cable', 'Single Pole (SP) Miniature Circuit Breaker MCB', 'Double Pole (DP) MCB Isolator Switch', 'RCCB Residual Current Earth Leakage Breaker'],
        sizes: ['0.75 sq mm Coil 90M', '1.0 sq mm Coil 90M', '1.5 sq mm Coil 90M', '2.5 sq mm Coil 90M', '4.0 sq mm Coil 90M', '6A SP', '16A SP', '32A SP', '40A DP', '63A 30mA RCCB'],
        priceRange: [140, 5600]
      }
    ]
  },
  {
    id: 'pharma',
    name: 'Pharmacy, Medical & Healthcare',
    icon: '💊',
    targetCount: 15000,
    subcategories: [
      {
        name: 'Common OTC Medicines & Pain Relief',
        hsn: '3004',
        taxRate: 12,
        unit: 'STRIP',
        brands: ['Micro Labs', 'GSK', 'Sanofi', 'Cipla', 'Sun Pharma', 'Abbott', 'Dr. Reddy\'s', 'Zydus'],
        items: ['Paracetamol 650mg Antipyretic Tablet', 'Paracetamol 500mg Fast Relief', 'Ibuprofen + Paracetamol Combination', 'Aceclofenac + Paracetamol Pain Tablet', 'Diclofenac Sodium 50mg Extended Release', 'Cetirizine 10mg Anti-Allergic Tablet', 'Levocetirizine + Montelukast Tablet', 'Pantoprazole 40mg Antacid Capsule', 'Omeprazole 20mg Gastro-Resistant', 'Ranitidine 150mg Relief Tablet', 'Azithromycin 500mg Broad Spectrum', 'Amoxicillin + Potassium Clavulanate 625mg'],
        sizes: ['Strip of 10 Tablets', 'Strip of 15 Tablets', 'Strip of 20 Tablets', 'Box of 10 Strips (100 Tablets)'],
        priceRange: [22, 280]
      },
      {
        name: 'Antacids, Syrups & First Aid',
        hsn: '3004',
        taxRate: 12,
        unit: 'BTL',
        brands: ['Eno', 'Digene', 'Gelusil', 'Dabur Honitus', 'Benadryl', 'Vicks', 'Dettol', 'Savlon', 'Betadine'],
        items: ['Fast Relief Fruit Salt Antacid Sachet', 'Antacid Chewable Mint Flavor Tablet', 'Antacid Mucaine Cooling Suspension Gel', 'Herbal Honey Cough Syrup', 'Expectorant Cough Syrup with Menthol', 'Antiseptic Disinfectant Liquid Solution', 'Povidone Iodine 5% Germicidal Ointment', 'Pain Relief Herbal Balms & Inhaler', 'Diclofenac Topical Pain Relief Spray'],
        sizes: ['5g Sachet (Box of 30)', '100ml Bottle', '200ml Bottle', '400ml Bottle', '30g Tube', '55g Spray Bottle'],
        priceRange: [30, 240]
      },
      {
        name: 'Medical Devices, Bandages & Cotton',
        hsn: '9018',
        taxRate: 12,
        unit: 'PCS',
        brands: ['Dr. Morepen', 'Omron', 'Accu-Chek', 'Hansaplast', 'Johnson & Johnson', 'Datt'],
        items: ['Digital Fever Thermometer with LCD', 'Automatic Digital Blood Pressure (BP) Monitor', 'Blood Glucose Blood Sugar Monitoring Kit', 'Blood Glucose Test Strips (Pack of 50)', 'Washproof Medicated Adhesive Plaster Strips', 'Sterile Absorbent Surgical Cotton Roll', 'Roller Cotton Bandage Gauze Pack', 'Disposable 3-Ply Surgical Face Mask with Nose Clip'],
        sizes: ['Standard Device', 'Pack of 50 Strips', '100g Cotton Roll', '500g Roll', 'Box of 100 Plasters', 'Box of 50 Masks'],
        priceRange: [45, 2100]
      }
    ]
  },
  {
    id: 'electronics',
    name: 'Electronics, Mobiles & Computer Accessories',
    icon: '📱',
    targetCount: 12000,
    subcategories: [
      {
        name: 'Charging & Cables',
        hsn: '8504',
        taxRate: 18,
        unit: 'PCS',
        brands: ['Mi', 'Samsung', 'Boat', 'Realme', 'Portronics', 'Ambrane', 'Anker'],
        items: ['Fast USB Wall Charger Adapter 20W/33W', 'Type-C to Type-C Braided Heavy Duty Cable', 'USB-A to Type-C Fast Data Cable', 'Type-C to Lightning Cable for iPhone', '3-in-1 Universal Nylon Braided Cable', 'Wireless Fast Charging Pad Qi Certified', '10000mAh Slim Polymer Power Bank 22.5W', '20000mAh Dual Output Heavy Duty Power Bank'],
        sizes: ['1 Metre', '1.5 Metre', '2 Metre Extra Long', 'Standard Unit'],
        priceRange: [149, 1899]
      },
      {
        name: 'Audio & Wireless Gadgets',
        hsn: '8518',
        taxRate: 18,
        unit: 'PCS',
        brands: ['Boat', 'Noise', 'Boult Audio', 'OnePlus', 'Realme', 'JBL'],
        items: ['True Wireless Stereo (TWS) Bluetooth Earbuds', 'Wireless Magnetic Bluetooth Neckband with Mic', 'Wired 3.5mm In-Ear Earphones with Deep Bass', 'Portable Rugged Wireless Bluetooth Speaker', 'Soundbar with Subwoofer Home Audio'],
        sizes: ['Standard Black', 'Navy Blue Edition', 'Gunmetal Grey', 'Active Noise Cancelling (ANC) Edition'],
        priceRange: [299, 3499]
      },
      {
        name: 'Computer Peripherals & Storage',
        hsn: '8471',
        taxRate: 18,
        unit: 'PCS',
        brands: ['Logitech', 'Dell', 'HP', 'SanDisk', 'Kingston', 'Zebronics'],
        items: ['Wireless Optical Mouse 2.4GHz with Nano Receiver', 'Wired USB Ergonomic Office Mouse', 'Wireless Keyboard & Mouse Desktop Combo', 'USB 3.2 High Speed Metal Pen Drive', 'MicroSD Class 10 High Speed Memory Card', 'External Portable Solid State Drive SSD'],
        sizes: ['32 GB', '64 GB', '128 GB', '256 GB', '512 GB SSD', '1 TB Portable'],
        priceRange: [249, 4500]
      }
    ]
  },
  {
    id: 'textiles',
    name: 'Textiles, Garments, Apparel & Footwear',
    icon: '👕',
    targetCount: 10000,
    subcategories: [
      {
        name: 'Men & Women Readymade Wear',
        hsn: '6205',
        taxRate: 5,
        unit: 'PCS',
        brands: ['Peter England', 'Raymond', 'Allen Solly', 'Van Heusen', 'Biba', 'W for Woman', 'Levi\'s', 'Jockey'],
        items: ['Pure Cotton Formal Full Sleeve Shirt', 'Casual Slim Fit Check Shirt', 'Round Neck Solid Casual T-Shirt', 'Polo Collar Half Sleeve Sport T-Shirt', 'Straight Fit Stretchable Denim Jeans', 'Chinos Casual Cotton Trousers', 'Straight Cut Printed Ethnic Kurti', 'Cotton Straight Pant with Pockets', 'Art Silk Traditional Festive Saree'],
        sizes: ['Small (38)', 'Medium (40)', 'Large (42)', 'XL (44)', 'XXL (46)', 'Free Size (5.5M)'],
        priceRange: [350, 2400]
      },
      {
        name: 'Hosiery, Innerwear & Home Linens',
        hsn: '6107',
        taxRate: 5,
        unit: 'PCS',
        brands: ['Jockey', 'Lux Cozi', 'Dollar', 'Rupa', 'Trident', 'Spaces by Welspun', 'Bombay Dyeing'],
        items: ['Combed Cotton Mens Briefs (Pack of 2)', 'Super Soft Modern Cotton Trunks / Boxers', 'Round Neck Cotton Vest / Baniyan', 'Pure Cotton Bath Towel Quick Dry 600 GSM', 'Hand Towel Pack of 3 Plush', 'Double Bed King Size Cotton Bedsheet with Pillows'],
        sizes: ['Small 80cm', 'Medium 85cm', 'Large 90cm', 'XL 95cm', 'Single Bed', 'Double King Bed (220x240cm)'],
        priceRange: [180, 1250]
      }
    ]
  },
  {
    id: 'auto',
    name: 'Automobile & Two-Wheeler Spares',
    icon: '🏍️',
    targetCount: 8000,
    subcategories: [
      {
        name: 'Engine Lubricants & Maintenance',
        hsn: '2710',
        taxRate: 18,
        unit: 'BTL',
        brands: ['Castrol Activ', 'Motul', 'Shell Advance', 'Servo', 'Gulf Pride', 'WD-40', 'BOSCH'],
        items: ['4T 20W-40 Motorcycle Mineral Engine Oil', '4T 10W-30 Scooter Automatic Engine Oil', 'Full Synthetic 10W-50 Racing Oil', 'DOT 4 High Performance Hydraulic Brake Fluid', 'Chain Lube O-Ring Safe Spray 400ml', 'Chain Cleaner Degreaser Spray', 'WD-40 Multi-Purpose Anti-Rust Spray', 'Radiator Coolant Pre-Mixed Green / Red'],
        sizes: ['800ml Bottle', '900ml Bottle', '1 Litre Can', '1.2 Litre Bottle', '400ml Spray Can'],
        priceRange: [180, 890]
      },
      {
        name: 'Sparks, Horns & Electrical Spares',
        hsn: '8511',
        taxRate: 18,
        unit: 'PCS',
        brands: ['NGK', 'BOSCH', 'Roots', 'Minda', 'Lucas TVS', 'Philips'],
        items: ['Nickel Alloy Spark Plug for Bikes', 'Iridium IX High Mileage Spark Plug', '12V Windtone Dual Horn Set with Relay', 'High Power Disc Horn 12V 100mm', 'Halogen Headlight Bulb H4 12V 35/35W', 'LED High Beam Headlight Bulb White', 'Brake Light Bulb Tail Lamp 12V 21/5W'],
        sizes: ['Standard Unit', 'Pair of 2 Horns', 'Single Bulb'],
        priceRange: [65, 950]
      }
    ]
  },
  {
    id: 'stationery',
    name: 'Stationery, Books & Office Supplies',
    icon: '📚',
    targetCount: 6000,
    subcategories: [
      {
        name: 'Writing, Paper & Office Desk',
        hsn: '4820',
        taxRate: 12,
        unit: 'PCS',
        brands: ['Classmate', 'Navneet', 'JK Copier', 'Reynolds', 'Cello', 'Pilot', 'Kangaro', 'Solo', 'Fevicol'],
        items: ['Single Line Ruled Long Notebook A4', 'Four Line School Notebook 172 Pages', 'Hard Bound Account Ledger Register 300P', 'Copier Paper 75 GSM A4 Ream (500 Sheets)', 'Copier Paper 80 GSM High Brightness A4', 'Smooth Ballpoint Pen Box of 20', 'Liquid Ink Roller Ball Pen 0.5mm', 'No. 10 Metal Desk Stapler with Pins Box', 'Heavy Duty Lever Arch Box File with Clip', 'Craft PVA White Synthetic Glue Stick'],
        sizes: ['Single Piece', 'Pack of 3', 'Pack of 5', 'Ream of 500 Sheets', 'Box of 20 Pens'],
        priceRange: [35, 340]
      }
    ]
  },
  {
    id: 'restaurant',
    name: 'Restaurant, Café & Food Services',
    icon: '🍽️',
    targetCount: 5000,
    subcategories: [
      {
        name: 'Restaurant Kitchen & Menu Items',
        hsn: '9963',
        taxRate: 5,
        unit: 'PLATE',
        brands: ['Chef Special', 'Royal Kitchen', 'Dhaba Style', 'Tandoor Special', 'Beverage Bar'],
        items: ['Hyderabadi Chicken Dum Biryani', 'Veg Dum Biryani with Raita', 'Paneer Butter Masala Creamy Gravy', 'Dal Makhani Slow Cooked Black Lentils', 'Butter Naan Crispy Clay Oven', 'Tandoori Roti Whole Wheat', 'Veg Schezwan Hakka Noodles', 'Paneer Chilli Dry Indo-Chinese', 'Classic Cheese Margherita Pizza 10 Inch', 'Crispy Paneer Burger with French Fries', 'Cold Coffee with Vanilla Ice Cream', 'Kulhad Masala Ginger Chai'],
        sizes: ['Single Portion', 'Half Plate', 'Full Plate', 'Family Bucket Serves 4'],
        priceRange: [25, 480]
      }
    ]
  }
];

console.log('Generating 100,000+ Products Database partitioned cleanly by Industry...');

fs.mkdirSync(path.resolve('public/data/catalogs'), { recursive: true });

let totalGlobalCount = 0;
const industrySummaries = [];

const commercialVariations = [
  'Regular Pack', 'Saver Pack', 'Value Combo', 'Special Offer',
  'Family Size', 'Export Grade', 'Commercial Box', 'Twin Pack (Buy 1 Get 1)',
  'Jumbo Pack', 'Refill Pouch', 'Wholesale Unit', 'Economy Bundle'
];

industryConfigs.forEach((ind) => {
  const industryProducts = [];
  let idCounter = 10000;

  // Pass 1: Combine subcategory blueprints
  ind.subcategories.forEach((sub) => {
    sub.brands.forEach((brand) => {
      sub.items.forEach((item) => {
        sub.sizes.forEach((size) => {
          idCounter++;
          const name = `${brand} ${item} - ${size}`;
          const [minP, maxP] = sub.priceRange;
          const price = Math.round(minP + Math.random() * (maxP - minP));
          const mrp = Math.round(price * 1.15);
          const barcode = `890${String(1000000000 + idCounter * 17).slice(1)}`;

          industryProducts.push({
            id: `${ind.id}_${idCounter}`,
            name,
            industry: ind.name,
            industryId: ind.id,
            category: sub.name,
            hsn: sub.hsn,
            taxRate: sub.taxRate,
            unit: sub.unit,
            price,
            mrp,
            barcode,
            stock: Math.floor(10 + Math.random() * 150),
          });
        });
      });
    });
  });

  // Pass 2: Multiply authentically up to targetCount for this industry
  const baseCount = industryProducts.length;
  let varIdx = 0;

  while (industryProducts.length < ind.targetCount) {
    const base = industryProducts[varIdx % baseCount];
    const modifier = commercialVariations[varIdx % commercialVariations.length];
    idCounter++;

    const priceMult = 1 + (varIdx % 5) * 0.25;
    const price = Math.round(base.price * priceMult);
    const mrp = Math.round(price * 1.14);
    const barcode = `890${String(4000000000 + idCounter * 29).slice(1)}`;

    industryProducts.push({
      id: `${ind.id}_${idCounter}`,
      name: `${base.name} [${modifier}]`,
      industry: ind.name,
      industryId: ind.id,
      category: base.category,
      hsn: base.hsn,
      taxRate: base.taxRate,
      unit: base.unit,
      price,
      mrp,
      barcode,
      stock: Math.floor(5 + Math.random() * 100),
    });

    varIdx++;
  }

  // Save partitioned file for this industry (instant 100ms load per industry)
  const targetPath = path.resolve(`public/data/catalogs/${ind.id}.json`);
  fs.writeFileSync(targetPath, JSON.stringify(industryProducts), 'utf8');

  const sizeMb = (fs.statSync(targetPath).size / (1024 * 1024)).toFixed(2);
  console.log(`✓ ${ind.name}: ${industryProducts.length.toLocaleString()} products saved to catalogs/${ind.id}.json (${sizeMb} MB)`);

  totalGlobalCount += industryProducts.length;
  industrySummaries.push({
    id: ind.id,
    name: ind.name,
    icon: ind.icon,
    count: industryProducts.length,
    file: `/data/catalogs/${ind.id}.json`
  });
});

// Save master index file
const indexContent = {
  totalProducts: totalGlobalCount,
  updatedAt: new Date().toISOString(),
  industries: industrySummaries
};

fs.writeFileSync(path.resolve('public/data/catalogs/index.json'), JSON.stringify(indexContent, null, 2), 'utf8');
console.log(`\n🎉 Success! Total ${totalGlobalCount.toLocaleString()} products generated across ${industryConfigs.length} business sectors!`);
console.log('Saved master catalog index to public/data/catalogs/index.json');
