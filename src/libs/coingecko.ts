
import axios from "axios"
import { Logger } from "./logger"
import { FSCache } from "./cache"
import { IntError } from "../routes/api"

interface CoinPrice {
    eur: number,
    btc: number,
    usd: number,
    timestamp: number
}

interface Coin {
    name: string,
    symbol: string,
    id: string,
    price?: CoinPrice | number,
    image?: {
        thumb: string,
        small: string,
        large: string
    },
    blockchain_site?: string
}

const coingeckoListUrl = () => 'https://api.coingecko.com/api/v3/coins/list'
const coingeckoCoinUrl = (id: string) => `https://api.coingecko.com/api/v3/coins/${id}`

export class Coingecko {
    private timeout: number = 1000 * 60 * 1000 // 1000 min
    private logger: Logger
    private list: FSCache = new FSCache("coingecko.json")

    constructor(logger: Logger) {
        // this.cron()
        this.logger = logger
        let coins = [
            {
                "id": "usd-coin",
                "symbol": "usdc",
                "name": "USDC"
            },
            {
                "id": "tether",
                "symbol": "usdt",
                "name": "Tether"
            },
            {
                "id": "wrapped-bitcoin",
                "symbol": "wbtc",
                "name": "Wrapped Bitcoin"
            },
            {
                "id": "ethereum",
                "symbol": "eth",
                "name": "Ethereum"
            },
            {
                "id": "ethereum",
                "symbol": "weth",
                "name": "Wrapped Ethereum"
            },
            {
                "id": "binancecoin",
                "symbol": "bnb",
                "name": "BNB"
            },
            {
                "id": "base",
                "symbol": "base",
                "name": "Base"
            },
            {
                "id": "bitcoin",
                "symbol": "btc",
                "name": "Bitcoin"
            },
            {
                "id": "tron",
                "symbol": "trx",
                "name": "TRON"
            },
        ]
        for (let coin of coins) {
            let c = this.list.get(coin.symbol)
            if (!c) {
                this.list.set(coin.symbol, coin)
            }
        }
        // this.getListOfCoins()
    }

    getBlockScans(net: string) {
        return ({
            eth: "https://etherscan.io/tx/<txhash>",
            bnb: "https://bscscan.com/tx/<txhash>",
            base: "https://basescan.org/tx/<txhash>",
            btc: "https://www.blockchain.com/explorer/transactions/btc/<txhash>",
            trx: "https://tronscan.org/#/transaction/<txhash>"
        })[net.toLowerCase()]
    }

    async getAllPrices() {
        let prices = {}
        for (let c in this.list.getA()) {
            let coin = this.list.get(c)
            try {
                prices[coin.symbol] = await this.getPriceByOurName(coin.symbol)
            } catch (error) {
                this.logger.err(`[getAllPrices] [sym: ${coin.symbol}, code: ${error.code}]: ${error.message}`)
                prices[coin.symbol] = "error"
            }
        }

        return prices
    }

    has(coin: string) {
        return !!this.list.get(coin)
    }

    // yep btc is fiat...
    async convertToFiat(from: string, to: string, value: number) {
        if (!this.has(from)) { throw new IntError("From currency not found!") }
        if (!["eur", "btc", "usd"].includes(to)) { throw new IntError("To currency not found!") }

        return (await this.getPriceByOurName(from))[to] * value
    }
    async convertFromFiat(from: string, to: string, value: number) {
        if (!["eur", "btc", "usd"].includes(from)) { throw new IntError("From currency not found!") }
        if (!this.has(to)) { throw new IntError("To currency not found!") }

        return value / (await this.getPriceByOurName(to))[from]
    }

    async getPriceByOurName(name: string) {
        try {

            let coin = Object.values(this.list.getA()).find((v) => v.symbol == name.toLowerCase())

            if (coin.price && (typeof coin.price !== "number") && (coin.price.timestamp - Date.now()) < this.timeout) {
                return {
                    name: coin.name,
                    symbol: coin.symbol,
                    eur: coin.price.eur,
                    btc: coin.price.btc,
                    usd: coin.price.usd,
                    image: coin.image
                }
            } else {
                let res = await this.getPriceById(coin.id)

                if (!res.error) {
                    coin.price = {
                        eur: res.eur,
                        btc: res.btc,
                        usd: res.usd,
                        timestamp: Date.now() + Math.floor(Math.random() * 100000)
                    }
                    coin.image = res.image

                    this.list.set(coin.symbol, coin)
                }
                return res
            }

        } catch (error) {
            this.logger.err(`getPriceByOurName error: ${error.code}, ${error.message}`)
            return {
                error: { message: error.message, code: error.code }
            }
        }
    }

    async getPriceById(coin_id: string) {
        try {

            let res = (await axios.get(coingeckoCoinUrl(coin_id))).data

            return {
                name: res.name,
                symbol: res.symbol,
                eur: res.market_data.current_price.eur,
                btc: res.market_data.current_price.btc,
                usd: res.market_data.current_price.usd,
                image: res.image
            }

        } catch (error) {
            this.logger.err(`getPriceById error: ${error.code}, ${error.message}`)
            return {
                error: { message: error.message, code: error.code }
            }
        }
    }

    // private async getListOfCoins() {
    //     try {
    //         this.list = (await axios.get(coingeckoListUrl())).data
    //     } catch (error) {
    //         this.logger.err(`Update prices error: ${error.code}, ${error.message}`)
    //     }
    // }
}
