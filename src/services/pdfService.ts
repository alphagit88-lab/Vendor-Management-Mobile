import {NativeModules} from 'react-native';

import {ServiceResult} from '../types/auth';
import {GenerateBillRequest, GeneratedBillFile} from '../types/order';

interface OrderPdfNativeModule {
  generateOrderBill(payload: GenerateBillRequest): Promise<GeneratedBillFile>;
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
};
