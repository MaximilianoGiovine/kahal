/** Divisas vigentes (ISO 4217). Tiene que coincidir con el enum Currency de la API. */
export const CURRENCY_GROUPS = [
  {
    label: 'América',
    codes: ['ARS', 'AWG', 'BBD', 'BMD', 'BOB', 'BRL', 'BSD', 'BZD', 'CAD', 'CLP', 'COP', 'CRC', 'CUP', 'DOP', 'FKP', 'GTQ', 'GYD', 'HNL', 'HTG', 'JMD', 'KYD', 'MXN', 'NIO', 'PAB', 'PEN', 'PYG', 'SRD', 'TTD', 'USD', 'UYU', 'VES', 'XCD', 'XCG'],
  },
  {
    label: 'Europa',
    codes: ['ALL', 'BAM', 'BYN', 'CHF', 'CZK', 'DKK', 'EUR', 'GBP', 'GIP', 'HUF', 'ISK', 'MDL', 'MKD', 'NOK', 'PLN', 'RON', 'RSD', 'RUB', 'SEK', 'UAH'],
  },
  {
    label: 'Asia y Oceanía',
    codes: ['AFN', 'AMD', 'AUD', 'AZN', 'BDT', 'BND', 'BTN', 'CNY', 'FJD', 'GEL', 'HKD', 'IDR', 'INR', 'JPY', 'KGS', 'KHR', 'KPW', 'KRW', 'KZT', 'LAK', 'LKR', 'MMK', 'MNT', 'MOP', 'MVR', 'MYR', 'NPR', 'NZD', 'PGK', 'PHP', 'PKR', 'SBD', 'SGD', 'THB', 'TJS', 'TMT', 'TOP', 'TWD', 'UZS', 'VND', 'VUV', 'WST', 'XPF'],
  },
  {
    label: 'Medio Oriente',
    codes: ['AED', 'BHD', 'ILS', 'IQD', 'IRR', 'JOD', 'KWD', 'LBP', 'OMR', 'QAR', 'SAR', 'SYP', 'TRY', 'YER'],
  },
  {
    label: 'África',
    codes: ['AOA', 'BIF', 'BWP', 'CDF', 'CVE', 'DJF', 'DZD', 'EGP', 'ERN', 'ETB', 'GHS', 'GMD', 'GNF', 'KES', 'KMF', 'LRD', 'LSL', 'LYD', 'MAD', 'MGA', 'MRU', 'MUR', 'MWK', 'MZN', 'NAD', 'NGN', 'RWF', 'SCR', 'SDG', 'SHP', 'SLE', 'SOS', 'SSP', 'STN', 'SZL', 'TND', 'TZS', 'UGX', 'XAF', 'XOF', 'ZAR', 'ZMW', 'ZWG'],
  },
] as const;

export type Currency = (typeof CURRENCY_GROUPS)[number]['codes'][number];
