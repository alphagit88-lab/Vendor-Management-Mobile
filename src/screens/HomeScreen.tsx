import React, { useEffect, useState, useRef } from 'react';
import Geolocation, {
  GeolocationError,
  GeolocationResponse,
} from '@react-native-community/geolocation';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Pdf from 'react-native-pdf';
import RNPrint from 'react-native-print';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { BLEPrinter } from '@haroldtran/react-native-thermal-printer';
import { BleManager } from 'react-native-ble-plx';
import SignatureModal from '../components/SignatureModal';

import { InlineMessage } from '../components/common/InlineMessage';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { StatePanel } from '../components/common/StatePanel';
import { buildBackendUrl } from '../constants/api';
import { orderService } from '../services/orderService';
import { pdfService } from '../services/pdfService';
import { palette } from '../theme/colors';
import {
  getContentWidth,
  getDeviceType,
  getHorizontalPadding,
  moderateScale,
} from '../theme/responsive';
import { radii, shadowPresets } from '../theme/shape';
import { spacing } from '../theme/spacing';
import { AuthSession, ContentLoadState } from '../types/auth';
import {
  Category,
  Customer,
  PersonalInventoryItem,
  StoredOrderBill,
  CreateOrderRequest,
  CreatedOrder,
} from '../types/order';

type HomeView = 'home' | 'customers' | 'products' | 'settings' | 'history';
type LoadStatus = 'idle' | ContentLoadState;
type CheckoutState = 'idle' | 'loading';
type FeedbackTone = 'error' | 'info' | 'success';
type DeviceLocationStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error';
type ReceiptActionState = 'idle' | 'opening' | 'printing' | 'loading';

interface HomeScreenProps {
  onSignOut: () => void;
  session: AuthSession;
}

interface CheckoutFeedback {
  message: string;
  tone: FeedbackTone;
}

interface DeviceLocation {
  latitude: number;
  longitude: number;
}

interface DistanceSignal {
  glowColor: string;
  label: string;
  lightColor: string;
}

interface BluetoothPrinterDevice {
  device_name?: string;
  inner_mac_address: string;
}

const crc16xmodem = (data: Uint8Array): number => {
  return data.reduce((crc: number, x: number) => {
    crc ^= x << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    return crc & 0xffff;
  }, 0);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binaryString = ReactNativeBlobUtil.base64.decode(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i++];
    const byte2 = i < bytes.length ? bytes[i++] : NaN;
    const byte3 = i < bytes.length ? bytes[i++] : NaN;
    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 3) << 4) | (byte2 >> 4);
    const enc3 = ((byte2 & 15) << 2) | (byte3 >> 6);
    const enc4 = byte3 & 63;
    output += chars.charAt(enc1);
    output += chars.charAt(enc2);
    output += Number.isNaN(byte2) ? '=' : chars.charAt(enc3);
    output += Number.isNaN(byte3) ? '=' : chars.charAt(enc4);
  }
  return output;
};

const EARTH_RADIUS_KILOMETERS = 6371.0088;
const CLOSE_DISTANCE_KILOMETERS = 16;
const MEDIUM_DISTANCE_KILOMETERS = 40;
const MAX_ORDER_QUANTITY_PER_ITEM = 10;

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const ALL_PRODUCT_CATEGORY = 'all-categories';
const getProductCategoryLabel = (value: string) =>
  normalizeText(value) || 'Uncategorized';
const getProductCategoryValue = (value: string) =>
  getProductCategoryLabel(value).toLowerCase();

const getCustomerAddress = (value: string) => value.replace(/\s*\n\s*/g, '\n');
const hasValidCoordinate = (
  value: number | null | undefined,
): value is number => typeof value === 'number' && Number.isFinite(value);
const toRadians = (value: number) => (value * Math.PI) / 180;
const formatCoordinate = (value: number) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
const formatDistanceKilometers = (value: number) =>
  `${value.toLocaleString('en-US', {
    minimumFractionDigits: value < 10 ? 1 : 0,
    maximumFractionDigits: value < 10 ? 1 : 0,
  })} km away`;
const formatReceiptTimestamp = (value: string) => {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return 'Stored receipt ready';
  }

  return `Stored ${timestamp.toLocaleString('en-US', {
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  })}`;
};
const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
) =>
  Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);

const getLocationErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return 'We could not determine your current location. Showing customers without distance sorting.';
  }

  const locationError = error as GeolocationError;

  if (locationError.code === locationError.PERMISSION_DENIED) {
    return 'Location access was denied. Showing customers without distance sorting.';
  }

  if (locationError.code === locationError.TIMEOUT) {
    return 'Location lookup timed out. Try refreshing your current location.';
  }

  if (locationError.code === locationError.POSITION_UNAVAILABLE) {
    return 'Current location is unavailable right now. Try again in a moment.';
  }

  if (typeof locationError.message === 'string' && locationError.message) {
    return locationError.message;
  }

  return 'We could not determine your current location. Showing customers without distance sorting.';
};
const getCustomerDistanceKilometers = (
  customer: Customer,
  currentLocation: DeviceLocation | null,
) => {
  if (
    !currentLocation ||
    !hasValidCoordinate(customer.latitude) ||
    !hasValidCoordinate(customer.longitude)
  ) {
    return null;
  }

  const latitudeDistance = toRadians(
    customer.latitude - currentLocation.latitude,
  );
  const longitudeDistance = toRadians(
    customer.longitude - currentLocation.longitude,
  );
  const currentLatitude = toRadians(currentLocation.latitude);
  const customerLatitude = toRadians(customer.latitude);
  const haversineComponent =
    Math.sin(latitudeDistance / 2) * Math.sin(latitudeDistance / 2) +
    Math.cos(currentLatitude) *
    Math.cos(customerLatitude) *
    Math.sin(longitudeDistance / 2) *
    Math.sin(longitudeDistance / 2);
  const arcDistance =
    2 *
    Math.atan2(
      Math.sqrt(haversineComponent),
      Math.sqrt(1 - haversineComponent),
    );

  return EARTH_RADIUS_KILOMETERS * arcDistance;
};
const getMaxOrderableQuantity = (heldQuantity: number) =>
  Math.min(heldQuantity, MAX_ORDER_QUANTITY_PER_ITEM);
const getDistanceSignal = (distanceKilometers: number): DistanceSignal => {
  if (distanceKilometers <= CLOSE_DISTANCE_KILOMETERS) {
    return {
      glowColor: 'rgba(67, 193, 96, 0.28)',
      label: 'Close',
      lightColor: '#43C160',
    };
  }

  if (distanceKilometers <= MEDIUM_DISTANCE_KILOMETERS) {
    return {
      glowColor: 'rgba(233, 190, 71, 0.30)',
      label: 'Medium',
      lightColor: '#E9BE47',
    };
  }

  return {
    glowColor: 'rgba(225, 91, 100, 0.28)',
    label: 'Far',
    lightColor: '#E15B64',
  };
};

const getInitials = (value: string) => {
  const initials = normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');

  return initials || 'CU';
};

const sanitizeCurrencyInput = (value: string) => {
  const sanitized = value.replace(/[^0-9.]/g, '');
  const firstDotIndex = sanitized.indexOf('.');

  if (firstDotIndex === -1) {
    return sanitized;
  }

  const wholeNumber = sanitized.slice(0, firstDotIndex);
  const decimals = sanitized.slice(firstDotIndex + 1).replace(/\./g, '');

  return `${wholeNumber}.${decimals.slice(0, 2)}`;
};

const parseCurrencyInput = (value: string) => {
  const parsedValue = Number.parseFloat(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const backIcon = require('../assets/images/left.png');
const dropdownIcon = require('../assets/images/down.png');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ui = {
  accent: palette.accent,
  accentStrong: '#1F5A3B',
  cardBorder: '#D9E4D3',
  cardBorderStrong: '#C4D5BC',
  dangerSoft: '#FCEBEC',
  darkBorder: 'rgba(255,255,255,0.08)',
  darkSurface: '#17271D',
  darkSurfaceRaised: '#203328',
  darkTextMuted: '#A7B8AE',
  highlight: palette.primaryStrong,
  highlightSoft: '#EEF6DA',
  pageGlowPrimary: 'rgba(127, 169, 60, 0.16)',
  pageGlowSecondary: 'rgba(41, 181, 84, 0.10)',
  softSurface: '#F7FAF1',
  softSurfaceStrong: '#EEF4E6',
  textBody: '#45564C',
  textHeading: '#203127',
  textMuted: '#738278',
};

export function HomeScreen({ onSignOut, session }: HomeScreenProps) {
  const { width } = useWindowDimensions();
  const [view, setView] = useState<HomeView>('home');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersStatus, setCustomersStatus] = useState<LoadStatus>('idle');
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<DeviceLocation | null>(
    null,
  );
  const [locationStatus, setLocationStatus] =
    useState<DeviceLocationStatus>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [products, setProducts] = useState<PersonalInventoryItem[]>([]);
  const [productsStatus, setProductsStatus] = useState<LoadStatus>('idle');
  const [productsError, setProductsError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesStatus, setCategoriesStatus] = useState<LoadStatus>('idle');
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [isCategoryDropdownVisible, setIsCategoryDropdownVisible] =
    useState(false);
  const [selectedProductCategory, setSelectedProductCategory] =
    useState(ALL_PRODUCT_CATEGORY);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [selectedQuantities, setSelectedQuantities] = useState<
    Record<number, number>
  >({});
  const [creditMemoInput, setCreditMemoInput] = useState('0');
  const [containerDepositInput, setContainerDepositInput] = useState('0');
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [isSummaryVisible, setIsSummaryVisible] = useState(false);
  const [isCustomerDetailsExpanded, setIsCustomerDetailsExpanded] =
    useState(false);
  const [quantityModalProduct, setQuantityModalProduct] =
    useState<PersonalInventoryItem | null>(null);
  const [customQuantityInput, setCustomQuantityInput] = useState('1');
  const [customQuantityError, setCustomQuantityError] = useState<string | null>(
    null,
  );
  const [checkoutFeedback, setCheckoutFeedback] =
    useState<CheckoutFeedback | null>(null);
  const [latestStoredBill, setLatestStoredBill] = useState<{
    bill_link: string;
    url: string;
    file_name: string;
    order_number: string;
    customer_name?: string;
    generated_at: string;
  } | null>(null);
  const [isBillModalVisible, setIsBillModalVisible] = useState(false);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [receiptActionState, setReceiptActionState] =
    useState<ReceiptActionState>('idle');
  const [bluetoothStatusMessage, setBluetoothStatusMessage] = useState(
    'Bluetooth status not checked yet.',
  );
  const [pairedBluetoothDevices, setPairedBluetoothDevices] = useState<
    BluetoothPrinterDevice[]
  >([]);
  const [discoveredBluetoothDevices, setDiscoveredBluetoothDevices] = useState<
    BluetoothPrinterDevice[]
  >([]);
  const [selectedBluetoothPrinterMac, setSelectedBluetoothPrinterMac] =
    useState<string | null>(null);
  const [isBluetoothLoading, setIsBluetoothLoading] = useState(false);
  const [isPrinterPickerVisible, setIsPrinterPickerVisible] = useState(false);
  const [isAddDeviceModalVisible, setIsAddDeviceModalVisible] = useState(false);
  const [isAddDeviceLoading, setIsAddDeviceLoading] = useState(false);
  const [isAddDeviceOpening, setIsAddDeviceOpening] = useState(false);
  const [addDeviceLastError, setAddDeviceLastError] = useState<string | null>(null);
  const [addDeviceScanMessage, setAddDeviceScanMessage] = useState(
    'Tap Add Device to scan.',
  );
  const [connectingDeviceMac, setConnectingDeviceMac] = useState<string | null>(
    null,
  );
  const [pendingPrintBill, setPendingPrintBill] = useState<any>(null);
  const isBlePrinterInitializedRef = useRef(false);
  const connectedPrinterMacRef = useRef<string | null>(null);
  const bleManagerRef = useRef<BleManager | null>(null);
  const activeBleDeviceRef = useRef<any>(null);
  const [orderHistory, setOrderHistory] = useState<CreatedOrder[]>([]);
  const [historyMonth, setHistoryMonth] = useState(new Date().getMonth() + 1);
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [expandedOrders, setExpandedOrders] = useState<Record<number, boolean>>({});
  const [historyStatus, setHistoryStatus] = useState<LoadStatus>('idle');

  // Signature States
  const [customerSignature, setCustomerSignature] = useState<string | null>(null);
  const [driverSignature, setDriverSignature] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<'Cash' | 'Check' | 'EFT' | 'MO'>('Cash');
  const [checkNumber, setCheckNumber] = useState('');
  const [signatureModalType, setSignatureModalType] = useState<'customer' | 'driver' | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const authRef = useRef<{
    mac?: Uint8Array;
    authBytes?: Uint8Array;
    authCrc?: number[];
  }>({});

  const handleLXAuth = async (device: any, msg: Uint8Array) => {
    if (msg[0] !== 0x5a) return;
    const serviceUuid = "ffe6";
    const sendCharUuid = "ffe1";
    switch (msg[1]) {
      case 0x01: {
        authRef.current.mac = msg.slice(4, 10);
        const authBytes = new Uint8Array(10);
        for (let i = 0; i < 10; i++) authBytes[i] = Math.floor(Math.random() * 256);
        authRef.current.authBytes = authBytes;
        authRef.current.authCrc = Array.from(authBytes).map((x: number): number => {
          const y = new Uint8Array(7);
          y[0] = x;
          y.set(authRef.current.mac || new Uint8Array(6), 1);
          return crc16xmodem(y);
        });
        const newMsg = new Uint8Array([0x5a, 0x0a, ...authBytes]);
        await device.writeCharacteristicWithoutResponseForService(serviceUuid, sendCharUuid, bytesToBase64(newMsg));
        break;
      }
      case 0x0a: {
        if (!authRef.current.authCrc) return;
        const newMsg = new Uint8Array([0x5a, 0x0b, ...authRef.current.authCrc.map((x) => x >> 8)]);
        await device.writeCharacteristicWithoutResponseForService(serviceUuid, sendCharUuid, bytesToBase64(newMsg));
        break;
      }
      case 0x0b: {
        if (msg[2] === 1) {
          setIsAuthenticated(true);
          setCheckoutFeedback({ message: 'Printer Authenticated and Ready!', tone: 'success' });
        } else {
          setIsAuthenticated(false);
        }
        break;
      }
    }
  };

  useEffect(() => {
    if (checkoutFeedback) {
      const timer = setTimeout(() => {
        setCheckoutFeedback(null);
      }, 6000); // Hide after 6 seconds
      return () => clearTimeout(timer);
    }
  }, [checkoutFeedback]);

  const contentWidth = getContentWidth(width);
  const horizontalPadding = getHorizontalPadding(width);
  const deviceType = getDeviceType(width);
  const isTabletLayout = deviceType === 'tablet';
  const isCompactLayout = deviceType === 'smallPhone' || deviceType === 'phone';
  const twoColumnLayout =
    deviceType === 'largePhone' || deviceType === 'tablet';
  const layoutWidth = isTabletLayout
    ? width - horizontalPadding * 2
    : contentWidth;
  const productCardLayoutStyle = isTabletLayout
    ? styles.productCardThird
    : twoColumnLayout
      ? styles.productCardHalf
      : null;
  const screenContentStyle = [
    styles.screenContent,
    { paddingHorizontal: horizontalPadding },
  ];
  const sectionWidthStyle = { width: layoutWidth };
  const categoryDropdownCardStyle = { width: Math.min(layoutWidth, 420) };
  const quantityModalCardStyle = { width: Math.min(layoutWidth, 360) };
  const titleSizeStyle = { fontSize: moderateScale(34, width, 0.28) };
  const productCategories = Array.from(
    new Map(
      [
        ...categories.map(category => category.name),
        ...products.map(product => product.category_name),
      ].map(categoryName => {
        const categoryLabel = getProductCategoryLabel(categoryName);

        return [categoryLabel.toLowerCase(), categoryLabel];
      }),
    ),
  )
    .sort((firstCategory, secondCategory) =>
      firstCategory[1].localeCompare(secondCategory[1]),
    )
    .map(([value, label]) => ({ label, value }));
  const productCategoryOptions = [
    { label: 'All Categories', value: ALL_PRODUCT_CATEGORY },
    ...productCategories,
  ];
  const isCategoryDropdownDisabled = categoriesStatus === 'loading';
  const selectedProductCategoryLabel =
    productCategoryOptions.find(
      category => category.value === selectedProductCategory,
    )?.label ?? 'All Categories';
  const normalizedProductSearchQuery =
    normalizeText(productSearchQuery).toLowerCase();
  const filteredProducts = products.filter(product => {
    const normalizedProductCategory = getProductCategoryValue(
      product.category_name,
    );
    const matchesCategory =
      selectedProductCategory === ALL_PRODUCT_CATEGORY ||
      normalizedProductCategory === selectedProductCategory;

    if (!matchesCategory) {
      return false;
    }

    if (!normalizedProductSearchQuery) {
      return true;
    }

    const normalizedProductName = normalizeText(
      product.item_name,
    ).toLowerCase();
    const normalizedProductSku = (product.item_number ?? '').toLowerCase();

    return (
      normalizedProductName.includes(normalizedProductSearchQuery) ||
      normalizedProductSku.includes(normalizedProductSearchQuery)
    );
  });
  const sortedCustomers = customers
    .map((customer, index) => ({
      customer,
      distanceFromDevice: getCustomerDistanceKilometers(
        customer,
        currentLocation,
      ),
      index,
    }))
    .sort((firstCustomer, secondCustomer) => {
      if (
        firstCustomer.distanceFromDevice === null &&
        secondCustomer.distanceFromDevice === null
      ) {
        return firstCustomer.index - secondCustomer.index;
      }

      if (firstCustomer.distanceFromDevice === null) {
        return 1;
      }

      if (secondCustomer.distanceFromDevice === null) {
        return -1;
      }

      if (
        firstCustomer.distanceFromDevice !== secondCustomer.distanceFromDevice
      ) {
        return (
          firstCustomer.distanceFromDevice - secondCustomer.distanceFromDevice
        );
      }

      return firstCustomer.index - secondCustomer.index;
    });
  const nearestCustomerId =
    locationStatus === 'ready'
      ? sortedCustomers.find(
        sortedCustomer => sortedCustomer.distanceFromDevice !== null,
      )?.customer.id ?? null
      : null;

  const selectedProducts = products.filter(
    product => (selectedQuantities[product.id] ?? 0) > 0,
  );
  const totalUnits = selectedProducts.reduce(
    (sum, product) => sum + (selectedQuantities[product.id] ?? 0),
    0,
  );
  const itemSubtotal = selectedProducts.reduce(
    (sum, product) =>
      sum + product.unitPrice * (selectedQuantities[product.id] ?? 0),
    0,
  );
  const creditMemoAmount = parseCurrencyInput(creditMemoInput);
  const containerDepositAmount = parseCurrencyInput(containerDepositInput);
  const totalPayable = itemSubtotal - creditMemoAmount + containerDepositAmount;
  const generateBillDisabled =
    checkoutState === 'loading' ||
    receiptActionState === 'loading' ||
    !selectedCustomer ||
    !selectedProducts.length ||
    totalPayable < 0;
  const selectedItemsLabel =
    selectedProducts.length === 1
      ? '1 item selected'
      : `${selectedProducts.length} items selected`;
  const quantityModalRequestedQuantity = Number.parseInt(
    customQuantityInput,
    10,
  );
  const quantityModalRequestedUnits = Number.isInteger(
    quantityModalRequestedQuantity,
  )
    ? quantityModalRequestedQuantity
    : 0;
  const quantityModalCurrentQuantity = quantityModalProduct
    ? selectedQuantities[quantityModalProduct.id] ?? 0
    : 0;
  const quantityModalBaseRemainingQuantity = quantityModalProduct
    ? Math.max(
      getMaxOrderableQuantity(quantityModalProduct.heldQuantity) -
      quantityModalCurrentQuantity,
      0,
    )
    : 0;
  const quantityModalPreviewRemainingQuantity = quantityModalProduct
    ? Math.max(
      quantityModalBaseRemainingQuantity - quantityModalRequestedUnits,
      0,
    )
    : 0;

  const resetCheckoutState = () => {
    setCreditMemoInput('0');
    setContainerDepositInput('0');
    setCheckoutFeedback(null);
    setCheckoutState('idle');
    setLatestStoredBill(null);
    setReceiptActionState('idle');
  };

  const closeCategoryDropdown = () => {
    setIsCategoryDropdownVisible(false);
  };

  const closeQuantityModal = () => {
    setQuantityModalProduct(null);
    setCustomQuantityInput('1');
    setCustomQuantityError(null);
  };

  const openQuantityModal = (product: PersonalInventoryItem) => {
    setQuantityModalProduct(product);
    setCustomQuantityInput('1');
    setCustomQuantityError(null);
  };

  const handleCustomQuantityInput = (value: string) => {
    setCustomQuantityInput(value.replace(/[^0-9]/g, ''));

    if (customQuantityError) {
      setCustomQuantityError(null);
    }
  };

  const loadCurrentLocation = async () => {
    setLocationStatus('loading');
    setLocationError(null);
    setCurrentLocation(null);

    try {
      if (Platform.OS === 'android') {
        const permissionResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Share current location',
            message:
              'We use your current location to sort customers from nearest to farthest.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not now',
          },
        );

        if (permissionResult !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocationStatus('denied');
          setLocationError(
            permissionResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
              ? 'Location permission is turned off for this app. Enable it to sort customers from nearest to farthest.'
              : 'Location access was denied. Showing customers without distance sorting.',
          );
          return;
        }
      }

      Geolocation.setRNConfiguration({
        skipPermissionRequests: Platform.OS === 'android',
        authorizationLevel: 'whenInUse',
        locationProvider: 'auto',
      });

      const position = await new Promise<GeolocationResponse>(
        (resolve, reject) => {
          Geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 60000,
            timeout: 15000,
          });
        },
      );

      setCurrentLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setLocationStatus('ready');
    } catch (error) {
      setCurrentLocation(null);
      setLocationStatus('error');
      setLocationError(getLocationErrorMessage(error));
    }
  };

  useEffect(() => {
    loadCurrentLocation();
  }, []);

  const loadCustomers = async () => {
    setCustomersStatus('loading');
    setCustomersError(null);
    setCheckoutFeedback(null);

    const response = await orderService.getCustomers(session.token);

    if (!response.ok || !response.data) {
      setCustomers([]);
      setCustomersStatus('error');
      setCustomersError(response.message ?? 'Unable to load customers.');
      return;
    }

    setCustomers(response.data);
    setCustomersStatus(response.data.length ? 'ready' : 'empty');
  };

  const loadCategories = async () => {
    setCategoriesStatus('loading');
    setCategoriesError(null);

    const response = await orderService.getCategories(session.token);

    if (!response.ok || !response.data) {
      setCategories([]);
      setCategoriesStatus('error');
      setCategoriesError(response.message ?? 'Unable to load categories.');
      return;
    }

    setCategories(response.data);
    setCategoriesStatus(response.data.length ? 'ready' : 'empty');
  };

  const openPlaceOrders = () => {
    setView('customers');
    setSelectedCustomer(null);
    setProducts([]); // Clear previous products
    closeCategoryDropdown();
    setSelectedProductCategory(ALL_PRODUCT_CATEGORY);
    setProductSearchQuery('');
    setSelectedQuantities({});
    setIsSummaryVisible(false);
    setIsCustomerDetailsExpanded(false);
    closeQuantityModal();
    resetCheckoutState();
    loadCategories();
    loadCustomers();
  };

  const loadProducts = async (customerId?: number) => {
    setProductsStatus('loading');
    setProductsError(null);
    setCheckoutFeedback(null);

    const response = await orderService.getInventory(session.token, customerId);

    if (!response.ok || !response.data) {
      setProducts([]);
      setProductsStatus('error');
      setProductsError(response.message ?? 'Unable to load products.');
      return;
    }

    const personalInventory = response.data
      .map(item => {
        const personalStock =
          item.sub_inventories.find(
            subInventory => subInventory.user_id === session.user.id,
          )?.quantity ?? 0;

        if (personalStock <= 0) {
          return null;
        }

        return {
          ...item,
          heldQuantity: personalStock,
          unitPrice: Number.parseFloat(item.price) || 0,
        };
      })
      .filter((item): item is PersonalInventoryItem => item !== null);

    setProducts(personalInventory);
    setProductsStatus(personalInventory.length ? 'ready' : 'empty');
  };

  const loadOrderHistory = async (m?: number, y?: number) => {
    setHistoryStatus('loading');
    const month = m ?? historyMonth;
    const year = y ?? historyYear;

    const result = await orderService.getOrders(session.token, month, year);
    if (result.ok && result.data) {
      setOrderHistory(result.data);
      setHistoryStatus('ready');
    } else {
      setHistoryStatus('error');
    }
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    closeCategoryDropdown();
    setSelectedProductCategory(ALL_PRODUCT_CATEGORY);
    setProductSearchQuery('');
    setSelectedQuantities({});
    setIsSummaryVisible(false);
    setIsCustomerDetailsExpanded(false);
    closeQuantityModal();
    resetCheckoutState();
    setView('products');
    if (categoriesStatus === 'idle' || categoriesStatus === 'error') {
      loadCategories();
    }
    loadProducts(customer.id);
  };

  const updateQuantity = (product: PersonalInventoryItem, delta: number) => {
    setCheckoutFeedback(null);
    setLatestStoredBill(null);
    setSelectedQuantities(current => {
      const maxOrderableQuantity = getMaxOrderableQuantity(
        product.heldQuantity,
      );
      const nextQuantity = Math.max(
        0,
        Math.min(maxOrderableQuantity, (current[product.id] ?? 0) + delta),
      );

      if (nextQuantity === 0) {
        const nextSelections = { ...current };
        delete nextSelections[product.id];
        return nextSelections;
      }

      return {
        ...current,
        [product.id]: nextQuantity,
      };
    });
  };

  const addCustomQuantity = () => {
    if (!quantityModalProduct) {
      return;
    }

    if (quantityModalBaseRemainingQuantity <= 0) {
      setCustomQuantityError(
        `This item already reached the ${MAX_ORDER_QUANTITY_PER_ITEM} unit order limit.`,
      );
      return;
    }

    const requestedQuantity = Number.parseInt(customQuantityInput, 10);

    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
      setCustomQuantityError('Enter a quantity greater than 0.');
      return;
    }

    if (requestedQuantity > quantityModalBaseRemainingQuantity) {
      setCustomQuantityError(
        `You can add only ${quantityModalBaseRemainingQuantity} more unit${quantityModalBaseRemainingQuantity === 1 ? '' : 's'
        }.`,
      );
      return;
    }

    updateQuantity(quantityModalProduct, requestedQuantity);
    closeQuantityModal();
  };

  const removeProduct = (productId: number) => {
    setCheckoutFeedback(null);
    setLatestStoredBill(null);
    setSelectedQuantities(current => {
      if (!(productId in current)) {
        return current;
      }

      const nextSelections = { ...current };
      delete nextSelections[productId];
      return nextSelections;
    });
  };

  const setCreditValue = (value: string) => {
    setCheckoutFeedback(null);
    setLatestStoredBill(null);
    setCreditMemoInput(sanitizeCurrencyInput(value));
  };

  const setDepositValue = (value: string) => {
    setCheckoutFeedback(null);
    setLatestStoredBill(null);
    setContainerDepositInput(sanitizeCurrencyInput(value));
  };

  useEffect(() => {
    // EscPosPrinter setup if needed
  }, []);

  const ensureBlePrinterInitialized = async () => {
    if (isBlePrinterInitializedRef.current) {
      return;
    }

    await BLEPrinter.init();
    isBlePrinterInitializedRef.current = true;
  };

  const requestBluetoothPermissions = async () => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const androidApiLevel = Number(Platform.Version);
    const permissions =
      androidApiLevel >= 31
        ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

    for (const permission of permissions) {
      const hasPermission = await PermissionsAndroid.check(permission);
      if (hasPermission) {
        continue;
      }

      const status = await PermissionsAndroid.request(permission);
      if (status !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }
    }

    return true;
  };

  const loadBluetoothDevices = async () => {
    try {
      const hasPermissions = await withTimeout(
        requestBluetoothPermissions(),
        8000,
        'Permission request timed out.',
      );
      if (!hasPermissions) {
        setBluetoothStatusMessage('Bluetooth permission denied.');
        setCheckoutFeedback({
          message: 'Bluetooth permissions are required to print.',
          tone: 'error',
        });
        return null;
      }

      await withTimeout(
        ensureBlePrinterInitialized(),
        8000,
        'Bluetooth initialization timed out.',
      );
      let devices: BluetoothPrinterDevice[] = [];
      try {
        devices =
          ((await withTimeout(
            BLEPrinter.getDeviceList() as Promise<BluetoothPrinterDevice[]>,
            5000,
            'Bluetooth scan timed out. Try again.',
          )) as BluetoothPrinterDevice[]) ?? [];
      } catch (scanError) {
        const scanErrorMessage = String(
          (scanError as any)?.message || scanError || '',
        ).toLowerCase();
        if (
          scanErrorMessage.includes('no device found') ||
          scanErrorMessage.includes('not found')
        ) {
          devices = [];
        } else {
          throw scanError;
        }
      }
      const validDevices = devices.filter(device => device.inner_mac_address);

      setPairedBluetoothDevices(validDevices);
      if (!validDevices.length) {
        setBluetoothStatusMessage(
          'No discoverable Bluetooth printers found. Keep printer ON and retry scan.',
        );
        return [];
      }

      const selectedStillAvailable = validDevices.find(
        device => device.inner_mac_address === selectedBluetoothPrinterMac,
      );
      if (!selectedStillAvailable) {
        setSelectedBluetoothPrinterMac(validDevices[0].inner_mac_address);
      }

      const deviceCount = validDevices.length;
      setBluetoothStatusMessage(
        `${deviceCount} device${deviceCount === 1 ? '' : 's'} found.`,
      );

      return validDevices;
    } catch (error) {
      setBluetoothStatusMessage(
        `Bluetooth scan failed: ${String((error as any)?.message || error)}`,
      );
      return null;
    }
  };

  const scanDevicesWithBlePlx = async () => {
    if (!bleManagerRef.current) {
      bleManagerRef.current = new BleManager();
    }
    const bleManager = bleManagerRef.current;

    const discoveredMap = new Map<string, BluetoothPrinterDevice>();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        bleManager.stopDeviceScan();
        resolve();
      }, 4000);

      bleManager.startDeviceScan(
        null,
        null,
        (error, device) => {
          if (error) {
            clearTimeout(timer);
            bleManager.stopDeviceScan();
            reject(error);
            return;
          }

          if (!device?.id) {
            return;
          }

          const normalizedDevice: BluetoothPrinterDevice = {
            device_name: device.name || device.localName || undefined,
            inner_mac_address: device.id,
          };

          // Add every discovered BLE device; do not filter by name.
          if (!discoveredMap.has(device.id)) {
            discoveredMap.set(device.id, normalizedDevice);
          }
        },
      );
    });

    return Array.from(discoveredMap.values());
  };

  const refreshBluetoothStatus = async () => {
    setIsBluetoothLoading(true);
    try {
      await loadBluetoothDevices();
    } catch (error) {
      setBluetoothStatusMessage(
        `Bluetooth status unavailable: ${String((error as any)?.message || error)}`,
      );
    } finally {
      setIsBluetoothLoading(false);
    }
  };

  const scanAvailableBluetoothDevices = async () => {
    setIsAddDeviceLoading(true);
    setAddDeviceLastError(null);
    setAddDeviceScanMessage('Scanning nearby devices...');
    setDiscoveredBluetoothDevices([]);
    try {
      await requestBluetoothPermissions();
      const discoveredDevices = await scanDevicesWithBlePlx();
      setDiscoveredBluetoothDevices(discoveredDevices);
      setAddDeviceScanMessage(
        discoveredDevices.length
          ? `Found ${discoveredDevices.length} device${discoveredDevices.length === 1 ? '' : 's'}.`
          : 'No device found. Tap Rescan.',
      );
    } catch (error) {
      const message = String((error as any)?.message || error);
      setAddDeviceLastError(message);
      setAddDeviceScanMessage('Scan failed. Tap Rescan.');
    } finally {
      setIsAddDeviceLoading(false);
    }
  };

  const openAddDeviceModal = async () => {
    if (isAddDeviceOpening) {
      return;
    }
    setIsAddDeviceOpening(true);
    setCheckoutFeedback({
      message: 'Opening device scanner...',
      tone: 'info',
    });
    setIsAddDeviceModalVisible(true);
    setDiscoveredBluetoothDevices([]);
    setAddDeviceScanMessage('Opening scanner...');
    scanAvailableBluetoothDevices();
    setIsAddDeviceOpening(false);
  };

  const connectBluetoothDevice = async (device: BluetoothPrinterDevice) => {
    const connectAddress = device.inner_mac_address;
    setIsBluetoothLoading(true);
    setConnectingDeviceMac(connectAddress);
    try {
      await ensureBlePrinterInitialized();
      const normalizedTargetName = (device.device_name || '').trim().toLowerCase();
      const normalizedTargetAddress = device.inner_mac_address.trim().toLowerCase();
      const isLX = normalizedTargetName.startsWith('lx');

      // Fast Path for LX Printers: Skip standard driver and go straight to GATT connection
      if (isLX && bleManagerRef.current) {
        console.log('LX Printer detected. Using fast-path connection.');
        const bleDevice = await bleManagerRef.current.connectToDevice(connectAddress);
        await bleDevice.discoverAllServicesAndCharacteristics();
        activeBleDeviceRef.current = bleDevice;
        connectedPrinterMacRef.current = connectAddress;
        setSelectedBluetoothPrinterMac(connectAddress);

        console.log('LX Printer detected. Starting handshake...');
        bleDevice.monitorCharacteristicForService('ffe6', 'ffe2', (error: any, char: any) => {
          if (error) return;
          if (char?.value) handleLXAuth(bleDevice, base64ToBytes(char.value));
        });
        setTimeout(async () => {
          try {
            await bleDevice.writeCharacteristicWithoutResponseForService('ffe6', 'ffe1', bytesToBase64(new Uint8Array([0x5a, 0x01])));
          } catch (e) { console.log('Auth start failed', e); }
        }, 1000);

        setPairedBluetoothDevices(currentDevices => {
          const alreadyExists = currentDevices.some(d => d.inner_mac_address === connectAddress);
          if (alreadyExists) return currentDevices;
          return [...currentDevices, { device_name: device.device_name || 'LX Printer', inner_mac_address: connectAddress }];
        });

        setCheckoutFeedback({ message: `Connected to ${device.device_name || connectAddress}.`, tone: 'success' });
        setIsBluetoothLoading(false);
        setConnectingDeviceMac(null);
        return;
      }

      // Standard Driver Path (For non-LX printers)
      let validPrinterDevices: BluetoothPrinterDevice[] = [];
      try {
        const availablePrinterDevices =
          ((await withTimeout(BLEPrinter.getDeviceList() as Promise<BluetoothPrinterDevice[]>, 4000, 'Standard driver scan timed out.')) as BluetoothPrinterDevice[]) ?? [];
        validPrinterDevices = availablePrinterDevices.filter(item => item.inner_mac_address);
      } catch (ignoredError) { }

      const resolvedPrinterDevice =
        validPrinterDevices.find(
          item =>
            item.inner_mac_address.trim().toLowerCase() === normalizedTargetAddress,
        ) ||
        validPrinterDevices.find(item => {
          const currentName = (item.device_name || '').trim().toLowerCase();
          return Boolean(normalizedTargetName && currentName === normalizedTargetName);
        }) ||
        validPrinterDevices.find(item => {
          const currentName = (item.device_name || '').trim().toLowerCase();
          return Boolean(
            normalizedTargetName &&
            currentName &&
            (currentName.includes(normalizedTargetName) ||
              normalizedTargetName.includes(currentName)),
          );
        });



      await BLEPrinter.connectPrinter(connectAddress);
      connectedPrinterMacRef.current = connectAddress;
      setSelectedBluetoothPrinterMac(connectAddress);
      setPairedBluetoothDevices(currentDevices => {
        const alreadyExists = currentDevices.some(
          currentDevice =>
            currentDevice.inner_mac_address === connectAddress,
        );
        if (alreadyExists) {
          return currentDevices;
        }
        return [
          ...currentDevices,
          {
            device_name:
              resolvedPrinterDevice?.device_name || device.device_name || 'Printer',
            inner_mac_address: connectAddress,
          },
        ];
      });
      setBluetoothStatusMessage(
        `Connected device: ${resolvedPrinterDevice?.device_name || device.device_name || connectAddress}`,
      );
      setCheckoutFeedback({
        message: `Connected to ${resolvedPrinterDevice?.device_name || device.device_name || connectAddress}.`,
        tone: 'success',
      });
    } catch (error) {
      connectedPrinterMacRef.current = null;
      activeBleDeviceRef.current = null;
      const errorMessage = String((error as any)?.message || error);

      // Fallback: Try connecting via BLE GATT (for non-standard printers)
      if (bleManagerRef.current) {
        try {
          const bleDevice = await bleManagerRef.current.connectToDevice(connectAddress);
          await bleDevice.discoverAllServicesAndCharacteristics();
          activeBleDeviceRef.current = bleDevice;
          connectedPrinterMacRef.current = connectAddress;
          setSelectedBluetoothPrinterMac(connectAddress);

          // LX Handshake detection
          const isLX = (device.device_name || '').toUpperCase().startsWith('LX');
          if (isLX) {
            console.log('LX Printer detected. Starting handshake...');
            bleDevice.monitorCharacteristicForService('ffe6', 'ffe2', (error: any, char: any) => {
              if (error) return;
              if (char?.value) handleLXAuth(bleDevice, base64ToBytes(char.value));
            });
            setTimeout(async () => {
              try {
                await bleDevice.writeCharacteristicWithoutResponseForService('ffe6', 'ffe1', bytesToBase64(new Uint8Array([0x5a, 0x01])));
              } catch (e) { console.log('Auth start failed', e); }
            }, 1000);
          }

          setPairedBluetoothDevices(currentDevices => {
            const alreadyExists = currentDevices.some(
              d => d.inner_mac_address === connectAddress,
            );
            if (alreadyExists) return currentDevices;
            return [
              ...currentDevices,
              {
                device_name: device.device_name || 'BLE Printer',
                inner_mac_address: connectAddress,
              },
            ];
          });

          setCheckoutFeedback({
            message: `Connected to ${device.device_name || connectAddress}.`,
            tone: 'success',
          });
          return;
        } catch (bleError) {
          console.log('BLE Fallback failed:', bleError);
        }
      }

      Alert.alert('Connection Failed', `Unable to connect: ${errorMessage}`);
      setCheckoutFeedback({
        message: `Unable to connect device: ${errorMessage}`,
        tone: 'error',
      });
    } finally {
      setIsBluetoothLoading(false);
      setConnectingDeviceMac(null);
    }
  };

  const disconnectBluetoothDevice = async () => {
    setIsBluetoothLoading(true);
    try {
      const blePrinterApi = BLEPrinter as unknown as {
        disconnectPrinter?: (mac?: string) => Promise<void>;
        closeConn?: () => Promise<void>;
        closePrinterConn?: () => Promise<void>;
      };

      if (typeof blePrinterApi.disconnectPrinter === 'function') {
        await blePrinterApi.disconnectPrinter(connectedPrinterMacRef.current || undefined);
      } else if (typeof blePrinterApi.closeConn === 'function') {
        await blePrinterApi.closeConn();
      } else if (typeof blePrinterApi.closePrinterConn === 'function') {
        await blePrinterApi.closePrinterConn();
      }

      connectedPrinterMacRef.current = null;
      setBluetoothStatusMessage('Printer disconnected.');
      setCheckoutFeedback({
        message: 'Printer disconnected.',
        tone: 'info',
      });
    } catch (error) {
      setCheckoutFeedback({
        message: `Unable to disconnect device: ${String((error as any)?.message || error)}`,
        tone: 'error',
      });
    } finally {
      setIsBluetoothLoading(false);
    }
  };

  const removeBluetoothDevice = (device: BluetoothPrinterDevice) => {
    Alert.alert(
      'Remove device',
      `Remove ${device.device_name || device.inner_mac_address} from app device list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const removedConnectedDevice =
              connectedPrinterMacRef.current === device.inner_mac_address;
            if (removedConnectedDevice) {
              await disconnectBluetoothDevice();
            }

            setPairedBluetoothDevices(currentDevices =>
              currentDevices.filter(
                currentDevice =>
                  currentDevice.inner_mac_address !== device.inner_mac_address,
              ),
            );

            if (selectedBluetoothPrinterMac === device.inner_mac_address) {
              setSelectedBluetoothPrinterMac(null);
            }

            setBluetoothStatusMessage(
              `${device.device_name || device.inner_mac_address} removed from app list.`,
            );
          },
        },
      ],
    );
  };

  useEffect(() => {
    // Load initial status silently to avoid "infinite loading" UX on app open.
    loadBluetoothDevices().catch(() => {
      // Errors are already surfaced inside loadBluetoothDevices.
    });

    return () => {
      bleManagerRef.current?.destroy();
      bleManagerRef.current = null;
    };
  }, []);

  const runPrinterTest = async (device: BluetoothPrinterDevice) => {
    setIsBluetoothLoading(true);
    setCheckoutFeedback({ message: `Starting test for ${device.device_name || device.inner_mac_address}...`, tone: 'info' });

    try {
      const mac = device.inner_mac_address;
      let bleDevice = activeBleDeviceRef.current;

      // 1. Connection attempt
      if (connectedPrinterMacRef.current !== mac || !bleDevice) {
        try {
          await BLEPrinter.connectPrinter(mac);
          connectedPrinterMacRef.current = mac;
          activeBleDeviceRef.current = null;
        } catch (err) {
          if (bleManagerRef.current) {
            bleDevice = await bleManagerRef.current.connectToDevice(mac);
            await bleDevice.discoverAllServicesAndCharacteristics();
            activeBleDeviceRef.current = bleDevice;
            connectedPrinterMacRef.current = mac;

            // Trigger Auth if LX
            if ((device.device_name || '').toUpperCase().startsWith('LX')) {
              bleDevice.monitorCharacteristicForService('ffe6', 'ffe2', (error: any, char: any) => {
                if (!error && char?.value) handleLXAuth(bleDevice, base64ToBytes(char.value));
              });
              await new Promise<void>(r => setTimeout(() => r(), 1000));
              await bleDevice.writeCharacteristicWithoutResponseForService('ffe6', 'ffe1', bytesToBase64(new Uint8Array([0x5a, 0x01])));
              // Wait for auth to complete
              await new Promise<void>(r => setTimeout(() => r(), 2000));
            }
          } else {
            throw err;
          }
        }
      }

      // 2. Printing attempt
      if (activeBleDeviceRef.current && (device.device_name || '').toUpperCase().startsWith('LX')) {
        console.log("Running Proprietary LX Print Test...");
        const serviceUuid = "ffe6";
        const sendCharUuid = "ffe1";

        // Start Command
        await activeBleDeviceRef.current.writeCharacteristicWithoutResponseForService(serviceUuid, sendCharUuid, bytesToBase64(new Uint8Array([0x5a, 0x04, 0x00, 0x02, 0x00, 0x00])));
        await new Promise<void>(r => setTimeout(() => r(), 100));

        // Solid Black Line
        const line = new Uint8Array(100);
        line[0] = 0x55;
        for (let i = 3; i < 99; i++) line[i] = 0xFF;
        await activeBleDeviceRef.current.writeCharacteristicWithoutResponseForService(serviceUuid, sendCharUuid, bytesToBase64(line));
        await new Promise<void>(r => setTimeout(() => r(), 100));

        // End Command
        const endLine = new Uint8Array(100);
        endLine[0] = 0x55; endLine[2] = 0x01;
        await activeBleDeviceRef.current.writeCharacteristicWithoutResponseForService(serviceUuid, sendCharUuid, bytesToBase64(endLine));

        setCheckoutFeedback({ message: 'Proprietary LX test sent.', tone: 'success' });
      } else if (activeBleDeviceRef.current) {
        // ... existing generic BLE test code ...
        const deviceObj = activeBleDeviceRef.current;
        const services = await deviceObj.services();
        const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(() => resolve(), ms));
        await sleep(500);

        const wakeUpBase64 = "AA==";
        const testTextBase64 = "VEVTVAoK";

        let testSent = false;
        for (const service of services) {
          const chars = await service.characteristics();
          for (const char of chars) {
            if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
              try {
                const writeToCharacteristic = async (valueBase64: string) => {
                  if (char.isWritableWithoutResponse) await deviceObj.writeCharacteristicWithoutResponseForService(service.uuid, char.uuid, valueBase64);
                  else await deviceObj.writeCharacteristicWithResponseForService(service.uuid, char.uuid, valueBase64);
                };
                await writeToCharacteristic(wakeUpBase64);
                await sleep(200);
                await writeToCharacteristic("G0A=");
                await sleep(150);
                await writeToCharacteristic(testTextBase64);
                await sleep(150);
                await writeToCharacteristic("CgoKCg==");
                testSent = true;
                break;
              } catch (e) { }
            }
          }
          if (testSent) break;
        }
        if (!testSent) throw new Error('No writable BLE characteristic accepted test data.');
        setCheckoutFeedback({ message: 'Generic test command sent.', tone: 'success' });
      } else {
        await BLEPrinter.printBill("TEST PRINT FROM APP\nSUCCESS\n\n\n\n");
        setCheckoutFeedback({ message: 'Test command sent via standard driver.', tone: 'success' });
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      setCheckoutFeedback({ message: `Test Failed: ${msg}`, tone: 'error' });
    } finally {
      setIsBluetoothLoading(false);
    }
  };

  const bluetoothPrintReceipt = async (
    billData?: any,
    selectedDevice?: BluetoothPrinterDevice,
  ) => {
    try {
      const bill = billData || latestStoredBill;
      if (!bill) return false;

      const billUrl = bill.url || bill.bill_link;
      if (!billUrl) return false;

      let targetDevice = selectedDevice;
      if (!targetDevice) {
        // First check paired devices in state to avoid slow scanning
        targetDevice = pairedBluetoothDevices.find(d => d.inner_mac_address === selectedBluetoothPrinterMac) ||
          pairedBluetoothDevices.find(d => (d.device_name || '').toUpperCase().startsWith('LX'));

        // Only scan if absolutely necessary
        if (!targetDevice) {
          const devices = await loadBluetoothDevices();
          if (devices && devices.length > 0) {
            targetDevice = devices.find(d => d.inner_mac_address === selectedBluetoothPrinterMac) || devices[0];
          }
        }
      }
      if (!targetDevice) return false;
      const mac = targetDevice.inner_mac_address;

      const isLX = (targetDevice.device_name || '').toUpperCase().startsWith('LX');

      if (!isLX) {
        // --- PROFESSIONAL ZEBRA SDK PATH (Default for all non-LX printers) ---
        setCheckoutFeedback({ message: 'Printing via Zebra SDK...', tone: 'info' });
        try {
          const result = await pdfService.printPdfToZebra({
            macAddress: mac,
            url: billUrl,
            token: session.token
          });
          if (result.ok) {
            setCheckoutFeedback({ message: 'Print successful!', tone: 'success' });
            return true;
          } else {
            throw new Error(result.message);
          }
        } catch (error: any) {
          throw new Error(`Zebra SDK Print Failed: ${error.message}`);
        }
      } else {
        // --- LEGACY LX PRINTER PATH ---
        // Ensure connection first
        if (connectedPrinterMacRef.current !== mac || !activeBleDeviceRef.current) {
          if (bleManagerRef.current) {
            const bleDevice = await bleManagerRef.current.connectToDevice(mac);
            await bleDevice.discoverAllServicesAndCharacteristics();
            activeBleDeviceRef.current = bleDevice;
            connectedPrinterMacRef.current = mac;
          }
        }

        setCheckoutFeedback({ message: 'Rendering PDF...', tone: 'info' });
        const renderResult = await pdfService.renderPdfForLXPrinter({
          url: bill.url,
          token: session.token,
          fileName: bill.file_name
        });

        if (!renderResult.ok || !renderResult.data) {
          throw new Error(renderResult.message || 'Failed to render PDF');
        }

        const { base64Data, totalLines } = renderResult.data;
        const rawData = base64ToBytes(base64Data);
        const deviceObj = activeBleDeviceRef.current;
        const serviceUuid = "ffe6";
        const sendCharUuid = "ffe1";

        if (!deviceObj) throw new Error("Printer not connected");

        setCheckoutFeedback({ message: `Printing ${totalLines} lines...`, tone: 'info' });

        // 1. Start Print Command
        const startCmd = new Uint8Array([0x5a, 0x04, (totalLines + 1) >> 8, (totalLines + 1) & 0xff, 0x00, 0x00]);
        await deviceObj.writeCharacteristicWithoutResponseForService(serviceUuid, sendCharUuid, bytesToBase64(startCmd));
        await new Promise<void>(r => setTimeout(() => r(), 150));

        // 2. Send Line Data
        for (let i = 0; i < totalLines; i++) {
          const line = new Uint8Array(100);
          line[0] = 0x55;
          line[1] = i >> 8;
          line[2] = i & 0xff;
          line.set(rawData.slice(i * 96, (i + 1) * 96), 3);

          await deviceObj.writeCharacteristicWithoutResponseForService(serviceUuid, sendCharUuid, bytesToBase64(line));
          if (i % 20 === 0) await new Promise<void>(r => setTimeout(() => r(), 25));
        }

        // 3. End Print Command
        const endLine = new Uint8Array(100);
        endLine[0] = 0x55;
        endLine[1] = totalLines >> 8;
        endLine[2] = totalLines & 0xff;
        await deviceObj.writeCharacteristicWithoutResponseForService(serviceUuid, sendCharUuid, bytesToBase64(endLine));

        setCheckoutFeedback({ message: 'Print complete!', tone: 'success' });
        return true;
      }

      return true;
    } catch (error: any) {
      console.log('Print Error:', error?.message || error);
      connectedPrinterMacRef.current = null;
      setCheckoutFeedback({ message: `Print Error: ${error?.message || error}`, tone: 'error' });
      return false;
    }
  };


  const fetchPdfAsBase64 = async (url: string) => {
    setIsPdfLoading(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();

      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          // Remove the data:application/pdf;base64, prefix
          resolve(base64String.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Failed to fetch PDF:', error);
      return null;
    } finally {
      setIsPdfLoading(false);
    }
  };

  const openStoredReceipt = async () => {
    if (!latestStoredBill) return;

    // Fallback to visual preview
    const base64 = await fetchPdfAsBase64(latestStoredBill.url);
    if (base64) {
      setPdfBase64(base64);
      setIsBillModalVisible(true);
    } else {
      setCheckoutFeedback({
        message: 'Unable to load the receipt preview.',
        tone: 'error'
      });
    }
  };

  const manualPrintReceipt = async () => {
    if (!latestStoredBill) return;
    setCheckoutFeedback(null); // Clear previous errors
    setReceiptActionState('loading');
    let devices = pairedBluetoothDevices;
    if (!devices || devices.length === 0) {
      devices = (await loadBluetoothDevices()) || [];
    }

    if (devices && devices.length > 1) {
      setPendingPrintBill(latestStoredBill);
      setIsPrinterPickerVisible(true);
      setReceiptActionState('idle');
      return;
    }

    const target = devices.length === 1 ? devices[0] : undefined;
    const success = await bluetoothPrintReceipt(latestStoredBill, target);
    setReceiptActionState('idle');
    if (success) {
      setCheckoutFeedback({
        message: 'Receipt sent to printer.',
        tone: 'success',
      });
    }
  };

  const handleGenerateChecklist = async () => {
    if (latestStoredBill) {
      // If order already exists, just get the checklist PDF
      setReceiptActionState('loading');
      try {
        const orderId = (latestStoredBill as any).id || (latestStoredBill as any).order_id;
        const response = await orderService.getOrderChecklist(
          session.token,
          orderId,
          customerSignature,
          driverSignature,
          new Date().toISOString()
        );
        if (response.ok && response.data) {
          const base64 = await fetchPdfAsBase64(response.data.url);
          if (base64) {
            setPdfBase64(base64);
            setIsBillModalVisible(true);
          }
        }
      } catch (e) {
        setCheckoutFeedback({ message: 'Error loading checklist', tone: 'error' });
      } finally {
        setReceiptActionState('idle');
      }
    } else {
      // If no order exists, create one with checklist flag
      await handleGenerateBill(true);
    }
  };

  const printWithSelectedDevice = async (device: BluetoothPrinterDevice) => {
    setIsPrinterPickerVisible(false);
    if (!pendingPrintBill) {
      return;
    }

    setReceiptActionState('loading');
    const success = await bluetoothPrintReceipt(pendingPrintBill, device);
    setReceiptActionState('idle');
    setPendingPrintBill(null);

    if (success) {
      setCheckoutFeedback({
        message: `Receipt sent to ${device.device_name || device.inner_mac_address}.`,
        tone: 'success',
      });
    }
  };

  const printCurrentBill = async (url?: string) => {
    const filePath = url || latestStoredBill?.url;
    if (!filePath) return;
    try {
      await RNPrint.print({ filePath });
    } catch (error) {
      console.error('Print failed:', error);
    }
  };


  const handleGenerateBill = async (isChecklistRequest = false) => {
    setCheckoutFeedback(null); // Clear previous errors
    const generateBillDisabled =
      checkoutState === 'loading' ||
      receiptActionState === 'loading' ||
      !selectedCustomer ||
      !selectedProducts.length ||
      totalPayable < 0;

    if (generateBillDisabled) {
      return;
    }

    if (isChecklistRequest) {
      setReceiptActionState('loading');
    } else {
      setCheckoutState('loading');
    }
    setCheckoutFeedback(null);
    setLatestStoredBill(null);

    const payload: CreateOrderRequest = {
      customerId: selectedCustomer.id,
      items: selectedProducts.map(product => {
        const quantity = selectedQuantities[product.id] || 0;
        return {
          itemId: product.id,
          quantity,
          subtotal: quantity * product.unitPrice,
          unitPrice: product.unitPrice,
          unitDeposit: 0,
          unitDiscount: 0,
        };
      }),
      loadNumber: 'POS',
      notes: `POS Sale to ${selectedCustomer.name}`,
      totalAmount: totalPayable,
      totalCredits: creditMemoAmount,
      totalDeposit: containerDepositAmount,
      customerSignature: customerSignature,
      driverSignature: driverSignature,
      paymentType: paymentType,
      checkNumber: paymentType === 'Check' ? checkNumber : null,
      isChecklist: isChecklistRequest,
      clientTimestamp: new Date().toISOString()
    };

    console.log('📦 GENERATING BILL PAYLOAD:', JSON.stringify(payload, null, 2));

    const orderResponse = await orderService.createOrder(session.token, payload);

    if (!orderResponse.ok || !orderResponse.data) {
      setCheckoutState('idle');
      setCheckoutFeedback({
        message: orderResponse.message ?? 'Unable to create the order.',
        tone: 'error',
      });
      return;
    }

    let storedBill = orderResponse.data.bill ?? null;
    let billIssueMessage = orderResponse.data.billGenerationError ?? null;

    if (!storedBill) {
      const billResponse = await orderService.getOrderBill(
        session.token,
        orderResponse.data.order.id,
      );

      if (billResponse.ok && billResponse.data) {
        storedBill = billResponse.data;
        billIssueMessage = null;
      } else if (billResponse.message) {
        billIssueMessage = billResponse.message;
      }
    }

    setCheckoutState('idle');
    setReceiptActionState('idle');

    if (!isChecklistRequest) {
      setSelectedQuantities({});
      setCreditMemoInput('0');
      setContainerDepositInput('0');
      setIsSummaryVisible(false);
    }

    const billData = storedBill ? {
      ...storedBill,
      id: orderResponse.data.order.id, // INCLUDE ID
      bill_link: storedBill.url,
      order_number: orderResponse.data.order.order_number,
      customer_name: selectedCustomer.name,
      generated_at: new Date().toISOString()
    } : null;

    setLatestStoredBill(billData);

    if (!storedBill) {
      setCheckoutFeedback({
        message: `Order ${orderResponse.data.order.order_number
          } saved, but the stored receipt is not ready yet. ${billIssueMessage ?? ''
          }`.trim(),
        tone: 'info',
      });
      return;
    }

    setCheckoutFeedback({
      message: `Order ${orderResponse.data.order.order_number} saved.`,
      tone: 'success',
    });

    // AUTO-OPEN PREVIEW
    let displayPdfUrl = storedBill.url;
    if (isChecklistRequest) {
      const checklistResponse = await orderService.getOrderChecklist(
        session.token,
        orderResponse.data.order.id,
        customerSignature,
        driverSignature
      );
      if (checklistResponse.ok && checklistResponse.data) {
        displayPdfUrl = checklistResponse.data.url;
      }
    }

    const base64 = await fetchPdfAsBase64(displayPdfUrl);
    if (base64) {
      setPdfBase64(base64);
      setIsBillModalVisible(true);
    }

    // BACKGROUND PRINT (Silent if single device, Picker if multiple)
    let devices = pairedBluetoothDevices;
    if (!devices || devices.length === 0) {
      devices = (await loadBluetoothDevices()) || [];
    }

    if (devices && devices.length > 1) {
      setPendingPrintBill(billData);
      setIsPrinterPickerVisible(true);
    } else {
      bluetoothPrintReceipt(storedBill, devices?.[0]);
    }
  };

  const renderHome = () => (
    <View style={[styles.heroCard, sectionWidthStyle]}>
      <Text style={styles.eyebrow}>
        WELCOME {session.user.name.toUpperCase()}
      </Text>
      <Text style={[styles.title, titleSizeStyle]}>Sales Workspace</Text>
      <Text style={styles.subtitle}>
        Signed in as {session.user.role}. Start a new route order from the
        center action below.
      </Text>

      <Pressable onPress={openPlaceOrders} style={styles.placeOrdersButton}>
        <View style={styles.placeOrdersIcon}>
          <View style={styles.plusHorizontal} />
          <View style={styles.plusVertical} />
        </View>
        <Text style={styles.placeOrdersLabel}>PLACE ORDERS</Text>
        <Text style={styles.placeOrdersCaption}>
          Load customers and begin a new sale
        </Text>
      </Pressable>
    </View>
  );

  const toggleOrderExpansion = (id: number) => {
    setExpandedOrders(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const openOrderBill = async (orderId: number) => {
    setReceiptActionState('loading');
    const response = await orderService.getOrderBill(session.token, orderId);
    setReceiptActionState('idle');
    if (response.ok && response.data) {
      const base64 = await fetchPdfAsBase64(response.data.url);
      if (base64) {
        setPdfBase64(base64);
        setIsBillModalVisible(true);
      }
    }
  };

  const renderHistory = () => (
    <>
      <View style={[styles.topBackRow, sectionWidthStyle]}>
        <Pressable
          onPress={() => setView('products')}
          style={styles.backButton}>
          <Image source={backIcon} style={styles.backButtonIcon} />
        </Pressable>
      </View>

      <View style={[styles.sectionCard, sectionWidthStyle]}>
        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>TRACKING</Text>
            <Text style={styles.sectionTitle}>Order History</Text>
          </View>

          <View style={styles.yearSelector}>
            <Pressable
              onPress={() => {
                const newYear = historyYear - 1;
                setHistoryYear(newYear);
                loadOrderHistory(historyMonth, newYear);
              }}
              style={styles.yearArrow}
            >
              <Text style={styles.yearArrowText}>{"<"}</Text>
            </Pressable>
            <Text style={styles.yearText}>{historyYear}</Text>
            <Pressable
              onPress={() => {
                const newYear = historyYear + 1;
                setHistoryYear(newYear);
                loadOrderHistory(historyMonth, newYear);
              }}
              style={styles.yearArrow}
            >
              <Text style={styles.yearArrowText}>{">"}</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.monthStrip}
          contentContainerStyle={styles.monthStripContent}
        >
          {MONTHS.map((month: string, index: number) => {
            const m = index + 1;
            const isSelected = historyMonth === m;
            return (
              <Pressable
                key={month}
                onPress={() => {
                  setHistoryMonth(m);
                  loadOrderHistory(m, historyYear);
                }}
                style={[
                  styles.monthPill,
                  isSelected && styles.monthPillActive
                ]}
              >
                <Text style={[
                  styles.monthPillLabel,
                  isSelected && styles.monthPillLabelActive
                ]}>
                  {month}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {historyStatus === 'loading' ? (
          <ActivityIndicator size="large" color={palette.primaryStrong} style={{ marginVertical: 40 }} />
        ) : orderHistory.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Text style={styles.emptyHistoryText}>No orders found for {MONTHS[historyMonth - 1]} {historyYear}.</Text>
          </View>
        ) : (
          <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
            {orderHistory.map((order) => {
              const isExpanded = expandedOrders[order.id];
              return (
                <View key={order.id} style={styles.historyCard}>
                  <Pressable
                    onPress={() => toggleOrderExpansion(order.id)}
                    style={styles.historyCardHeader}
                  >
                    <View style={styles.historyCardInfo}>
                      <View style={styles.historyCardDateRow}>
                        <Text style={styles.historyCardDate}>
                          {new Date(order.client_timestamp || order.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </Text>
                        {/* <View style={styles.historyStatusBadge}>
                          <Text style={styles.historyStatusText}>{order.status.toUpperCase()}</Text>
                        </View> */}
                      </View>
                      <Text style={styles.historyCardInvoice}>{order.order_number}</Text>
                      <Text style={styles.historyCardCustomer} numberOfLines={1}>{order.customer_name}</Text>
                    </View>

                    <View style={styles.historyCardRight}>
                      <Text style={styles.historyCardAmount}>${parseFloat(order.total_amount).toFixed(2)}</Text>
                      <View style={[styles.historyExpandBtn, isExpanded && styles.historyExpandBtnActive]}>
                        <Text style={[styles.historyExpandIcon, isExpanded && styles.historyExpandIconActive]}>
                          {isExpanded ? '▲' : '▼'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  {isExpanded && (
                    <View style={styles.historyCardDetails}>
                      <View style={styles.historyItemsHeader}>
                        <Text style={[styles.historyItemsHeaderText, { flex: 2 }]}>PRODUCT</Text>
                        <Text style={[styles.historyItemsHeaderText, { flex: 0.5, textAlign: 'center' }]}>QTY</Text>
                        <Text style={[styles.historyItemsHeaderText, { flex: 1, textAlign: 'right' }]}>SUBTOTAL</Text>
                      </View>
                      {order.items?.map((item: any, idx: number) => (
                        <View key={`${order.id}-item-${idx}`} style={styles.historyItemRow}>
                          <View style={{ flex: 2 }}>
                            <Text style={styles.historyItemName} numberOfLines={1}>{item.item_name}</Text>
                            <Text style={styles.historyItemSku}>{item.item_number || 'N/A'}</Text>
                          </View>
                          <Text style={styles.historyItemQty}>{item.quantity}</Text>
                          <Text style={styles.historyItemPrice}>${parseFloat(item.subtotal).toFixed(2)}</Text>
                        </View>
                      ))}
                      <View style={styles.historyCardFooter}>
                        <View style={styles.historyFooterRow}>
                          <Text style={styles.historyFooterLabel}>Subtotal</Text>
                          <Text style={styles.historyFooterValue}>${parseFloat(order.total_amount).toFixed(2)}</Text>
                        </View>
                        {parseFloat(order.total_deposit || '0') > 0 && (
                          <View style={styles.historyFooterRow}>
                            <Text style={styles.historyFooterLabel}>Deposit</Text>
                            <Text style={styles.historyFooterValue}>+${parseFloat(order.total_deposit).toFixed(2)}</Text>
                          </View>
                        )}
                        {parseFloat(order.total_credits || '0') > 0 && (
                          <View style={styles.historyFooterRow}>
                            <Text style={styles.historyFooterLabel}>Credits</Text>
                            <Text style={styles.historyFooterValue}>-${parseFloat(order.total_credits).toFixed(2)}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </>
  );

  const renderSettings = () => (
    <>
      <View style={[styles.topBackRow, sectionWidthStyle]}>
        <Pressable onPress={() => setView('home')} style={styles.backButton}>
          <Image source={backIcon} style={styles.backButtonIcon} />
        </Pressable>
      </View>

      <View style={[styles.sectionCard, sectionWidthStyle]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionEyebrow}>SETTINGS</Text>
            <Text style={styles.sectionTitle}>Printer Devices</Text>
            <Text style={styles.sectionSubtitle}>
              Add and manage printer devices for receipt printing.
            </Text>
          </View>
        </View>

        {!pairedBluetoothDevices.length ? (
          <Pressable
            onPress={openAddDeviceModal}
            disabled={isAddDeviceOpening}
            style={({ pressed }) => [
              styles.settingsActionButton,
              isAddDeviceOpening ? styles.settingsActionButtonDisabled : null,
              pressed ? styles.settingsActionButtonPressed : null,
            ]}>
            {isAddDeviceOpening ? (
              <ActivityIndicator size="small" color={palette.white} />
            ) : (
              <Text style={styles.settingsActionButtonLabel}>Add Device</Text>
            )}
          </Pressable>
        ) : null}

        {checkoutFeedback ? (
          <InlineMessage
            style={{ marginTop: 10 }}
            message={checkoutFeedback.message}
            tone={checkoutFeedback.tone}
          />
        ) : null}

        <View style={styles.settingsDevicesCard}>
          <View style={styles.settingsAddedHeaderRow}>
            <Text style={styles.settingsStatusLabel}>Added devices</Text>
            {pairedBluetoothDevices.length ? (
              <Pressable
                onPress={openAddDeviceModal}
                disabled={isAddDeviceOpening}
                style={({ pressed }) => [
                  styles.settingsDeviceActionButton,
                  isAddDeviceOpening ? styles.settingsActionButtonDisabled : null,
                  pressed ? styles.settingsActionButtonPressed : null,
                ]}>
                {isAddDeviceOpening ? (
                  <ActivityIndicator size="small" color={palette.white} />
                ) : (
                  <Text style={styles.settingsDeviceActionLabel}>Add Device</Text>
                )}
              </Pressable>
            ) : null}
          </View>

          {pairedBluetoothDevices.length ? (
            pairedBluetoothDevices.map(device => {
              const isConnected =
                connectedPrinterMacRef.current === device.inner_mac_address;

              return (
                <View key={device.inner_mac_address} style={styles.settingsDeviceRow}>
                  <View style={styles.settingsDeviceTextWrap}>
                    <Text style={styles.settingsDeviceName}>
                      {device.device_name || 'Unnamed printer'}
                    </Text>
                    <Text style={styles.settingsDeviceMeta}>
                      {device.inner_mac_address}
                      {isConnected ? ' - Connected' : ''}
                    </Text>
                  </View>
                  <View style={styles.settingsDeviceActions}>
                    <Pressable
                      onPress={() => runPrinterTest(device)}
                      style={({ pressed }) => [
                        styles.settingsDeviceActionButton,
                        pressed ? styles.settingsActionButtonPressed : null,
                      ]}>
                      <Text style={styles.settingsDeviceActionLabel}>Test</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.settingsStatusValue}>
              No added devices. Tap Add Device to scan and connect.
            </Text>
          )}
        </View>
      </View>
    </>
  );

  const renderCustomers = () => (
    <>
      <View style={[styles.topBackRow, sectionWidthStyle]}>
        <Pressable onPress={() => setView('home')} style={styles.backButton}>
          <Image source={backIcon} style={styles.backButtonIcon} />
        </Pressable>
      </View>

      <View style={[styles.sectionCard, sectionWidthStyle]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionEyebrow}>STEP 1</Text>
            <Text style={styles.sectionTitle}>Select Customer</Text>
            <Text style={styles.sectionSubtitle}>
              Choose the customer for this order. We will open only the products
              available in your personal stock.
            </Text>
          </View>
        </View>

        {locationStatus === 'loading' ? (
          <InlineMessage
            message="Finding your current location so customers can be sorted from nearest to farthest."
            tone="info"
          />
        ) : null}

        {locationStatus === 'ready' && currentLocation ? (
          <View style={styles.locationCard}>
            <View style={styles.locationCardText}>
              <Text style={styles.locationCardTitle}>
                Current location ready
              </Text>
              <Text style={styles.locationCardBody}>
                {formatCoordinate(currentLocation.latitude)},{' '}
                {formatCoordinate(currentLocation.longitude)}. Customers are
                sorted nearest to farthest.
              </Text>
            </View>
            <Pressable
              onPress={loadCurrentLocation}
              style={({ pressed }) => [
                styles.locationActionButton,
                pressed ? styles.locationActionButtonPressed : null,
              ]}>
              <Text style={styles.locationActionButtonLabel}>Refresh</Text>
            </Pressable>
          </View>
        ) : null}

        {locationStatus !== 'idle' &&
          locationStatus !== 'loading' &&
          locationStatus !== 'ready' ? (
          <View style={styles.locationCard}>
            <View style={styles.locationCardText}>
              <Text style={styles.locationCardTitle}>Location unavailable</Text>
              <Text style={styles.locationCardBody}>
                {locationError ??
                  'Showing customers without distance sorting until location is available.'}
              </Text>
            </View>
            <Pressable
              onPress={loadCurrentLocation}
              style={({ pressed }) => [
                styles.locationActionButton,
                pressed ? styles.locationActionButtonPressed : null,
              ]}>
              <Text style={styles.locationActionButtonLabel}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {customersError ? (
          <InlineMessage message={customersError} tone="error" />
        ) : null}

        {customersStatus === 'loading' || customersStatus === 'idle' ? (
          <StatePanel
            message="Fetching the latest customer accounts from the backend."
            mode="loading"
            title="Loading customers"
          />
        ) : null}

        {customersStatus === 'error' ? (
          <StatePanel
            actionLabel="Retry"
            message="We could not load the customer list right now."
            mode="error"
            onAction={loadCustomers}
            title="Customer request failed"
          />
        ) : null}

        {customersStatus === 'empty' ? (
          <StatePanel
            actionLabel="Refresh"
            message="The API returned an empty customer list."
            mode="empty"
            onAction={loadCustomers}
            title="No customers found"
          />
        ) : null}

        {customersStatus === 'ready' ? (
          <View style={styles.cardStack}>
            {sortedCustomers.map(({ customer, distanceFromDevice }) => {
              const distanceSignal =
                distanceFromDevice !== null
                  ? getDistanceSignal(distanceFromDevice)
                  : null;
              const isNearestCustomer =
                nearestCustomerId !== null && customer.id === nearestCustomerId;

              return (
                <Pressable
                  key={customer.id}
                  onPress={() => selectCustomer(customer)}
                  style={({ pressed }) => [
                    styles.customerCard,
                    pressed ? styles.customerCardPressed : null,
                  ]}>
                  <View style={styles.customerCardHeader}>
                    <View style={styles.customerIdentity}>
                      <View style={styles.customerAvatar}>
                        <Text style={styles.customerAvatarLabel}>
                          {getInitials(customer.name)}
                        </Text>
                      </View>
                      <View style={styles.customerIdentityText}>
                        <Text style={styles.customerMiniLabel}>Customer</Text>
                        <Text style={styles.customerAccountText}>
                          {customer.account_id || 'No account id'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.customerHeaderBadges}>
                      {locationStatus === 'ready' && distanceSignal ? (
                        <View
                          accessibilityLabel={`${distanceSignal.label} distance`}
                          style={[
                            styles.distanceLightBadge,
                            {
                              backgroundColor: distanceSignal.glowColor,
                              borderColor: distanceSignal.lightColor,
                            },
                          ]}>
                          <View
                            style={[
                              styles.distanceLight,
                              {
                                backgroundColor: distanceSignal.lightColor,
                                shadowColor: distanceSignal.lightColor,
                              },
                            ]}
                          />
                        </View>
                      ) : null}

                      <View style={styles.paymentPill}>
                        <Text style={styles.paymentPillLabel}>
                          {customer.payment_type || 'Payment'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text numberOfLines={2} style={styles.customerName}>
                    {normalizeText(customer.name)}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.customerCompany,
                      isNearestCustomer ? styles.customerCompanyNearest : null,
                    ]}>
                    {normalizeText(
                      customer.registered_company_name || customer.name,
                    )}
                  </Text>

                  {isNearestCustomer ? (
                    <View style={styles.nearestCustomerBadge}>
                      <Text style={styles.nearestCustomerBadgeLabel}>
                        Most Near By
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.customerMetaGroup}>
                    <View style={styles.customerMetaRow}>
                      <Text style={styles.customerMetaIcon}>Phone</Text>
                      <Text style={styles.customerMetaValue}>
                        {customer.phone || 'No phone'}
                      </Text>
                    </View>
                    {locationStatus === 'ready' ? (
                      <View style={styles.customerMetaRow}>
                        <Text style={styles.customerMetaIcon}>Distance</Text>
                        <Text style={styles.customerMetaValue}>
                          {distanceFromDevice !== null
                            ? `${formatDistanceKilometers(distanceFromDevice)}${distanceSignal
                              ? ` | ${distanceSignal.label}`
                              : ''
                            }`
                            : 'No customer coordinates'}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.customerMetaRow}>
                      <Text style={styles.customerMetaIcon}>Address</Text>
                      <Text numberOfLines={3} style={styles.customerMetaValue}>
                        {getCustomerAddress(customer.address)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.customerFooter}>
                    <View style={styles.accountPill}>
                      <Text style={styles.accountPillLabel}>
                        Account {customer.account_id || 'N/A'}
                      </Text>
                    </View>
                    <Text style={styles.customerActionLabel}>
                      View Products
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </>
  );

  const renderProducts = () => (
    <>
      <View style={[styles.topBackRow, sectionWidthStyle]}>
        <Pressable
          onPress={() => setView('customers')}
          style={styles.backButton}>
          <Image source={backIcon} style={styles.backButtonIcon} />
        </Pressable>
      </View>

      <View style={[styles.sectionCard, sectionWidthStyle]}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionEyebrow}>STEP 2</Text>
            <Text style={styles.sectionTitle}>Select Products</Text>
            <Text style={styles.sectionSubtitle}>
              Add products for {selectedCustomer?.name ?? 'your customer'}. The
              order summary stays hidden until you open it.
            </Text>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          <Pressable
            onPress={() => {
              setView('history');
              loadOrderHistory();
            }}
            style={styles.historyPill}
          >
            <Text style={styles.historyPillLabel}>Order History</Text>
          </Pressable>
          <View style={styles.inventoryPill}>
            <Text style={styles.inventoryPillLabel}>
              Personal inventory only
            </Text>
          </View>
        </View>

        {selectedCustomer ? (
          <View style={styles.selectedCustomerPanel}>
            <Pressable
              onPress={() => setIsCustomerDetailsExpanded(current => !current)}
              style={({ pressed }) => [
                styles.selectedCustomerToggle,
                pressed ? styles.selectedCustomerTogglePressed : null,
              ]}>
              <Text
                numberOfLines={1}
                style={styles.selectedCustomerCompactName}>
                {normalizeText(selectedCustomer.name)}
              </Text>
              <Text style={styles.selectedCustomerToggleLabel}>
                {isCustomerDetailsExpanded ? 'Hide Details' : 'View Details'}
              </Text>
            </Pressable>

            {isCustomerDetailsExpanded ? (
              <View style={styles.selectedCustomerDetails}>
                {normalizeText(
                  selectedCustomer.registered_company_name ||
                  selectedCustomer.name,
                ) !== normalizeText(selectedCustomer.name) ? (
                  <Text
                    numberOfLines={2}
                    style={styles.selectedCustomerCompany}>
                    {normalizeText(
                      selectedCustomer.registered_company_name ||
                      selectedCustomer.name,
                    )}
                  </Text>
                ) : null}

                <View style={styles.selectedCustomerDetailsTags}>
                  <View style={styles.metaTag}>
                    <Text style={styles.metaTagLabel}>
                      Account {selectedCustomer.account_id || 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.metaTag}>
                    <Text style={styles.metaTagLabel}>
                      {selectedCustomer.payment_type || 'Payment'}
                    </Text>
                  </View>
                  <View style={styles.metaTag}>
                    <Text style={styles.metaTagLabel}>
                      {selectedCustomer.phone || 'No phone'}
                    </Text>
                  </View>
                </View>

                <Text numberOfLines={3} style={styles.selectedCustomerAddress}>
                  {getCustomerAddress(selectedCustomer.address)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {productsError ? (
          <InlineMessage message={productsError} tone="error" />
        ) : null}

        {productsStatus === 'loading' || productsStatus === 'idle' ? (
          <StatePanel
            message="Loading only the products assigned to this salesperson."
            mode="loading"
            title="Preparing inventory"
          />
        ) : null}

        {productsStatus === 'error' ? (
          <StatePanel
            actionLabel="Retry"
            message="We could not load personal inventory for this order."
            mode="error"
            onAction={loadProducts}
            title="Inventory request failed"
          />
        ) : null}

        {productsStatus === 'empty' ? (
          <StatePanel
            actionLabel="Reload"
            message="This user does not currently have any personal stock available."
            mode="empty"
            onAction={loadProducts}
            title="No personal inventory"
          />
        ) : null}

        {productsStatus === 'ready' ? (
          <>
            <View style={styles.productsSectionHeader}>
              <Text style={styles.productsSectionTitle}>
                Available Products
              </Text>
              <Text style={styles.productCategoryLabel}>Category</Text>
              <Pressable
                disabled={isCategoryDropdownDisabled}
                onPress={() => setIsCategoryDropdownVisible(true)}
                style={({ pressed }) => [
                  styles.productCategoryDropdown,
                  isCategoryDropdownDisabled
                    ? styles.productCategoryDropdownDisabled
                    : null,
                  pressed && !isCategoryDropdownDisabled
                    ? styles.productCategoryDropdownPressed
                    : null,
                ]}>
                <View style={styles.productCategoryDropdownRow}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.productCategoryDropdownValue,
                      isCategoryDropdownDisabled
                        ? styles.productCategoryDropdownValueMuted
                        : null,
                    ]}>
                    {isCategoryDropdownDisabled
                      ? 'Loading categories...'
                      : selectedProductCategoryLabel}
                  </Text>
                  <Image
                    source={dropdownIcon}
                    style={styles.productCategoryDropdownChevron}
                  />
                </View>
              </Pressable>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setProductSearchQuery}
                placeholder="Search products by name or SKU"
                placeholderTextColor={ui.textMuted}
                style={styles.productSearchInput}
                value={productSearchQuery}
              />
            </View>

            {categoriesError ? (
              <InlineMessage
                message="We could not load the full category list. Showing available categories only."
                tone="info"
              />
            ) : null}

            {filteredProducts.length ? (
              <View style={styles.productsWrap}>
                {filteredProducts.map(product => {
                  const quantity = selectedQuantities[product.id] ?? 0;
                  const maxOrderableQuantity = getMaxOrderableQuantity(
                    product.heldQuantity,
                  );
                  const remainingQuantity = Math.max(
                    maxOrderableQuantity - quantity,
                    0,
                  );

                  return (
                    <Pressable
                      key={product.id}
                      onPress={() => {
                        if (remainingQuantity > 0) {
                          updateQuantity(product, 1);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.productCard,
                        productCardLayoutStyle,
                        quantity > 0 ? styles.productCardSelected : null,
                        pressed && remainingQuantity > 0
                          ? styles.productCardPressed
                          : null,
                      ]}>
                      <View style={styles.productCardTopRow}>
                        <View style={styles.productSkuPill}>
                          <Text
                            numberOfLines={1}
                            style={styles.productSkuPillLabel}>
                            SKU {product.item_number || 'N/A'}
                          </Text>
                        </View>
                        <Text style={styles.productHeldLabel}>
                          {remainingQuantity} left for order
                        </Text>
                      </View>

                      <Text numberOfLines={2} style={styles.productName}>
                        {normalizeText(product.item_name)}
                      </Text>
                      <Text style={styles.productPrice}>
                        {formatCurrency(product.unitPrice)}
                      </Text>

                      <View style={styles.productCardFooter}>
                        {quantity > 0 ? (
                          <View style={styles.productSelectedPill}>
                            <Text style={styles.productSelectedPillLabel}>
                              {quantity} in order
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.productHint}>
                            Max 10 per item
                          </Text>
                        )}

                        <View style={[styles.productCardActions, { gap: 6 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Pressable
                              disabled={quantity === 0}
                              onPress={event => {
                                event.stopPropagation();
                                updateQuantity(product, -1);
                              }}
                              style={({ pressed }) => [
                                styles.quantityButton,
                                quantity === 0 ? { opacity: 0.3 } : null,
                                pressed && quantity > 0
                                  ? styles.quantityButtonPressed
                                  : null,
                              ]}>
                              <Text style={styles.quantityButtonLabel}>-</Text>
                            </Pressable>

                            <Text
                              style={{
                                fontSize: 16,
                                fontWeight: '900',
                                color: ui.textHeading,
                                minWidth: 20,
                                textAlign: 'center',
                              }}>
                              {quantity}
                            </Text>

                            <Pressable
                              disabled={remainingQuantity === 0}
                              onPress={event => {
                                event.stopPropagation();
                                updateQuantity(product, 1);
                              }}
                              style={({ pressed }) => [
                                styles.quantityButton,
                                remainingQuantity === 0
                                  ? { opacity: 0.3 }
                                  : null,
                                pressed && remainingQuantity > 0
                                  ? styles.quantityButtonPressed
                                  : null,
                              ]}>
                              <Text style={styles.quantityButtonLabel}>+</Text>
                            </Pressable>
                          </View>

                          <Pressable
                            disabled={remainingQuantity === 0 && quantity === 0}
                            onPress={event => {
                              event.stopPropagation();
                              openQuantityModal(product);
                            }}
                            style={({ pressed }) => [
                              styles.productCustomAddButton,
                              remainingQuantity === 0 && quantity === 0
                                ? styles.productCustomAddButtonDisabled
                                : null,
                              pressed ? styles.productCustomAddButtonPressed : null,
                              { minWidth: 48, paddingHorizontal: 6 }
                            ]}>
                            <Text style={styles.productCustomAddButtonLabel}>ADD</Text>
                          </Pressable>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.productSearchEmptyCard}>
                <Text style={styles.productSearchEmptyTitle}>
                  No matching products
                </Text>
                <Text style={styles.productSearchEmptyText}>
                  Try a different category, product name, or SKU.
                </Text>
              </View>
            )}

            <View style={styles.orderOverviewCard}>
              <View style={styles.orderOverviewHeader}>
                <View style={styles.orderOverviewTextWrap}>
                  <Text style={styles.orderOverviewEyebrow}>Current Order</Text>
                  <Text style={styles.orderOverviewTitle}>
                    {selectedProducts.length
                      ? selectedItemsLabel
                      : 'No items added yet'}
                  </Text>
                  <Text style={styles.orderOverviewSubtitle}>
                    Review totals only when you need them. Quick remove cards
                    stay visible while the summary is hidden.
                  </Text>
                </View>

                <Pressable
                  onPress={() => setIsSummaryVisible(current => !current)}
                  style={({ pressed }) => [
                    styles.summaryToggleButton,
                    pressed ? styles.summaryToggleButtonPressed : null,
                  ]}>
                  <Text style={styles.summaryToggleButtonLabel}>
                    {isSummaryVisible ? 'Hide Summary' : 'Show Summary'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.orderOverviewStats}>
                <View style={styles.orderOverviewStat}>
                  <Text style={styles.orderOverviewStatLabel}>Items</Text>
                  <Text style={styles.orderOverviewStatValue}>
                    {selectedProducts.length}
                  </Text>
                </View>
                <View style={styles.orderOverviewStat}>
                  <Text style={styles.orderOverviewStatLabel}>Units</Text>
                  <Text style={styles.orderOverviewStatValue}>
                    {totalUnits}
                  </Text>
                </View>
                <View style={styles.orderOverviewStat}>
                  <Text style={styles.orderOverviewStatLabel}>Payable</Text>
                  <Text style={styles.orderOverviewStatValue}>
                    {formatCurrency(totalPayable)}
                  </Text>
                </View>
              </View>
            </View>

            {!isSummaryVisible ? (
              selectedProducts.length ? (
                <View style={styles.selectedItemsCard}>
                  <View style={styles.selectedItemsHeader}>
                    <Text style={styles.selectedItemsTitle}>Added Items</Text>
                    <Text style={styles.selectedItemsSubtitle}>
                      Tap X to remove a product from the order instantly.
                    </Text>
                  </View>

                  <View style={styles.selectedItemsList}>
                    {selectedProducts.map(product => {
                      const quantity = selectedQuantities[product.id] ?? 0;
                      const lineTotal = quantity * product.unitPrice;
                      const maxOrderableQuantity = getMaxOrderableQuantity(
                        product.heldQuantity,
                      );
                      const remainingQuantity = Math.max(
                        maxOrderableQuantity - quantity,
                        0,
                      );

                      return (
                        <View key={product.id} style={styles.selectedItemCard}>
                          <View style={styles.selectedItemTopRow}>
                            <Text
                              numberOfLines={2}
                              style={styles.selectedItemName}>
                              {normalizeText(product.item_name)}
                            </Text>
                            <Pressable
                              onPress={() => removeProduct(product.id)}
                              style={({ pressed }) => [
                                styles.selectedItemRemoveButton,
                                pressed
                                  ? styles.selectedItemRemoveButtonPressed
                                  : null,
                              ]}>
                              <Text
                                style={styles.selectedItemRemoveButtonLabel}>
                                X
                              </Text>
                            </Pressable>
                          </View>

                          <Text style={styles.selectedItemMeta}>
                            Qty {quantity} in order, {remainingQuantity} left
                            for this order
                          </Text>
                          <Text style={styles.selectedItemTotal}>
                            {formatCurrency(lineTotal)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <View style={styles.selectedItemsEmptyCard}>
                  <Text style={styles.selectedItemsEmptyTitle}>
                    Start with any product card
                  </Text>
                  <Text style={styles.selectedItemsEmptyText}>
                    Added items will appear here as removable cards, so mobile
                    users can keep the page clean and still control the order.
                  </Text>
                </View>
              )
            ) : (
              <View style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryCartBadge}>
                    <Text style={styles.summaryCartBadgeLabel}>
                      {selectedProducts.length}
                    </Text>
                  </View>
                  <View style={styles.summaryHeaderText}>
                    <Text style={styles.summaryTitle}>Order Summary</Text>
                    <Text style={styles.summarySubtitle}>
                      {selectedCustomer?.name ?? 'Customer order'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setIsSummaryVisible(false)}
                    style={({ pressed }) => [
                      styles.summaryCloseButton,
                      pressed ? styles.summaryCloseButtonPressed : null,
                    ]}>
                    <Text style={styles.summaryCloseButtonLabel}>X</Text>
                  </Pressable>
                </View>

                {selectedProducts.length ? (
                  <View style={styles.summaryList}>
                    {selectedProducts.map(product => {
                      const quantity = selectedQuantities[product.id] ?? 0;
                      const lineTotal = quantity * product.unitPrice;
                      const maxOrderableQuantity = getMaxOrderableQuantity(
                        product.heldQuantity,
                      );
                      const remainingQuantity = Math.max(
                        maxOrderableQuantity - quantity,
                        0,
                      );

                      return (
                        <View key={product.id} style={styles.summaryItem}>
                          <View style={styles.summaryItemTopRow}>
                            <View style={styles.summaryItemContent}>
                              <Text
                                numberOfLines={2}
                                style={styles.summaryItemName}>
                                {normalizeText(product.item_name)}
                              </Text>
                              <Text style={styles.summaryItemMeta}>
                                {formatCurrency(product.unitPrice)} each
                              </Text>
                              <Text style={styles.summaryItemTotal}>
                                {formatCurrency(lineTotal)}
                              </Text>
                            </View>

                            <Pressable
                              onPress={() => removeProduct(product.id)}
                              style={({ pressed }) => [
                                styles.summaryRemoveButton,
                                pressed
                                  ? styles.summaryRemoveButtonPressed
                                  : null,
                              ]}>
                              <Text style={styles.summaryRemoveButtonLabel}>
                                X
                              </Text>
                            </Pressable>
                          </View>

                          <View style={styles.summaryItemFooter}>
                            <Text style={styles.summaryItemStock}>
                              {quantity} in order, {remainingQuantity} left for
                              this order
                            </Text>

                            <View style={styles.quantityPanel}>
                              <Pressable
                                onPress={() => updateQuantity(product, -1)}
                                style={({ pressed }) => [
                                  styles.quantityButton,
                                  pressed ? styles.quantityButtonPressed : null,
                                ]}>
                                <Text style={styles.quantityButtonLabel}>
                                  -
                                </Text>
                              </Pressable>

                              <View style={styles.quantityBadge}>
                                <Text style={styles.quantityValue}>
                                  {quantity}
                                </Text>
                                <Text style={styles.quantityLimit}>Units</Text>
                              </View>

                              <Pressable
                                onPress={() => updateQuantity(product, 1)}
                                style={({ pressed }) => [
                                  styles.quantityButton,
                                  pressed ? styles.quantityButtonPressed : null,
                                ]}>
                                <Text style={styles.quantityButtonLabel}>
                                  +
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.summaryEmptyCard}>
                    <Text style={styles.summaryEmptyTitle}>
                      Order summary is empty
                    </Text>
                    <Text style={styles.summaryEmptyText}>
                      Add products first, then open this panel whenever you want
                      to review totals and create the bill.
                    </Text>
                  </View>
                )}

                <View style={styles.adjustmentsRow}>
                  <View style={styles.adjustmentCard}>
                    <Text style={styles.adjustmentLabel}>Credit Memo (-)</Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      onChangeText={setCreditValue}
                      placeholder="0.00"
                      placeholderTextColor={ui.darkTextMuted}
                      style={styles.adjustmentInput}
                      value={creditMemoInput}
                    />
                  </View>

                  <View style={styles.adjustmentCard}>
                    <Text style={styles.adjustmentLabel}>
                      Container Deposit (+)
                    </Text>
                    <TextInput
                      keyboardType="decimal-pad"
                      onChangeText={setDepositValue}
                      placeholder="0.00"
                      placeholderTextColor={ui.darkTextMuted}
                      style={styles.adjustmentInput}
                      value={containerDepositInput}
                    />
                  </View>
                </View>

                <View style={styles.summaryStatsRow}>
                  <View style={styles.summaryStatCard}>
                    <Text style={styles.summaryFooterLabel}>Total Units</Text>
                    <Text style={styles.summaryStatValue}>{totalUnits}</Text>
                  </View>
                  <View style={styles.summaryStatCard}>
                    <Text style={styles.summaryFooterLabel}>Item Subtotal</Text>
                    <Text style={styles.summaryStatValue}>
                      {formatCurrency(itemSubtotal)}
                    </Text>
                  </View>
                </View>

                <View style={styles.signatureSection}>
                  <Text style={styles.signatureTitle}>Signatures</Text>
                  <View style={styles.signatureRow}>
                    <View style={styles.signatureColumn}>
                      <View style={styles.signatureHeaderRow}>
                        <Text style={styles.signatureLabel}>Driver</Text>
                        {driverSignature ? (
                          <TouchableOpacity
                            onPress={() => {
                              setDriverSignature(null);
                              setLatestStoredBill(null);
                            }}
                            style={styles.signatureClearButton}>
                            <Text style={styles.signatureClearButtonLabel}>✕</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {driverSignature ? (
                        <Pressable
                          onPress={() => setSignatureModalType('driver')}
                          style={styles.signaturePreviewContainer}>
                          <Image
                            source={{ uri: driverSignature }}
                            style={styles.signaturePreview}
                          />
                          <View style={styles.signatureRedrawOverlay}>
                            <Text style={styles.signatureRedrawLabel}>Redraw</Text>
                          </View>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => setSignatureModalType('driver')}
                          style={styles.signatureWriteButton}>
                          <Text style={styles.signatureWriteButtonLabel}>Write</Text>
                        </Pressable>
                      )}
                    </View>

                    <View style={styles.signatureColumn}>
                      <View style={styles.signatureHeaderRow}>
                        <Text style={styles.signatureLabel}>Customer</Text>
                        {customerSignature ? (
                          <TouchableOpacity
                            onPress={() => {
                              setCustomerSignature(null);
                              setLatestStoredBill(null);
                            }}
                            style={styles.signatureClearButton}>
                            <Text style={styles.signatureClearButtonLabel}>✕</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {customerSignature ? (
                        <Pressable
                          onPress={() => setSignatureModalType('customer')}
                          style={styles.signaturePreviewContainer}>
                          <Image
                            source={{ uri: customerSignature }}
                            style={styles.signaturePreview}
                          />
                          <View style={styles.signatureRedrawOverlay}>
                            <Text style={styles.signatureRedrawLabel}>Redraw</Text>
                          </View>
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => setSignatureModalType('customer')}
                          style={styles.signatureWriteButton}>
                          <Text style={styles.signatureWriteButtonLabel}>Write</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>

                {/* Payment Selection */}
                <View style={styles.paymentSection}>
                  <Text style={styles.paymentLabel}>Payment Type</Text>
                  <View style={styles.paymentOptions}>
                    {['Cash', 'Check', 'EFT', 'MO'].map((type) => (
                      <TouchableOpacity
                        key={type}
                        onPress={() => {
                          setPaymentType(type as any);
                          setLatestStoredBill(null);
                        }}
                        style={[
                          styles.paymentOption,
                          paymentType === type ? styles.paymentOptionSelected : null
                        ]}>
                        <View style={[
                          styles.radioButton,
                          paymentType === type ? styles.radioButtonSelected : null
                        ]}>
                          {paymentType === type && <View style={styles.radioButtonInner} />}
                        </View>
                        <Text style={[
                          styles.paymentOptionText,
                          paymentType === type ? styles.paymentOptionTextSelected : null
                        ]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {paymentType === 'Check' && (
                    <TextInput
                      placeholder="Enter Check Number"
                      value={checkNumber}
                      onChangeText={setCheckNumber}
                      style={styles.checkNumberInput}
                      placeholderTextColor={ui.textMuted}
                    />
                  )}
                </View>

                <View style={styles.payableBar}>
                  <View style={styles.payableBarTextWrap}>
                    <Text style={styles.summaryFooterLabel}>Total Payable</Text>
                    <Text style={styles.summaryFooterAmount}>
                      {formatCurrency(totalPayable)}
                    </Text>
                  </View>

                  <Pressable
                    disabled={generateBillDisabled}
                    onPress={() => handleGenerateBill()}
                    style={({ pressed }) => [
                      styles.generateBillButton,
                      isCompactLayout ? styles.generateBillButtonFull : null,
                      generateBillDisabled
                        ? styles.generateBillButtonDisabled
                        : null,
                      pressed && !generateBillDisabled
                        ? styles.generateBillButtonPressed
                        : null,
                    ]}>
                    {checkoutState === 'loading' ? (
                      <ActivityIndicator color={palette.white} />
                    ) : (
                      <Text style={styles.generateBillButtonLabel}>
                        Generate Invoice
                      </Text>
                    )}
                  </Pressable>

                  <Pressable
                    disabled={generateBillDisabled}
                    onPress={handleGenerateChecklist}
                    style={({ pressed }) => [
                      styles.generateChecklistButton,
                      isCompactLayout ? styles.generateBillButtonFull : null,
                      generateBillDisabled
                        ? styles.generateBillButtonDisabled
                        : null,
                      pressed && !generateBillDisabled
                        ? styles.generateBillButtonPressed
                        : null,
                    ]}>
                    {receiptActionState === 'loading' ? (
                      <ActivityIndicator color={palette.white} />
                    ) : (
                      <Text style={styles.generateBillButtonLabel}>
                        Generate Checklist
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {checkoutFeedback ? (
              <InlineMessage
                message={checkoutFeedback.message}
                tone={checkoutFeedback.tone}
              />
            ) : null}

            {latestStoredBill ? (
              <View style={styles.receiptActionCard}>
                <View style={styles.receiptActionHeader}>
                  <View style={styles.receiptActionBadge}>
                    <Text style={styles.receiptActionBadgeLabel}>PDF</Text>
                  </View>

                  <View style={styles.receiptActionTextWrap}>
                    <Text style={styles.receiptActionEyebrow}>
                      Generated Receipt
                    </Text>
                    <Text style={styles.receiptActionTitle}>
                      {latestStoredBill.order_number}
                    </Text>
                    <Text style={styles.receiptActionSubtitle}>
                      Stored for {latestStoredBill.customer_name}.{' '}
                      {formatReceiptTimestamp(latestStoredBill.generated_at)}.
                    </Text>
                  </View>
                </View>

                <View style={[styles.receiptActionButtons, { flexDirection: 'row', gap: spacing.md }]}>
                  <Pressable
                    onPress={openStoredReceipt}
                    style={({ pressed }) => [
                      styles.receiptSecondaryButton,
                      { flex: 1 },
                      pressed ? styles.receiptSecondaryButtonPressed : null,
                    ]}>
                    <Text style={styles.receiptSecondaryButtonLabel}>
                      View
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={manualPrintReceipt}
                    disabled={receiptActionState === 'loading'}
                    style={({ pressed }) => [
                      styles.receiptSecondaryButton,
                      { flex: 1 },
                      pressed ? styles.receiptSecondaryButtonPressed : null,
                    ]}>
                    {receiptActionState === 'loading' ? (
                      <ActivityIndicator size="small" color={palette.white} />
                    ) : (
                      <Text style={styles.receiptSecondaryButtonLabel}>
                        Print
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={closeQuantityModal}
        transparent
        visible={Boolean(quantityModalProduct)}>
        <View style={styles.quantityModalOverlay}>
          <Pressable
            onPress={closeQuantityModal}
            style={styles.quantityModalBackdrop}
          />

          <View style={[styles.quantityModalCard, quantityModalCardStyle]}>
            <Text style={styles.quantityModalEyebrow}>Custom Add</Text>
            <Text style={styles.quantityModalTitle}>Add quantity</Text>
            <Text style={styles.quantityModalSubtitle}>
              {quantityModalProduct
                ? normalizeText(quantityModalProduct.item_name)
                : 'Selected product'}
            </Text>

            <View style={styles.quantityModalStats}>
              <View style={styles.quantityModalStatCard}>
                <Text style={styles.quantityModalStatLabel}>In Order</Text>
                <Text style={styles.quantityModalStatValue}>
                  {quantityModalCurrentQuantity}
                </Text>
              </View>

              <View style={styles.quantityModalStatCard}>
                <Text style={styles.quantityModalStatLabel}>
                  Remaining After Add
                </Text>
                <Text style={styles.quantityModalStatValue}>
                  {quantityModalPreviewRemainingQuantity}
                </Text>
              </View>
            </View>

            <Text style={styles.quantityModalInputLabel}>Units to add</Text>
            <TextInput
              autoFocus
              keyboardType="number-pad"
              onChangeText={handleCustomQuantityInput}
              placeholder="1"
              placeholderTextColor={ui.darkTextMuted}
              style={styles.quantityModalInput}
              value={customQuantityInput}
            />

            <Text style={styles.quantityModalHint}>
              Enter a whole number up to the remaining order allowance. The
              backend accepts a maximum of 10 units per item.
            </Text>

            {customQuantityError ? (
              <InlineMessage message={customQuantityError} tone="error" />
            ) : null}

            <View style={styles.quantityModalActions}>
              <Pressable
                onPress={closeQuantityModal}
                style={({ pressed }) => [
                  styles.quantityModalCancelButton,
                  pressed ? styles.quantityModalCancelButtonPressed : null,
                ]}>
                <Text style={styles.quantityModalCancelButtonLabel}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                disabled={quantityModalBaseRemainingQuantity === 0}
                onPress={addCustomQuantity}
                style={({ pressed }) => [
                  styles.quantityModalConfirmButton,
                  quantityModalBaseRemainingQuantity === 0
                    ? styles.quantityModalConfirmButtonDisabled
                    : null,
                  pressed && quantityModalBaseRemainingQuantity > 0
                    ? styles.quantityModalConfirmButtonPressed
                    : null,
                ]}>
                <Text style={styles.quantityModalConfirmButtonLabel}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={closeCategoryDropdown}
        transparent
        visible={isCategoryDropdownVisible}>
        <View style={styles.quantityModalOverlay}>
          <Pressable
            onPress={closeCategoryDropdown}
            style={styles.quantityModalBackdrop}
          />

          <View
            style={[styles.categoryDropdownCard, categoryDropdownCardStyle]}>
            <Text style={styles.categoryDropdownEyebrow}>Category Filter</Text>
            <Text style={styles.categoryDropdownTitle}>Select category</Text>
            <Text style={styles.categoryDropdownSubtitle}>
              Choose one category to filter the product list.
            </Text>

            <ScrollView
              contentContainerStyle={styles.categoryDropdownOptions}
              showsVerticalScrollIndicator={false}
              style={styles.categoryDropdownScroll}>
              {productCategoryOptions.map(category => (
                <Pressable
                  key={category.value}
                  onPress={() => {
                    setSelectedProductCategory(category.value);
                    closeCategoryDropdown();
                  }}
                  style={({ pressed }) => [
                    styles.categoryDropdownOption,
                    selectedProductCategory === category.value
                      ? styles.categoryDropdownOptionActive
                      : null,
                    pressed ? styles.categoryDropdownOptionPressed : null,
                  ]}>
                  <Text
                    style={[
                      styles.categoryDropdownOptionLabel,
                      selectedProductCategory === category.value
                        ? styles.categoryDropdownOptionLabelActive
                        : null,
                    ]}>
                    {category.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={closeCategoryDropdown}
              style={({ pressed }) => [
                styles.categoryDropdownCloseButton,
                pressed ? styles.categoryDropdownCloseButtonPressed : null,
              ]}>
              <Text style={styles.categoryDropdownCloseButtonLabel}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsBillModalVisible(false)}
        visible={isBillModalVisible}>
        <SafeAreaView style={{ flex: 1, backgroundColor: ui.darkSurface }}>
          <View style={[styles.modalHeader, { backgroundColor: ui.darkSurfaceRaised, borderBottomWidth: 1, borderBottomColor: ui.darkBorder, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, height: 60 }]}>
            <Text style={{ color: palette.white, fontSize: 18, fontWeight: '900' }}>Receipt Preview</Text>

            <Pressable
              onPress={() => setIsBillModalVisible(false)}
              style={({ pressed }) => [
                {
                  backgroundColor: pressed ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                  borderRadius: 20,
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center'
                }
              ]}>
              <Text style={{
                color: palette.white,
                fontSize: 16,
                fontWeight: '400',
                lineHeight: 18,
                textAlign: 'center',
                includeFontPadding: false
              }}>✕</Text>
            </Pressable>
          </View>

          <View style={{ flex: 1, backgroundColor: palette.white }}>
            {isPdfLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.white }}>
                <ActivityIndicator color={palette.primaryStrong} size="large" />
                <Text style={{ color: ui.textBody, marginTop: spacing.md }}>Loading Receipt...</Text>
              </View>
            ) : pdfBase64 ? (
              <Pdf
                source={{ uri: `data:application/pdf;base64,${pdfBase64}` }}
                style={{ flex: 1, width: width, backgroundColor: palette.white }}
                spacing={0}
                fitPolicy={0}
                trustAllCerts={false}
                onLoadComplete={(numberOfPages) => {
                  console.log(`Number of pages: ${numberOfPages}`);
                }}
                onError={(error) => {
                  console.log(error);
                }}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: palette.white }}>No receipt data available.</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsPrinterPickerVisible(false)}
        transparent
        visible={isPrinterPickerVisible}>
        <View style={styles.quantityModalOverlay}>
          <Pressable
            onPress={() => setIsPrinterPickerVisible(false)}
            style={styles.quantityModalBackdrop}
          />
          <View style={[styles.categoryDropdownCard, categoryDropdownCardStyle]}>
            <Text style={styles.categoryDropdownEyebrow}>Printer Selection</Text>
            <Text style={styles.categoryDropdownTitle}>Choose printer</Text>
            <Text style={styles.categoryDropdownSubtitle}>
              Multiple paired devices found. Select one to print.
            </Text>

            <ScrollView
              contentContainerStyle={styles.categoryDropdownOptions}
              showsVerticalScrollIndicator={false}
              style={styles.categoryDropdownScroll}>
              {pairedBluetoothDevices.map(device => (
                <Pressable
                  key={device.inner_mac_address}
                  onPress={() => printWithSelectedDevice(device)}
                  style={({ pressed }) => [
                    styles.categoryDropdownOption,
                    selectedBluetoothPrinterMac === device.inner_mac_address
                      ? styles.categoryDropdownOptionActive
                      : null,
                    pressed ? styles.categoryDropdownOptionPressed : null,
                  ]}>
                  <Text
                    style={[
                      styles.categoryDropdownOptionLabel,
                      selectedBluetoothPrinterMac === device.inner_mac_address
                        ? styles.categoryDropdownOptionLabelActive
                        : null,
                    ]}>
                    {device.device_name || device.inner_mac_address}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={() => setIsPrinterPickerVisible(false)}
              style={({ pressed }) => [
                styles.categoryDropdownCloseButton,
                pressed ? styles.categoryDropdownCloseButtonPressed : null,
              ]}>
              <Text style={styles.categoryDropdownCloseButtonLabel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenContainer contentContainerStyle={screenContentStyle}>
        <View style={styles.backgroundGlowPrimary} />
        <View style={styles.backgroundGlowSecondary} />
        <View style={[styles.utilityRow, sectionWidthStyle]}>
          <View style={styles.userBadge}>
            <Text numberOfLines={1} style={styles.userBadgeLabel}>
              {session.user.name}
            </Text>
          </View>

          <View style={styles.utilityActions}>
            <Pressable
              onPress={() => setView('settings')}
              style={({ pressed }) => [
                styles.settingsIconButton,
                pressed ? styles.settingsIconButtonPressed : null,
              ]}>
              <Text style={styles.settingsIconGlyph}>⚙</Text>
            </Pressable>

            <Pressable
              onPress={onSignOut}
              style={({ pressed }) => [
                styles.signOutButton,
                pressed ? styles.signOutButtonPressed : null,
              ]}>
              <Text style={styles.signOutButtonLabel}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        {view === 'home' ? renderHome() : null}
        {view === 'customers' ? renderCustomers() : null}
        {view === 'products' ? renderProducts() : null}
        {view === 'settings' ? renderSettings() : null}
        {view === 'history' ? renderHistory() : null}
      </ScreenContainer>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsAddDeviceModalVisible(false)}
        transparent={false}
        visible={isAddDeviceModalVisible}>
        <SafeAreaView style={styles.settingsScannerScreen}>
          <View style={[styles.categoryDropdownCard, categoryDropdownCardStyle]}>
            <Text style={styles.categoryDropdownEyebrow}>Add Device</Text>
            <Text style={styles.categoryDropdownTitle}>Connect Printer</Text>
            <Text style={styles.categoryDropdownSubtitle}>
              Select a discovered printer to connect without leaving the app.
            </Text>
            <Text style={styles.settingsScanStatusLabel}>{addDeviceScanMessage}</Text>
            {addDeviceLastError ? (
              <Text style={styles.settingsScanErrorLabel}>{addDeviceLastError}</Text>
            ) : null}

            <ScrollView
              contentContainerStyle={styles.categoryDropdownOptions}
              showsVerticalScrollIndicator={false}
              style={styles.categoryDropdownScroll}>
              {isAddDeviceLoading ? (
                <View style={styles.settingsLoadingWrap}>
                  <ActivityIndicator size="small" color={ui.accentStrong} />
                  <Text style={styles.settingsLoadingLabel}>Searching devices...</Text>
                </View>
              ) : discoveredBluetoothDevices.length ? (
                discoveredBluetoothDevices.map(device => (
                  <View
                    key={device.inner_mac_address}
                    style={styles.settingsDeviceRow}>
                    <View style={styles.settingsDeviceTextWrap}>
                      <Text style={styles.settingsDeviceName}>
                        {device.device_name || 'Unnamed printer'}
                      </Text>
                      <Text style={styles.settingsDeviceMeta}>
                        {device.inner_mac_address}
                      </Text>
                    </View>
                    <Pressable
                      disabled={Boolean(connectingDeviceMac)}
                      onPress={async () => {
                        await connectBluetoothDevice(device);
                        setIsAddDeviceModalVisible(false);
                      }}
                      style={({ pressed }) => [
                        styles.settingsDeviceActionButton,
                        Boolean(connectingDeviceMac)
                          ? styles.settingsActionButtonDisabled
                          : null,
                        pressed ? styles.settingsActionButtonPressed : null,
                      ]}>
                      {connectingDeviceMac === device.inner_mac_address ? (
                        <ActivityIndicator size="small" color={palette.white} />
                      ) : (
                        <Text style={styles.settingsDeviceActionLabel}>
                          Click to connect
                        </Text>
                      )}
                    </Pressable>
                  </View>
                ))
              ) : (
                <Text style={styles.settingsStatusValue}>
                  No devices found yet. Make sure Bluetooth is ON, printer is close, then tap Rescan.
                </Text>
              )}
            </ScrollView>

            <View style={styles.settingsActionsRow}>
              <Pressable
                onPress={scanAvailableBluetoothDevices}
                style={({ pressed }) => [
                  styles.categoryDropdownCloseButton,
                  styles.settingsActionButtonHalf,
                  pressed ? styles.categoryDropdownCloseButtonPressed : null,
                ]}>
                <Text style={styles.categoryDropdownCloseButtonLabel}>Rescan</Text>
              </Pressable>
              <Pressable
                onPress={() => setIsAddDeviceModalVisible(false)}
                style={({ pressed }) => [
                  styles.categoryDropdownCloseButton,
                  styles.settingsActionButtonHalf,
                  pressed ? styles.categoryDropdownCloseButtonPressed : null,
                ]}>
                <Text style={styles.categoryDropdownCloseButtonLabel}>Close</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      <SignatureModal
        isVisible={signatureModalType !== null}
        onClose={() => setSignatureModalType(null)}
        onSave={(base64) => {
          if (signatureModalType === 'driver') {
            setDriverSignature(base64);
          } else {
            setCustomerSignature(base64);
          }
          setLatestStoredBill(null);
        }}
        title={signatureModalType === 'driver' ? 'Driver Signature' : 'Customer Signature'}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  accountPill: {
    backgroundColor: ui.softSurfaceStrong,
    borderColor: ui.cardBorderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  accountPillLabel: {
    color: ui.textBody,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  adjustmentCard: {
    flex: 1,
    minWidth: 132,
  },
  adjustmentInput: {
    backgroundColor: ui.darkSurfaceRaised,
    borderColor: ui.darkBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    color: palette.white,
    fontSize: 17,
    fontWeight: '800',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  adjustmentLabel: {
    color: ui.darkTextMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  adjustmentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
    marginTop: spacing.xl,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  backButtonIcon: {
    height: 18,
    resizeMode: 'contain',
    width: 18,
  },
  backgroundGlowPrimary: {
    backgroundColor: ui.pageGlowPrimary,
    borderRadius: radii.pill,
    height: 260,
    position: 'absolute',
    right: -60,
    top: 16,
    width: 260,
  },
  backgroundGlowSecondary: {
    backgroundColor: ui.pageGlowSecondary,
    borderRadius: radii.pill,
    height: 220,
    left: -90,
    position: 'absolute',
    top: 220,
    width: 220,
  },
  cardStack: {
    gap: spacing.lg,
  },
  customerAccountText: {
    color: ui.textHeading,
    fontSize: 14,
    fontWeight: '800',
  },
  customerActionLabel: {
    color: ui.accentStrong,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  customerAvatar: {
    alignItems: 'center',
    backgroundColor: `${ui.accent}15`,
    borderRadius: radii.pill,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  customerAvatarLabel: {
    color: ui.accentStrong,
    fontSize: 18,
    fontWeight: '900',
  },
  customerCard: {
    backgroundColor: '#FCFDF9',
    borderColor: ui.cardBorder,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.xl,
    ...shadowPresets.card,
  },
  customerCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  customerCardPressed: {
    opacity: 0.96,
  },
  customerHeaderBadges: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  customerCompany: {
    color: ui.textMuted,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  customerCompanyNearest: {
    marginBottom: spacing.sm,
  },
  customerFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  customerFocusAvatar: {
    alignItems: 'center',
    backgroundColor: ui.highlightSoft,
    borderRadius: radii.pill,
    height: 56,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 56,
  },
  customerFocusAvatarLabel: {
    color: ui.accentStrong,
    fontSize: 20,
    fontWeight: '900',
  },
  customerFocusCard: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  customerFocusCompany: {
    color: ui.textMuted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  customerFocusEyebrow: {
    color: ui.accentStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: spacing.xxs,
    textTransform: 'uppercase',
  },
  customerFocusHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  customerFocusName: {
    color: ui.textHeading,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: spacing.xxs,
  },
  customerFocusTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  customerFocusText: {
    flex: 1,
  },
  customerIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  customerIdentityText: {
    flex: 1,
    marginLeft: spacing.md,
    minWidth: 0,
  },
  customerMetaGroup: {
    borderTopColor: ui.cardBorder,
    borderTopWidth: 1,
    marginBottom: spacing.lg,
    paddingTop: spacing.lg,
  },
  customerMetaIcon: {
    color: ui.accentStrong,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginRight: spacing.sm,
    width: 54,
  },
  customerMetaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  customerMetaValue: {
    color: ui.textBody,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  nearestCustomerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: ui.highlightSoft,
    borderColor: ui.cardBorderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  nearestCustomerBadgeLabel: {
    color: ui.accentStrong,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  distanceLight: {
    borderRadius: radii.pill,
    height: 12,
    width: 12,
    elevation: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 8,
  },
  distanceLightBadge: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: ui.cardBorderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  customerMiniLabel: {
    color: ui.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: spacing.xxs,
    textTransform: 'uppercase',
  },
  customerName: {
    color: ui.textHeading,
    fontSize: 27,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  eyebrow: {
    color: ui.textMuted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  generateBillButton: {
    alignItems: 'center',
    backgroundColor: ui.highlight,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 180,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  generateBillButtonDisabled: {
    backgroundColor: '#3C4B42',
    opacity: 0.72,
  },
  generateBillButtonFull: {
    width: '100%',
  },
  generateBillButtonLabel: {
    color: palette.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  generateBillButtonPressed: {
    opacity: 0.94,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: 34,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
    ...shadowPresets.card,
  },
  inventoryPill: {
    backgroundColor: ui.highlightSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inventoryPillLabel: {
    color: ui.accentStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  locationActionButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: ui.cardBorderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  locationActionButtonLabel: {
    color: ui.accentStrong,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  locationActionButtonPressed: {
    opacity: 0.92,
  },
  locationCard: {
    alignItems: 'center',
    backgroundColor: ui.highlightSoft,
    borderColor: ui.cardBorderStrong,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  locationCardBody: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  locationCardText: {
    flex: 1,
    minWidth: 180,
  },
  locationCardTitle: {
    color: ui.textHeading,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: spacing.xxs,
  },
  metaTag: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  metaTagLabel: {
    color: ui.textBody,
    fontSize: 12,
    fontWeight: '800',
  },
  orderOverviewCard: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  orderOverviewEyebrow: {
    color: ui.accentStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: spacing.xxs,
    textTransform: 'uppercase',
  },
  orderOverviewHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  orderOverviewStat: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    minWidth: 96,
    padding: spacing.md,
  },
  orderOverviewStatLabel: {
    color: ui.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  orderOverviewStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  orderOverviewStatValue: {
    color: ui.textHeading,
    fontSize: 20,
    fontWeight: '900',
  },
  orderOverviewSubtitle: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  orderOverviewTextWrap: {
    flex: 1,
    minWidth: 180,
  },
  orderOverviewTitle: {
    color: ui.textHeading,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  payableBar: {
    alignItems: 'center',
    borderTopColor: ui.darkBorder,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    paddingTop: spacing.xl,
  },
  payableBarTextWrap: {
    flex: 1,
    minWidth: 160,
  },
  receiptActionBadge: {
    alignItems: 'center',
    backgroundColor: ui.highlight,
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 38,
  },
  receiptActionBadgeLabel: {
    color: palette.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  receiptActionButtonDisabled: {
    opacity: 0.58,
  },
  receiptActionButtonFull: {
    width: '100%',
  },
  receiptActionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  receiptActionCard: {
    backgroundColor: ui.darkSurface,
    borderColor: ui.darkBorder,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: spacing.xl,
    padding: spacing.xl,
  },
  receiptActionEyebrow: {
    color: '#B8E972',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginBottom: spacing.xxs,
    textTransform: 'uppercase',
  },
  receiptActionHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  receiptActionSubtitle: {
    color: ui.darkTextMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  receiptActionTextWrap: {
    flex: 1,
  },
  receiptActionTitle: {
    color: palette.white,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  receiptPrimaryButton: {
    alignItems: 'center',
    backgroundColor: ui.highlight,
    borderRadius: radii.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 150,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  receiptPrimaryButtonLabel: {
    color: palette.white,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  receiptPrimaryButtonPressed: {
    opacity: 0.92,
  },
  receiptSecondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: ui.darkBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 80,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  receiptSecondaryButtonLabel: {
    color: palette.white,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  receiptSecondaryButtonPressed: {
    opacity: 0.88,
  },
  paymentPill: {
    backgroundColor: ui.highlightSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  paymentPillLabel: {
    color: ui.accentStrong,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  placeOrdersButton: {
    alignItems: 'center',
    backgroundColor: ui.darkSurface,
    borderRadius: 32,
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl,
    width: '100%',
  },
  placeOrdersCaption: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  placeOrdersIcon: {
    alignItems: 'center',
    backgroundColor: ui.highlight,
    borderRadius: radii.pill,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    position: 'relative',
    width: 88,
  },
  placeOrdersLabel: {
    color: palette.white,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: 2,
    width: '100%',
  },
  historyPill: {
    backgroundColor: palette.primaryStrong,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  historyPillLabel: {
    color: palette.white,
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.gray50,
    borderRadius: 8,
    padding: 4,
  },
  filterArrow: {
    paddingHorizontal: 8,
  },
  filterArrowText: {
    fontSize: 16,
    color: palette.blue,
    fontWeight: 'bold',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  yearSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.gray100,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  yearArrow: {
    padding: 4,
  },
  yearArrowText: {
    fontSize: 18,
    color: palette.primaryStrong,
    fontWeight: 'bold',
  },
  yearText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: palette.gray900,
    marginHorizontal: 8,
  },
  monthStrip: {
    marginBottom: spacing.lg,
  },
  monthStripContent: {
    paddingHorizontal: 2,
    gap: 8,
  },
  monthPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: palette.gray50,
    borderWidth: 1,
    borderColor: palette.gray100,
  },
  monthPillActive: {
    backgroundColor: palette.primaryStrong,
    borderColor: palette.primaryStrong,
  },
  monthPillLabel: {
    fontSize: 13,
    color: palette.gray600,
    fontWeight: '600',
  },
  monthPillLabelActive: {
    color: palette.white,
  },
  historyList: {
    marginTop: 16,
  },
  historyCard: {
    backgroundColor: palette.white,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.gray100,
    ...shadowPresets.card,
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  historyCardInfo: {
    flex: 1,
  },
  historyCardDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  historyCardDate: {
    fontSize: 12,
    color: palette.gray500,
    fontWeight: '600',
  },
  historyStatusBadge: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historyStatusText: {
    fontSize: 9,
    color: '#1E8E3E',
    fontWeight: 'bold',
  },
  historyCardInvoice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: palette.gray900,
  },
  historyCardCustomer: {
    fontSize: 13,
    color: palette.gray600,
    marginTop: 2,
  },
  historyCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  historyCardAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: palette.primaryStrong,
  },
  historyExpandBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.gray50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyExpandBtnActive: {
    backgroundColor: palette.primarySoft,
  },
  historyExpandIcon: {
    fontSize: 12,
    color: palette.gray400,
  },
  historyExpandIconActive: {
    color: palette.primaryStrong,
  },
  historyCardDetails: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
    backgroundColor: '#FAFBF9',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  historyItemSku: {
    fontSize: 10,
    color: palette.gray400,
  },
  historyCardFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
  },
  historyFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyFooterLabel: {
    fontSize: 12,
    color: palette.gray500,
  },
  historyFooterValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: palette.gray900,
  },
  historyItemsHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  historyItemsHeaderText: {
    fontSize: 10,
    color: palette.gray500,
  },
  historyItemRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  historyItemName: {
    fontSize: 11,
    color: palette.gray700,
    flex: 2,
  },
  historyItemQty: {
    fontSize: 11,
    color: palette.gray700,
    flex: 0.5,
    textAlign: 'center',
  },
  historyItemPrice: {
    fontSize: 11,
    color: palette.gray700,
    flex: 1,
    textAlign: 'right',
  },
  emptyHistory: {
    padding: 40,
    alignItems: 'center',
  },
  emptyHistoryText: {
    color: palette.gray400,
    fontSize: 14,
  },
  plusHorizontal: {
    backgroundColor: palette.white,
    borderRadius: radii.pill,
    height: 6,
    width: 34,
  },
  plusVertical: {
    backgroundColor: palette.white,
    borderRadius: radii.pill,
    height: 34,
    position: 'absolute',
    width: 6,
  },
  productCard: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 152,
    padding: spacing.md,
    width: '100%',
    ...shadowPresets.soft,
  },
  productCardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  productCardHalf: {
    width: '48.5%',
  },
  productCardThird: {
    width: '32.2%',
  },
  productCardPressed: {
    opacity: 0.96,
  },
  productCardSelected: {
    backgroundColor: ui.softSurface,
    borderColor: ui.highlight,
    shadowColor: ui.highlight,
  },
  productCardActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginLeft: 'auto',
  },
  productCardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  productHeldLabel: {
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  productHint: {
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  productName: {
    color: ui.textHeading,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  productPrice: {
    color: ui.accentStrong,
    fontSize: 18,
    fontWeight: '900',
  },
  productSelectedPill: {
    alignSelf: 'flex-start',
    backgroundColor: ui.highlightSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  productSelectedPillLabel: {
    color: ui.accentStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  productCustomAddButton: {
    alignItems: 'center',
    backgroundColor: ui.highlight,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  productCustomAddButtonDisabled: {
    backgroundColor: ui.cardBorderStrong,
  },
  productCustomAddButtonLabel: {
    color: palette.white,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  productCustomAddButtonPressed: {
    opacity: 0.92,
  },
  productStepButton: {
    alignItems: 'center',
    backgroundColor: ui.darkSurfaceRaised,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 42,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  productStepButtonDisabled: {
    backgroundColor: ui.cardBorderStrong,
  },
  productStepButtonLabel: {
    color: palette.white,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  productStepButtonPressed: {
    opacity: 0.92,
  },
  productsSectionHeader: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categoryDropdownCard: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    maxHeight: '78%',
    padding: spacing.xl,
    ...shadowPresets.card,
  },
  categoryDropdownCloseButton: {
    alignItems: 'center',
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  categoryDropdownCloseButtonLabel: {
    color: ui.textHeading,
    fontSize: 14,
    fontWeight: '900',
  },
  categoryDropdownCloseButtonPressed: {
    opacity: 0.92,
  },
  categoryDropdownEyebrow: {
    color: ui.accentStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: spacing.xxs,
    textTransform: 'uppercase',
  },
  categoryDropdownOption: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  categoryDropdownOptionActive: {
    backgroundColor: ui.highlightSoft,
    borderColor: ui.highlight,
  },
  categoryDropdownOptionLabel: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '800',
  },
  categoryDropdownOptionLabelActive: {
    color: ui.accentStrong,
  },
  categoryDropdownOptionPressed: {
    opacity: 0.9,
  },
  categoryDropdownOptions: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  categoryDropdownScroll: {
    maxHeight: 320,
  },
  categoryDropdownSubtitle: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  categoryDropdownTitle: {
    color: ui.textHeading,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  productCategoryDropdown: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  productCategoryDropdownChevron: {
    height: 12,
    resizeMode: 'contain',
    width: 12,
  },
  productCategoryDropdownDisabled: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorderStrong,
  },
  productCategoryDropdownPressed: {
    opacity: 0.94,
  },
  productCategoryDropdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  productCategoryDropdownValue: {
    color: ui.textHeading,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  productCategoryDropdownValueMuted: {
    color: ui.textMuted,
  },
  productCategoryLabel: {
    color: ui.textHeading,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  productSearchEmptyCard: {
    alignItems: 'center',
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  productSearchEmptyText: {
    color: ui.textMuted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  productSearchEmptyTitle: {
    color: ui.textHeading,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  productSearchInput: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: 18,
    borderWidth: 1,
    color: ui.textHeading,
    fontSize: 14,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  productsSectionTitle: {
    color: ui.textHeading,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  productsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  productSkuPill: {
    backgroundColor: ui.highlightSoft,
    borderRadius: radii.pill,
    maxWidth: '58%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  productSkuPillLabel: {
    color: ui.accentStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  quantityButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: ui.cardBorderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  quantityBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: ui.darkBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    minWidth: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  quantityButtonLabel: {
    color: ui.textHeading,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  quantityButtonPressed: {
    backgroundColor: ui.highlightSoft,
  },
  quantityModalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
  },
  quantityModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  quantityModalCancelButton: {
    alignItems: 'center',
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 108,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  quantityModalCancelButtonLabel: {
    color: ui.textHeading,
    fontSize: 14,
    fontWeight: '900',
  },
  quantityModalCancelButtonPressed: {
    opacity: 0.92,
  },
  quantityModalCard: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    ...shadowPresets.card,
  },
  quantityModalConfirmButton: {
    alignItems: 'center',
    backgroundColor: ui.highlight,
    borderRadius: radii.md,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 132,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  quantityModalConfirmButtonDisabled: {
    backgroundColor: ui.cardBorderStrong,
  },
  quantityModalConfirmButtonLabel: {
    color: palette.white,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  quantityModalConfirmButtonPressed: {
    opacity: 0.92,
  },
  quantityModalEyebrow: {
    color: ui.accentStrong,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: spacing.xxs,
    textTransform: 'uppercase',
  },
  quantityModalHint: {
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  quantityModalInput: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorderStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    color: ui.textHeading,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  quantityModalInputLabel: {
    color: ui.textHeading,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  quantityModalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(23,39,29,0.36)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  quantityModalStatCard: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    minWidth: 96,
    padding: spacing.md,
  },
  quantityModalStatLabel: {
    color: ui.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  quantityModalStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  quantityModalStatValue: {
    color: ui.textHeading,
    fontSize: 20,
    fontWeight: '900',
  },
  quantityModalSubtitle: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  quantityModalTitle: {
    color: ui.textHeading,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  quantityLimit: {
    color: ui.darkTextMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  quantityPanel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  quantityValue: {
    color: palette.white,
    fontSize: 18,
    fontWeight: '900',
  },
  selectedCustomerAddress: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  selectedCustomerCompactName: {
    color: ui.textHeading,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    marginRight: spacing.md,
  },
  selectedCustomerCompany: {
    color: ui.textMuted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  selectedCustomerDetails: {
    borderTopColor: ui.cardBorder,
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  selectedCustomerDetailsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  selectedCustomerPanel: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  selectedCustomerToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectedCustomerToggleLabel: {
    color: ui.accentStrong,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  selectedCustomerTogglePressed: {
    opacity: 0.9,
  },
  screenContent: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  sectionCard: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: 34,
    borderWidth: 1,
    padding: spacing.xl,
    ...shadowPresets.card,
  },
  sectionEyebrow: {
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 2,
  },
  sectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.xl,
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 180,
  },
  sectionSubtitle: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  sectionTitle: {
    color: ui.textHeading,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  selectedItemCard: {
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  selectedItemMeta: {
    color: ui.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  selectedItemName: {
    color: ui.textHeading,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
    marginRight: spacing.md,
  },
  selectedItemRemoveButton: {
    alignItems: 'center',
    backgroundColor: ui.dangerSoft,
    borderRadius: radii.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  selectedItemRemoveButtonLabel: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '900',
  },
  selectedItemRemoveButtonPressed: {
    opacity: 0.88,
  },
  selectedItemsCard: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  selectedItemsEmptyCard: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  selectedItemsEmptyText: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  selectedItemsEmptyTitle: {
    color: ui.textHeading,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  selectedItemsHeader: {
    marginBottom: spacing.md,
  },
  selectedItemsList: {
    gap: spacing.md,
  },
  selectedItemsSubtitle: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  selectedItemsTitle: {
    color: ui.textHeading,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  selectedItemTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  selectedItemTotal: {
    color: ui.accentStrong,
    fontSize: 16,
    fontWeight: '900',
  },
  subtitle: {
    color: ui.textMuted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 420,
    textAlign: 'center',
  },
  signOutButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  signOutButtonLabel: {
    color: ui.textHeading,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  signOutButtonPressed: {
    opacity: 0.88,
  },
  settingsActionButton: {
    alignItems: 'center',
    backgroundColor: ui.accentStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 42,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  settingsActionButtonLabel: {
    color: palette.white,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  settingsActionButtonPressed: {
    opacity: 0.9,
  },
  settingsActionButtonHalf: {
    flex: 1,
    marginTop: 0,
  },
  settingsActionButtonMuted: {
    backgroundColor: ui.textMuted,
  },
  settingsActionButtonDisabled: {
    opacity: 0.5,
  },
  settingsActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  settingsDevicesCard: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  settingsAddedHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  settingsDeviceRow: {
    alignItems: 'center',
    borderBottomColor: ui.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  settingsDeviceTextWrap: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingsDeviceName: {
    color: ui.textHeading,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  settingsDeviceMeta: {
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  settingsDeviceActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  settingsDeviceActionButton: {
    alignItems: 'center',
    backgroundColor: ui.accentStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  settingsDeviceActionButtonDanger: {
    backgroundColor: '#AF3E3E',
  },
  settingsDeviceActionLabel: {
    color: palette.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  settingsLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    paddingVertical: spacing.md,
  },
  settingsLoadingLabel: {
    color: ui.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  settingsScanStatusLabel: {
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  settingsScanErrorLabel: {
    color: '#AF3E3E',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  settingsScannerScreen: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  settingsIconButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    display: 'flex',
    flexDirection: 'row',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  settingsIconButtonPressed: {
    opacity: 0.88,
  },
  settingsIconGlyph: {
    color: ui.textHeading,
    fontSize: 20,
    fontWeight: '900',
    height: 40,
    includeFontPadding: false,
    lineHeight: 40,
    textAlign: 'center',
    textAlignVertical: 'center',
    width: 40,
  },
  settingsStatusCard: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  settingsStatusLabel: {
    color: ui.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  settingsStatusValue: {
    color: ui.textHeading,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  summaryCard: {
    backgroundColor: ui.darkSurface,
    borderColor: ui.darkBorder,
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: spacing.xl,
    padding: spacing.xl,
  },
  summaryCartBadge: {
    alignItems: 'center',
    backgroundColor: ui.highlight,
    borderRadius: radii.pill,
    height: 46,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 46,
  },
  summaryCartBadgeLabel: {
    color: palette.white,
    fontSize: 18,
    fontWeight: '900',
  },
  summaryCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  summaryCloseButtonLabel: {
    color: palette.white,
    fontSize: 13,
    fontWeight: '900',
  },
  summaryCloseButtonPressed: {
    opacity: 0.88,
  },
  summaryEmptyCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: ui.darkBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.lg,
  },
  summaryEmptyText: {
    color: ui.darkTextMuted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  summaryEmptyTitle: {
    color: palette.white,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  summaryFooterAmount: {
    color: palette.white,
    fontSize: 28,
    fontWeight: '900',
  },
  summaryFooterLabel: {
    color: ui.darkTextMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  summaryHeaderText: {
    flex: 1,
  },
  summaryItem: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: ui.darkBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  summaryItemContent: {
    flex: 1,
  },
  summaryItemFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  summaryItemMeta: {
    color: ui.darkTextMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  summaryItemName: {
    color: palette.white,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  summaryItemStock: {
    color: ui.darkTextMuted,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 140,
  },
  summaryItemTotal: {
    color: '#B8E972',
    fontSize: 15,
    fontWeight: '900',
  },
  summaryItemTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  summaryList: {
    gap: spacing.md,
  },
  summaryRemoveButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(214,84,98,0.18)',
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  summaryRemoveButtonLabel: {
    color: '#FFC6CF',
    fontSize: 13,
    fontWeight: '900',
  },
  summaryRemoveButtonPressed: {
    opacity: 0.88,
  },
  summaryStatCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: ui.darkBorder,
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    minWidth: 132,
    padding: spacing.md,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryStatValue: {
    color: palette.white,
    fontSize: 24,
    fontWeight: '900',
  },
  summarySubtitle: {
    color: ui.darkTextMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryToggleButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: ui.highlight,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  summaryToggleButtonLabel: {
    color: palette.white,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  summaryToggleButtonPressed: {
    opacity: 0.9,
  },
  summaryTitle: {
    color: palette.white,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 2,
  },
  title: {
    color: ui.textHeading,
    fontWeight: '900',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  topBackRow: {
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  userBadge: {
    backgroundColor: ui.softSurfaceStrong,
    borderColor: ui.cardBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: '62%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  userBadgeLabel: {
    color: ui.accentStrong,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  utilityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  utilityActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalHeader: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  modalTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '900',
  },
  modalCloseButton: {
    backgroundColor: palette.background,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  modalCloseButtonLabel: {
    color: palette.primaryStrong,
    fontSize: 14,
    fontWeight: '900',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  signatureSection: {
    padding: spacing.lg,
    backgroundColor: ui.softSurface,
    borderRadius: radii.xl,
    marginVertical: spacing.md,
    borderWidth: 1,
    borderColor: ui.cardBorder,
  },
  signatureTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: ui.textHeading,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  signatureRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  signatureColumn: {
    flex: 1,
    alignItems: 'center',
  },
  signatureLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: ui.textMuted,
    marginBottom: spacing.xs,
  },
  signatureWriteButton: {
    width: '100%',
    height: 60,
    backgroundColor: palette.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: ui.cardBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureWriteButtonLabel: {
    color: palette.primaryStrong,
    fontWeight: '600',
  },
  signaturePreview: {
    width: '100%',
    height: 60,
    backgroundColor: palette.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: ui.cardBorderStrong,
    resizeMode: 'contain',
  },
  signatureHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.xs,
  },
  signatureClearButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ui.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureClearButtonLabel: {
    fontSize: 10,
    color: '#EF4444',
    fontWeight: 'bold',
  },
  signaturePreviewContainer: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radii.md,
  },
  signatureRedrawOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  signatureRedrawLabel: {
    color: palette.white,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  paymentSection: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  paymentLabel: {
    color: ui.darkTextMuted,
    fontSize: 16,
    fontWeight: '900',
    marginBottom: spacing.md,
  },
  paymentOptions: {
    gap: spacing.sm,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: ui.cardBorder,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  paymentOptionSelected: {
    borderColor: ui.highlight,
    backgroundColor: ui.highlightSoft,
  },
  paymentOptionText: {
    color: ui.textBody,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: spacing.md,
  },
  paymentOptionTextSelected: {
    color: ui.accentStrong,
    fontWeight: '900',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: ui.cardBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    borderColor: ui.highlight,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ui.highlight,
  },
  checkNumberInput: {
    backgroundColor: ui.softSurface,
    borderColor: ui.cardBorder,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    color: ui.textHeading,
    fontSize: 14,
    fontWeight: '700',
  },
  generateChecklistButton: {
    alignItems: 'center',
    backgroundColor: ui.accentStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 56,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xl,
    ...shadowPresets.card,
  },
});
