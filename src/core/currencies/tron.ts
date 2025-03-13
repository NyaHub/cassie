import { EventEmitter } from "node:events";
import { Logger } from "../../libs/logger";
import { Addr, IAddress, NetType, Tx, Wallet } from "../../database/index";
import { Op } from "sequelize";
import { TronWeb } from "tronweb";
import { keccak_256 } from '@noble/hashes/sha3';
import { base58, sha256 } from '../../utils'
import Web3 from "web3";
import { TronWithdraw } from "./sender/tron";


// declared only its from noble secp256k1
declare let getPublicKey: (privKey: bigint | Uint8Array | string, isCompressed?: boolean) => Uint8Array
declare let etc: {
    hexToBytes: (hex: string) => Uint8Array
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

interface ITronCoreConf {
    net: string,
    fullHost: string,
    fullNode: string,
    solidityNode: string,
    eventServer: string,
    token_path: string,
    logger: Logger,
    confirmCount: number,
    event: EventEmitter,
    faucetPK: string
}

export class TronCore {
    private tronWeb: TronWeb;
    private tokens: Map<string, Token> = new Map()
    private height: number = 1
    private confirmCount: number
    private logger: Logger
    private net: string
    private event: EventEmitter
    private faucet: Address
    private token_path: string
    private sender: TronWithdraw

    private currencies: [string, string][] = []

    static getModInfo(): IModInfo {
        return {
            net: NetType.TRON
        }
    }

    public getModInfo(): IModInfo {
        return {
            net: NetType[this.net],
            faucet: this.faucet
        }
    }

    static addr2base(u: string) {
        const f = new Uint8Array(25)
        f.set(etc.hexToBytes(u + sha256(sha256(Buffer.from(u, 'hex'))).toString('hex').slice(0, 8)), 0)
        return base58.encode(Buffer.from(f))
    }
    static pk2addr(pk: string) {
        const u = new Uint8Array(21)
        u.set([0x41], 0)
        u.set(keccak_256(etc.hexToBytes(Buffer.from(getPublicKey(pk, false).slice(1)).toString("hex"))).slice(-20), 1)

        let a = Buffer.from(u).toString("hex")

        return { addr: TronCore.addr2base(a), hex: a }
    }

    static generateWallet(pk: string = null): Address {
        if (!pk) {
            const seed = new Uint8Array(32)
            crypto.getRandomValues(seed)
            pk = Buffer.from(seed).toString('hex')
        }

        const address = TronCore.getTronAddress(pk)

        return {
            privateKey: pk,
            addr: address,
        }
    }

    static getTronAddress(privateKey: string): string {
        return TronCore.pk2addr(privateKey).addr
    }

    constructor(options: ITronCoreConf) {
        this.event = options.event
        this.net = options.net.toUpperCase()
        this.logger = options.logger
        this.confirmCount = options.confirmCount || 10
        this.token_path = options.token_path

        let troncfg = {}
        if (options.fullHost) {
            troncfg = {
                fullHost: options.fullHost
            }
        } else {
            troncfg = {
                fullNode: options.fullNode,
                solidityNode: options.solidityNode,
                eventServer: options.eventServer,
            }
        }

        this.tronWeb = new TronWeb(troncfg);

        this.currencies = [[
            `${this.net}_${this.net}_TRX`, "6"
        ]]

        if (!options.faucetPK) {
            this.logger.fat("faucetPK is not set!")
            throw new Error("faucetPK is not set!")
        }

        this.init(options.faucetPK)
    }

    public getTokDat(tokAddr: string) {
        return this.tokens.get(tokAddr)
    }

    private async init(faucetPK: string) {
        const imp = await import('@noble/secp256k1')
        getPublicKey = imp.getPublicKey
        etc = imp.etc
        this.faucet = TronCore.generateWallet(faucetPK)
        await this.connectContracts()
        this.height = (await this.tronWeb.trx.getCurrentBlock()).block_header.raw_data.number
        this.checkNewBlocks()
        this.cron()
        this.sender = new TronWithdraw(this.faucet, this.tronWeb, this)

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

        this.event.emit(`${this.net}_inited`, this)

        this.event.on('new_faucet', ((key: string) => {
            this.faucet = TronCore.generateWallet(key)
            this.sender.setFaucet(this.faucet)
        }).bind(this))
    }

    private async connectContracts() {
        if (!this.token_path) return

        let toks = require(this.token_path)

        for (let tok in toks) {
            try {
                this.tokens.set(toks[tok][0], {
                    symbol: tok,
                    addr: toks[tok][0],
                    name: `${tok}_${this.net}_TRX`,
                    decimals: parseInt(toks[tok][1])
                })
                this.currencies.push([`${tok}_${this.net}_TRX`, toks[tok][1]])
            } catch (error) {

            }
        }
    }
    // need for api
    public getCurrencies() {
        return this.currencies
    }

    private async parsseTx(tx, height) {
        // this function acept only this tx types in first contract element
        // TriggerSmartContract
        // TransferContract
        let from,
            to,
            value,
            asset

        let st = this.sender.isMy(tx.txID)
        if (st.length > 0) {
            this.sender.emit(`${tx.txID}_confirmed`, st)
            return
        }

        if (tx.raw_data.contract[0].type === "TransferContract") {
            from = tx.raw_data.contract[0].parameter.value.owner_address
            to = tx.raw_data.contract[0].parameter.value.to_address
            value = tx.raw_data.contract[0].parameter.value.amount
            asset = 'trx'

            return this.newTx({
                hash: tx.txID,
                type: tx.raw_data.contract[0].type,
                from: from ? TronCore.addr2base(from) : "",
                to: to ? TronCore.addr2base(to) : "",
                value: value,
                asset: `${this.net}_${this.net}_TRX`,
                height
            })
        }
        if (tx.raw_data.contract[0].type === "TriggerSmartContract" && tx.raw_data.contract[0].parameter.value.data.slice(0, 8) === "a9059cbb") {
            from = '41' + tx.raw_data.contract[0].parameter.value.owner_address.slice(2)
            to = '41' + tx.raw_data.contract[0].parameter.value.data.slice(32, 72)
            value = tx.raw_data.contract[0].parameter.value.data.slice(72)
            asset = TronCore.addr2base('41' + tx.raw_data.contract[0].parameter.value.contract_address.slice(2))


            if (this.tokens.has(asset)) {
                this.newTx({
                    hash: tx.txID,
                    type: tx.raw_data.contract[0].type,
                    from: from ? TronCore.addr2base(from) : "",
                    to: to ? TronCore.addr2base(to) : "",
                    value: value ? parseInt(value, 16) : 0,
                    asset: this.tokens.get(asset).name,
                    height
                })
            }
        }
    }

    private async checkNewBlocks() {
        try {
            let lblk = await this.tronWeb.trx.getCurrentBlock()
            let dt = lblk.block_header.raw_data.number - this.height
            if (dt > 1 && dt < 100) {
                let blks = await this.tronWeb.trx.getBlockRange(this.height, lblk.block_header.raw_data.number)
                for (let blk of blks) {
                    this.logger.info(`[${this.net}]`, "[new block]", blk.block_header.raw_data.number + "")
                    if (!blk.transactions) continue
                    for (let tx of blk.transactions) {
                        await this.parsseTx(tx, blk.block_header.raw_data.number)
                    }
                }
            } else {
                if (dt != 0) {
                    this.logger.info(`[${this.net}]`, "[new block]", lblk.block_header.raw_data.number + "")
                    if (lblk.transactions) {
                        for (let tx of lblk.transactions) {
                            await this.parsseTx(tx, lblk.block_header.raw_data.number)
                        }
                    }
                }
            }
            this.height = lblk.block_header.raw_data.number
        } catch (error) {
            this.logger.err(`[checkNewBlocks] [code: ${error.code}]: ${error.message}`);
        }
        setTimeout(this.checkNewBlocks.bind(this), 1000)
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

                if ((this.height - tx.dataValues.height) < this.confirmCount) continue

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
                        value = Web3.utils.fromWei(value, dec)
                        break
                    }
                }

                let token = tx.dataValues.currency === "TRX_TRX_TRX" ? "TRX" : Array.from(this.tokens).find(t => t[1].name === tx.dataValues.currency)[1].addr

                // this.sender.send({
                //     addr: addr.dataValues.addr,
                //     privateKey: addr.wallet.privateKey
                // }, token)
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
        type: string,
        from: string,
        to: string,
        value: number,
        asset: string,
        height: number
    }) {

        const addr = await Addr.findOne({
            where: {
                addr: tx.to
            }
        })

        if (!addr) return

        this.logger.info(`[${this.net}]`, "[new transaction]", tx.hash)

        const txd = await Tx.create({
            txhash: tx.hash,
            value: tx.value.toString(),
            ok: false,
            net: this.net,
            currency: tx.asset,
            to: tx.to,
            height: tx.height
        })
    }

    public async getAddr(coin: string = `${this.net}_${this.net}_TRX`, uhash: string = "0x0"): Promise<IAddress> {
        let wallet = await Wallet.findOne({
            where: {
                uhash
            },
            include: Addr
        })

        let addr: Address = null
        let retAddr: IAddress = null

        if (!wallet) {
            addr = TronCore.generateWallet()

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
                    }
                    break
                }
            }
            if (!retAddr) {
                addr = TronCore.generateWallet(wallet.dataValues.privateKey)

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
}