import { Building2, Printer, Package, Landmark, Users, DatabaseBackup, CreditCard, Languages } from 'lucide-react';

// Settings pages (cards on the settings home). `words` feed the search box.
export const SETTINGS_PAGES = [
  { id: 'business', icon: Building2, color: '#2563eb', words: 'company name address logo signature bank upi phone email gstin pan profile' },
  { id: 'bills', icon: Printer, color: '#7c3aed', words: 'print invoice bill design paper thermal printer template terms notes pdf preview whatsapp bluetooth usb' },
  { id: 'products', icon: Package, color: '#059669', words: 'stock low alert inventory features modules items products' },
  { id: 'gst', icon: Landmark, color: '#d97706', words: 'gst tax gstin state region country hsn currency' },
  { id: 'staff', icon: Users, color: '#0891b2', words: 'staff team users manager biller accountant ca invite access activity log' },
  { id: 'data', icon: DatabaseBackup, color: '#475569', words: 'backup restore trash google drive import export excel csv update' },
  { id: 'plan', icon: CreditCard, color: '#db2777', words: 'plan subscription pay upgrade pro business trial bill' },
  { id: 'help', icon: Languages, color: '#16a34a', words: 'language tamil hindi help guide support whatsapp contact' },
];
