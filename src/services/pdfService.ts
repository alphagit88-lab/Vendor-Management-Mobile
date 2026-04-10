import {NativeModules} from 'react-native';

import {ServiceResult} from '../types/auth';
import {
  GenerateBillRequest,
  GeneratedBillFile,
  StoredBillActionRequest,
  StoredBillActionResult,
} from '../types/order';

interface OrderPdfNativeModule {
  generateOrderBill(payload: GenerateBillRequest): Promise<GeneratedBillFile>;
  openPdfFromUrl(
    payload: StoredBillActionRequest,
  ): Promise<StoredBillActionResult>;
  printPdfFromUrl(
    payload: StoredBillActionRequest,
  ): Promise<StoredBillActionResult>;
}

const {OrderPdfModule} = NativeModules as {
  OrderPdfModule?: OrderPdfNativeModule;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to generate the PDF bill right now.';
};

export const pdfService = {
  async generateOrderBill(
    request: GenerateBillRequest,
  ): Promise<ServiceResult<GeneratedBillFile>> {
    if (!OrderPdfModule?.generateOrderBill) {
      return {
        ok: false,
        message: 'PDF generation is not available in this app build yet.',
      };
    }

    try {
      const data = await OrderPdfModule.generateOrderBill(request);

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return {
        ok: false,
        message: getErrorMessage(error),
      };
    }
  },

  async openStoredBill(
    request: StoredBillActionRequest,
  ): Promise<ServiceResult<StoredBillActionResult>> {
    if (!OrderPdfModule?.openPdfFromUrl) {
      return {
        ok: false,
        message: 'Receipt viewing is not available in this app build yet.',
      };
    }

    try {
      const data = await OrderPdfModule.openPdfFromUrl(request);

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          getErrorMessage(error) ||
          'Unable to open the stored receipt right now.',
      };
    }
  },

  async printStoredBill(
    request: StoredBillActionRequest,
  ): Promise<ServiceResult<StoredBillActionResult>> {
    if (!OrderPdfModule?.printPdfFromUrl) {
      return {
        ok: false,
        message: 'Receipt printing is not available in this app build yet.',
      };
    }

    try {
      const data = await OrderPdfModule.printPdfFromUrl(request);

      return {
        ok: true,
        data,
      };
    } catch (error) {
      return {
        ok: false,
        message: getErrorMessage(error) || 'Unable to print the receipt.',
      };
    }
  },
};
