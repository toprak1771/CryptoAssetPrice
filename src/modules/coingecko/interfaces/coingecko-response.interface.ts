export interface CoinGeckoPriceResponse {
  [coinId: string]: { [currency: string]: number };
}

export interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
}
