import { Addr, IAddress, Tx } from "../database/index";
import fs from "node:fs"
import { Logger } from "../libs/logger";
import EventEmitter from "node:events";
import { join } from "node:path";
import { EtherCore } from "./currencies/eth";
import { BitcoinCore } from "./currencies/btc";
import { TronCore } from "./currencies/tron";

export type Address = {
    addr: string,
    // privateKey: bigint
}


type cb = (args: any) => {}

export type Token = {
    abi: any,
    symbol: string,
    addr: string,
    contract: any
}

interface ICryptoCoreConf {
    nodesConfPath: string
    logger: Logger
    event: EventEmitter
    root: string
}

interface INetConf {
    net: string
    core: string
    host: string
    token_path: string
    confirmCount?: number
    disabled?: boolean
}

const Cores = {
    "ETH": EtherCore,
    "BTC": BitcoinCore,
    "TRX": TronCore
}

export class CryptoCore {
    private logger: Logger
    private event: EventEmitter
    private nodes: Object = {}

    private currencies: Set<string> = new Set()
    private cursOut: string[][] = []
    private cursFormated: { [key: string]: string[] }

    constructor(options: ICryptoCoreConf) {
        this.logger = options.logger
        this.event = options.event

        const confPath = join(options.root, options.nodesConfPath)

        if (!fs.existsSync(confPath)) {
            this.logger.fat("nodesConfPath not foud! confPath: " + confPath)
            throw new Error("nodesConfPath not foud! confPath: " + confPath)
        }

        let nodesConf: INetConf[] = []
        let conf: {
            faucetPK: string,
            nets: INetConf[]
        }

        try {
            conf = require(confPath)
            nodesConf = conf.nets
        } catch (error) {
            this.logger.fat("Read net config error: " + error.message)
            throw new Error("Read net config error: " + error.message)
        }

        if (!Array.isArray(nodesConf)) {
            this.logger.fat("Node config is not JSON array of INetConf!")
            throw new Error("Node config is not JSON array of INetConf!")
        }

        for (const net of nodesConf) {
            try {
                if (net.disabled) continue
                if (!Cores[net.core.toUpperCase().toUpperCase()]) {
                    this.logger.err("Unknown Core: " + net.core.toUpperCase())
                    continue
                }
                if (net.token_path) {
                    net.token_path = net.token_path.replace('@root', options.root).replaceAll("//", "/")
                }
                this.nodes[net.net.toUpperCase()] = new Cores[net.core.toUpperCase()]({
                    ...net,
                    faucetPK: conf.faucetPK,
                    logger: this.logger.getLogger(`core/currencies/${net.core.toUpperCase()}.ts`),
                    event: this.event
                })
                this.event.once(`${net.net.toUpperCase()}_inited`, this.addCurs.bind(this))
            } catch (e) {
                this.logger.err(`setup node error [net: ${net.net.toUpperCase()}, code: ${e.code}]: ${e.message}`)
            }
        }
    }

    private addCurs(core): void {

        for (let cur of core.getCurrencies()) {
            this.currencies.add(cur.join(":"))
        }
        this.cursOut = []
        for (let cur of this.currencies) {
            this.cursOut.push(cur.split(":"))
        }

        this.cursFormated = {}
        for (let _c of this.cursOut) {
            let c = _c[0].toLowerCase().split("_")

            if (this.cursFormated[c[0]]) {
                this.cursFormated[c[0]].push(c[1])
            } else {
                this.cursFormated[c[0]] = [c[1]]
            }
        }
    }

    // need for api
    public getFullCurrencies(): string[][] {
        return this.cursOut
    }

    public getCurrencies() {
        return this.cursFormated
    }

    public has(cur: string) {
        return this.cursFormated.hasOwnProperty(cur.toLowerCase())
    }

    // for api
    public async getAddr(coin: string, uhash: string): Promise<IAddress> {
        const isActive = (co) => !!this.cursOut.filter(c => c[0] === co).length
        if (!isActive(coin)) {
            throw new Error("Coin not found!")
        }

        let c = coin.split("_")

        let addr = this.nodes[c[2]].getAddr(coin, uhash)

        return addr
    }
}