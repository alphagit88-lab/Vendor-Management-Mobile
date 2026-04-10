import {ServiceResult} from '../types/auth';
import {API_BASE_URL} from '../constants/api';
import {
  Category,
  CreateOrderRequest,
  CreatedOrder,
  Customer,
  InventoryItem,
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

const postEntity = async <T>(
  endpoint: string,
  token: string,
  body: Record<string, string | number | boolean | null>,
): Promise<ServiceResult<T>> => {
  try {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: getHeaders(token, true),
      body: JSON.stringify(body),
    });

    const payload = await readJsonResponse<EntityResponse<T>>(response);

    if (!response.ok || !payload?.success || !payload.data) {
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
  createOrder(token: string, request: CreateOrderRequest) {
    return postEntity<CreatedOrder>('orders', token, {
      customer_id: request.customerId,
      load_number: request.loadNumber,
      notes: request.notes,
      total_amount: request.totalAmount,
      total_credits: request.totalCredits,
      total_deposit: request.totalDeposit,
    });
  },

  getCustomers(token: string) {
    return getCollection<Customer>('customers', token);
  },

  getCategories(token: string) {
    return getCollection<Category>('categories', token);
  },

  getInventory(token: string) {
    return getCollection<InventoryItem>('inventory', token);
  },
};
