import {ServiceResult} from '../types/auth';
import {API_BASE_URL} from '../constants/api';
import {
  Category,
  CreateOrderRequest,
  CreatedOrderResult,
  CreatedOrder,
  Customer,
  InventoryItem,
  StoredOrderBill,
} from '../types/order';

interface CollectionResponse<T> {
  success?: boolean;
  data?: T[];
  message?: string;
}

interface EntityResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

interface CreateOrderResponse {
  success?: boolean;
  data?: CreatedOrder;
  bill?: {
    url: string;
    file_name: string;
  };
  bill_generation_error?: string;
  message?: string;
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Request failed. Please try again.';
};

const getHeaders = (token: string, includeJson = false) => ({
  Accept: 'application/json',
  Authorization: `Bearer ${token}`,
  ...(includeJson ? {'Content-Type': 'application/json'} : null),
});

const readJsonResponse = async <T>(response: Response): Promise<T | null> => {
  const payloadText = await response.text();

  if (!payloadText.trim()) {
    return null;
  }

  try {
    return JSON.parse(payloadText) as T;
  } catch (error) {
    return null;
  }
};

const getCollection = async <T>(
  endpoint: string,
  token: string,
): Promise<ServiceResult<T[]>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'GET',
      headers: getHeaders(token),
    });

    const payload = await readJsonResponse<CollectionResponse<T>>(response);

    if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
      return {
        ok: false,
        message:
          payload?.message ?? `Request failed with status ${response.status}.`,
      };
    }

    return {
      ok: true,
      data: payload.data,
    };
  } catch (error) {
    return {
      ok: false,
      message: getErrorMessage(error),
    };
  }
};

export const orderService = {
  async createOrder(
    token: string,
    request: CreateOrderRequest,
  ): Promise<ServiceResult<CreatedOrderResult>> {
    try {
      const response = await fetch(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: getHeaders(token, true),
        body: JSON.stringify({
          customer_id: request.customerId,
          items: request.items.map(item => ({
            item_id: item.itemId,
            price: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal,
            unit_deposit: item.unitDeposit,
            unit_discount: item.unitDiscount,
            unit_price: item.unitPrice,
          })),
          load_number: request.loadNumber,
          notes: request.notes,
          total_amount: request.totalAmount,
          total_credits: request.totalCredits,
          total_deposit: request.totalDeposit,
          customerSignature: request.customerSignature,
          driverSignature: request.driverSignature,
          payment_type: request.paymentType,
          check_number: request.checkNumber,
          is_checklist: request.isChecklist,
          clientTimestamp: request.clientTimestamp,
        }),
      });

      const payload = await readJsonResponse<CreateOrderResponse>(response);

      if (!response.ok || !payload?.success || !payload.data) {
        return {
          ok: false,
          message:
            payload?.message ??
            `Request failed with status ${response.status}.`,
        };
      }

      return {
        ok: true,
        data: {
          bill: payload.bill,
          billGenerationError: payload.bill_generation_error,
          order: payload.data,
        },
      };
    } catch (error) {
      return {
        ok: false,
        message: getErrorMessage(error),
      };
    }
  },

  async getOrderBill(
    token: string,
    orderId: number,
  ): Promise<ServiceResult<{ url: string; file_name: string }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/${orderId}/bill`, {
        method: 'GET',
        headers: getHeaders(token),
      });

      const payload = await readJsonResponse<EntityResponse<{ url: string; file_name: string }>>(
        response,
      );

      if (!response.ok || !payload?.success || !payload.data) {
        return {
          ok: false,
          message:
            payload?.message ??
            `Request failed with status ${response.status}.`,
        };
      }

      return {
        ok: true,
        data: payload.data,
      };
    } catch (error) {
      return {
        ok: false,
        message: getErrorMessage(error),
      };
    }
  },
  
  async getOrderChecklist(
    token: string,
    orderId: number,
    customerSignature?: string | null,
    driverSignature?: string | null,
    clientTimestamp?: string | null,
  ): Promise<ServiceResult<{ url: string; file_name: string }>> {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/${orderId}/checklist`, {
        method: 'POST',
        headers: getHeaders(token, true),
        body: JSON.stringify({
          customerSignature,
          driverSignature,
          clientTimestamp
        })
      });

      const payload = await readJsonResponse<EntityResponse<{ url: string; file_name: string }>>(
        response,
      );

      if (!response.ok || !payload?.success || !payload.data) {
        return {
          ok: false,
          message:
            payload?.message ??
            `Request failed with status ${response.status}.`,
        };
      }

      return {
        ok: true,
        data: payload.data,
      };
    } catch (error) {
      return {
        ok: false,
        message: getErrorMessage(error),
      };
    }
  },

  getCustomers(token: string) {
    return getCollection<Customer>('customers', token);
  },

  getCategories(token: string) {
    return getCollection<Category>('categories', token);
  },

  getInventory(token: string, customerId?: number) {
    let endpoint = 'inventory';
    if (customerId) {
      endpoint += `?customer_id=${customerId}`;
    }
    return getCollection<InventoryItem>(endpoint, token);
  },

  getOrders(token: string, month?: number, year?: number) {
    let endpoint = 'orders';
    if (month !== undefined && year !== undefined) {
      endpoint += `?month=${month}&year=${year}`;
    }
    return getCollection<CreatedOrder>(endpoint, token);
  },
};
