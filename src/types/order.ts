export interface Customer {
  id: number;
  name: string;
  address: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  account_id: string;
  permit_numbers: string;
  registered_company_name: string;
  dba: string;
  email: string;
  sales_tax_id: string;
  has_cigarette_permit: boolean;
  tobacco_permit_number: string;
  tobacco_expire_date: string;
  payment_type: string;
}

export interface InventorySubItem {
  user_id: number;
  user_name: string;
  location: string;
  quantity: number;
}

export interface InventoryItem {
  id: number;
  item_name: string;
  item_number: string | null;
  price: string;
  category_name: string;
  warehouse_quantity: number;
  salesperson_quantity: string;
  total_quantity: string;
  reorder_level: number;
  sub_inventories: InventorySubItem[];
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface PersonalInventoryItem extends InventoryItem {
  heldQuantity: number;
  unitPrice: number;
}

export interface CreateOrderRequest {
  customerId: number;
  items: CreateOrderItem[];
  loadNumber: string;
  notes: string;
  totalAmount: number;
  totalCredits: number;
  totalDeposit: number;
  customerSignature?: string | null;
  driverSignature?: string | null;
  paymentType?: string | null;
  checkNumber?: string | null;
  isChecklist?: boolean;
  clientTimestamp?: string | null;
}

export interface CreateOrderItem {
  itemId: number;
  quantity: number;
  subtotal: number;
  unitPrice: number;
  unitDeposit: number;
  unitDiscount: number;
}

export interface HistoryOrderItem {
  id: number;
  item_id: number;
  item_number: string | null;
  item_name: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

export interface CreatedOrder {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name?: string;
  user_id: number;
  total_amount: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  load_number: string | null;
  total_credits: string;
  total_deposit: string;
  payment_type: string | null;
  check_number: string | null;
  client_timestamp: string | null;
  items?: HistoryOrderItem[];
}

export interface StoredOrderBill {
  order_id: number;
  order_number: string;
  customer_name: string;
  file_name: string;
  file_path: string;
  bill_link: string;
  generated_at: string;
}

export interface CreatedOrderResult {
  bill?: {
    url: string;
    file_name: string;
  };
  billGenerationError?: string;
  order: CreatedOrder;
}

export interface OrderBillLineItem {
  itemNumber?: string | null;
  lineTotal: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface GenerateBillRequest {
  createdAt: string;
  customerAccountId: string;
  customerAddress: string;
  customerName: string;
  customerPhone: string;
  items: OrderBillLineItem[];
  notes: string;
  orderNumber: string;
  salespersonName: string;
  totalAmount: number;
  totalCredits: number;
  totalDeposit: number;
}

export interface GeneratedBillFile {
  fileName: string;
  fileUri: string;
  opened: boolean;
}

export interface StoredBillActionRequest {
  fileName: string;
  jobName?: string;
  token?: string;
  url: string;
}

export interface StoredBillActionResult {
  fileName: string;
  fileUri: string;
  opened?: boolean;
  queued?: boolean;
}
