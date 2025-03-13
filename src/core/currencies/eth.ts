import { Web3 } from "web3";
import { Addr, IAddress, NetType, NetTypeNames, Tx, Wallet } from "../../database/index";
import { Logger } from "../../libs/logger";
import { Op } from "sequelize";
import EventEmitter from "node:events";
import { keccak_256 } from '@noble/hashes/sha3';
import { EthWithdraw } from "./sender/eth";
import { Faucets } from "../../libs/cache";

let getPublicKey: (privKey: bigint | Uint8Array | string, isCompressed?: boolean) => Uint8Array
let etc: {
    bytesToHex: (bytes: Uint8Array) => string
}
export type Address = {
    addr: string,
    privateKey: string
}

export type Token = {
    abi?: any,
    symbol: string,
    addr: string,
    contract?: any,
    name?: string,
    decimals: number
}

export interface IModInfo {
    net: NetType,
    faucet?: Address
}

interface IEtherCoreConf {
    net: string,
    host: string,
    token_path: string,
    logger: Logger,
    confirmCount: number,
    event: EventEmitter,
    faucetPK: string
}

/**
 * Ethereum, Base, BSC, etc. ...
 */
export class EtherCore {
    private web3: Web3
    private tokens: Map<string, Token> = new Map()
    private height: bigint = 1n
    private confirmCount: number
    private tokenPath: string
    private logger: Logger
    private net: string
    private event: EventEmitter
    private faucet: Address
    private sender: EthWithdraw

    private currencies: [string, string][] = []

    static getModInfo(): IModInfo {
        return {
            net: NetType.ETH
        }
    }
    public getModInfo(): IModInfo {
        return {
            net: NetType[this.net],
            faucet: this.faucet
        }
    }

    static generateWallet(pk: string = null): Address {
        if (!pk) {
            const seed = new Uint8Array(32)
            crypto.getRandomValues(seed)
            pk = etc.bytesToHex(seed)
        }

        const address = EtherCore.getEthereumAddress(pk)

        return {
            privateKey: pk,
            addr: address,
        }
    }
    static getEthereumAddress(privateKey) {
        const publicKey = getPublicKey(privateKey, false)
        const hash = keccak_256(publicKey.slice(1))
        return '0x' + etc.bytesToHex(hash.slice(-20))
    }

    getTokDat(token: string) {
        return this.tokens.get(token)
    }

    constructor(options: IEtherCoreConf) {
        this.event = options.event
        this.net = options.net.toUpperCase()
        this.logger = options.logger
        this.web3 = new Web3(options.host);
        this.confirmCount = options.confirmCount || 10
        this.tokenPath = options.token_path

        if (!options.faucetPK) {
            this.logger.fat("faucetPK is not set!")
            throw new Error("faucetPK is not set!")
        }
        this.cron()
        this.init(options.faucetPK)
        this.currencies = [[
            `${this.net}_${this.net}_ETH`, "18"
        ]]
    }

    private async init(faucetPK: string) {
        let imp = await import("@noble/secp256k1")
        getPublicKey = imp.getPublicKey
        etc = imp.etc
        this.faucet = EtherCore.generateWallet(faucetPK)

        await this.connectContracts()

        this.height = await this.web3.eth.getBlockNumber()//16727n
        this.sender = new EthWithdraw(this.faucet, this.web3, this)

        this.sender.on('withdrawCompleted', (e) => {
            this.logger.log('withdrawCompleted', e)
            this.event.emit('withdrawCompleted', e)
        })
        this.sender.on('faucetEmpty', (e) => {
            this.logger.log('faucetEmpty', e)
            this.event.emit('faucetEmpty', e)
        })
        this.sender.on('no_for_fee_on_native', (e) => {
            this.logger.log('no_for_fee_on_native', e)
            this.event.emit('no_for_fee_on_native', e)
        })

        this.sender.native = this.net

        this.newBlk()

        this.event.emit(`${this.net}_inited`, this)

        this.event.on('new_faucet', ((key: string) => {
            this.faucet = EtherCore.generateWallet(key)
            this.sender.setFaucet(this.faucet)
        }).bind(this))
    }

    private async connectContracts() {
        if (!this.tokenPath) return

        let toks = require(this.tokenPath)

        for (let tok in toks) {
            try {
                this.tokens.set(toks[tok][0], {
                    symbol: tok,
                    addr: toks[tok][0],
                    name: `${tok}_${this.net}_ETH`,
                    decimals: parseInt(toks[tok][1])
                })
                this.currencies.push([`${tok}_${this.net}_ETH`, toks[tok][1]])
            } catch (error) {

            }
        }
    }

    // need for api
    public getCurrencies() {
        return this.currencies
    }

    private async parsseTx(tx) {

        let st = this.sender.isMy(tx.txID)
        if (st.length > 0) {
            this.sender.emit(`${tx.txID}_confirmed`, st)
            return
        }

        if (tx.input === "0x") {

            return this.newTx({
                hash: tx.hash,
                from: tx.from,
                to: tx.to,
                value: tx.value,
                asset: `${this.net}_${this.net}_ETH`,
                height: tx.blockNumber
            })
        }
        if (tx.input.slice(0, 10) === "0xa9059cbb") {

            if (this.tokens.has(tx.to)) {
                return this.newTx({
                    hash: tx.hash,
                    from: tx.from,
                    to: '0x' + tx.input.slice(34, 74),
                    value: BigInt('0x' + tx.input.slice(74)),
                    asset: this.tokens.get(tx.to).name,
                    height: tx.blockNumber
                })
            }
        }
    }

    private async newBlk() {
        let rerun = () => {
            setTimeout(this.newBlk.bind(this), 3000)
        }
        let blk
        try {

            blk = await this.web3.eth.getBlockNumber()
            if (this.height >= blk) {
                return rerun()
            }

            this.logger.info(`[${this.net}]`, "[new block]", blk)

            for (let i = this.height + 1n; i <= blk; i++) {
                let blk_ = await this.web3.eth.getBlock(i, true)
                for (let tx of blk_.transactions) {
                    this.parsseTx(tx)
                }
            }
            this.height = blk

            rerun()
        } catch (e) {
            console.log(e)
            this.logger.err(`[${this.net}] newBlk error [height: ${blk}, code: ${e.code}]: ${e.message}`)
        }
    }

    // for api
    public async getAddr(coin: string = `${this.net}_${this.net}_ETH`, uhash: string = "0x0"): Promise<IAddress> {
        let wallet = await Wallet.findOne({
            where: {
                uhash
            },
            include: Addr
        })

        let addr: Address = null
        let retAddr: IAddress = null

        if (!wallet) {
            addr = EtherCore.generateWallet()

            wallet = await Wallet.create({
                uhash,
                privateKey: addr.privateKey
            })

            await Addr.create({
                addr: addr.addr,
                coin,
                walletId: wallet.id
            })
            let ad = await Addr.findOne({
                where: {
                    addr: addr.addr,
                    coin,
                }
            })

            retAddr = {
                addr: addr.addr,
                id: ad.dataValues.id
            }
        } else {
            for (const ad of wallet.dataValues.addrs) {
                if (ad.dataValues.coin === coin) {
                    retAddr = {
                        addr: ad.dataValues.addr,
                        id: ad.dataValues.id
                        // privateKey: wallet.dataValues.privateKey
                    }
                    break
                }
            }
            if (!retAddr) {
                addr = EtherCore.generateWallet(wallet.dataValues.privateKey)

                await Addr.create({
                    addr: addr.addr,
                    coin,
                    walletId: wallet.id
                })
                let ad = await Addr.findOne({
                    where: {
                        addr: addr.addr,
                        coin,
                    }
                })

                retAddr = {
                    addr: addr.addr,
                    id: ad.dataValues.id
                }
            }
        }

        return retAddr
    }

    private async cron(): Promise<void> {
        // this.logger.memory()
        const rerun = () => {
            setTimeout(this.cron.bind(this), 10000)
        }
        try {
            this.logger.info(`[${this.net}] [CRON]: start`)

            const txs = await Tx.findAll({ where: { ok: false, currency: { [Op.or]: this.currencies.map(v => v[0]) } } })


            if (!txs.length) {
                return rerun()
            }

            for (const tx of txs) {
                if (!tx.dataValues.height) continue

                if ((this.height - BigInt(tx.dataValues.height)) < this.confirmCount) continue

                await tx.update({
                    ok: true
                })

                const addr = await Addr.findOne({
                    where: {
                        addr: tx.dataValues.to
                    },
                    include: Wallet
                })

                let dec = 0
                let value = tx.dataValues.value
                for (let cur of this.currencies) {
                    if (cur[0] === tx.dataValues.currency) {
                        dec = parseInt(cur[1])
                        value = this.web3.utils.fromWei(value, dec)
                        break
                    }
                }


                let token = tx.dataValues.currency === `${this.net}_${this.net}_ETH` ? this.net : Array.from(this.tokens).find(t => t[1].name === tx.dataValues.currency)[1].addr

                this.sender.send({
                    addr: addr.dataValues.addr,
                    privateKey: addr.wallet.privateKey
                }, token, tx.dataValues.value, Faucets.get(this.net) || this.faucet.addr)

                this.event.emit("confirmedtx", {
                    to: tx.dataValues.to,
                    txhash: tx.dataValues.txhash,
                    value: value,
                    currency: tx.dataValues.currency,
                    uhash: addr.dataValues.wallet.uhash
                })
            }

        } catch (error) {

        }
        rerun()
    }

    private async newTx(tx: {
        hash: string,
        from: string,
        to: string,
        value: bigint,
        asset: string,
        height: number
    }): Promise<void> {
        try {
            const addr = await Addr.findOne({
                where: {
                    addr: tx.to
                }
            })

            if (!addr) return
            this.logger.info(`[${this.net}]`, "[new transaction]", tx.hash)

            const txd = await Tx.create({
                txhash: tx.hash,
                value: tx.value,
                ok: false,
                net: this.net,
                currency: tx.asset,
                to: tx.to?.toLowerCase(),
                height: tx.height
            })


        } catch (e) {
            if (e.code === 430) return
            this.logger.err(`[${this.net}] newTx error [tx: ${tx.hash}, code: ${e.code}]: ${e.message}`)
        }
    }
}

