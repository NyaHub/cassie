import { Logger } from "../../libs/logger";
import { EventEmitter } from 'node:events';
import { Addr, Tx, Wallet } from "../../database/index";
import { base58, sha256 } from '../../utils';
import axios from "axios";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { BTCWithdraw } from "./sender/btc";
import { Faucets } from "../../libs/cache";
import { NetType, IAddress } from "../../types";

let testnet = true
let getPublicKey: (privKey: bigint | Uint8Array | string, isCompressed?: boolean) => Uint8Array
let etc: {
    // hexToBytes: (hex: string) => Uint8Array
    bytesToHex: (bytes: Uint8Array) => string
    // concatBytes: (...arrs: Uint8Array[]) => Uint8Array
    // bytesToNumberBE: (a: Uint8Array) => bigint
    // numberToBytesBE: (n: bigint) => Uint8Array
    // mod: (a: bigint, md?: bigint) => bigint
    // invert: (num: bigint, md?: bigint) => bigint
    // hmacSha256Async: (key: Uint8Array, ...msgs: Uint8Array[]) => Promise<Uint8Array>
    // hmacSha256Sync: undefined | ((key: Uint8Array, ...msgs: Uint8Array[]) => Uint8Array)
    // hashToPrivateKey: (hash: Uint8Array | string) => Uint8Array
    // randomBytes: (len?: number) => Uint8Array
}

export type Address = {
    addr: string,
    privateKey: string
}

export interface IModInfo {
    net: NetType,
    faucet?: Address
}

interface IBitcoinCoreConf {
    net: string;
    host: string;
    logger: Logger;
    confirmCount: number;
    event: EventEmitter;
    faucetPK: string;
    testnet: boolean
}

export class BitcoinCore {
    private height: number = 1;
    private confirmCount: number;
    private logger: Logger;
    private net: string;
    private event: EventEmitter;
    private rpcUrl: string;
    private faucet: Address;
    private sender: BTCWithdraw

    static getModInfo(): IModInfo {
        return {
            net: NetType.BTC
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

        const address = BitcoinCore.getAddress(pk)

        return {
            privateKey: pk,
            addr: address,
        }
    }
    static getAddress(privateKey?: string): string {
        const publicKey = getPublicKey(privateKey, false)
        const sha256Hash = sha256(publicKey)
        const ripemd160Hash = ripemd160(sha256Hash)

        const networkPrefix = testnet ? 0x6F : 0x00
        const prefixedHash = Buffer.concat([Buffer.from([networkPrefix]), ripemd160Hash])

        const checksum = sha256(sha256(prefixedHash)).slice(0, 4)
        const addressBytes = Buffer.concat([prefixedHash, checksum])

        const address = base58.encode(addressBytes)

        return address
    }

    constructor(options: IBitcoinCoreConf) {
        this.net = options.net.toUpperCase()
        this.rpcUrl = options.host
        this.logger = options.logger
        this.confirmCount = options.confirmCount
        this.event = options.event
        if (!options.faucetPK) {
            this.logger.fat("faucetPK is not set!")
            throw new Error("faucetPK is not set!")
        }
        testnet = !!options.testnet
        this.init(options.faucetPK);
    }

    public getCurrencies() {
        return [[`${this.net}_${this.net}_BTC`, "8"]]
    }

    private async init(faucetPK: string) {

        await import("@noble/secp256k1").then(mod => {
            getPublicKey = mod.getPublicKey
            etc = mod.etc
        })

        this.faucet = BitcoinCore.generateWallet(faucetPK)

        this.height = await this.getBlockCount() - 1;
        this.checkNewBlocks()
        this.cron();
        this.event.emit(`${this.net}_inited`, this);
        this.sender = new BTCWithdraw(this.faucet, this, testnet ? "testnet" : "main")
        this.sender.native = this.net

        this.sender.on('withdrawCompleted', (e) => {
            this.logger.log('withdrawCompleted', e)
            this.event.emit('withdrawCompleted', e)
        })
        this.sender.on('no_for_fee_on_native', (e) => {
            this.logger.log('no_for_fee_on_native', e)
            this.event.emit('no_for_fee_on_native', e)
        })


        this.event.on('new_faucet', ((key: string) => {
            this.faucet = BitcoinCore.generateWallet(key)
            this.sender.setFaucet(this.faucet)
        }).bind(this))
    }

    async checkNewBlocks() {
        const rerun = () => {
            setTimeout(this.checkNewBlocks.bind(this), 30000)
        }
        try {
            const currentBlockHeight = await this.rpcCall('getblockcount');

            if (currentBlockHeight > this.height) {
                this.logger.info(`[${this.net}]`, "[new block]", currentBlockHeight)
                for (let height = this.height + 1; height <= currentBlockHeight; height++) {
                    this.logger.info(`[${this.net}]`, "[new block]", height + "")
                    const blockHash = await this.rpcCall('getblockhash', [height]);
                    const block = await this.rpcCall('getblock', [blockHash, 2]);

                    const ad = await Addr.findAll({
                        where: {
                            coin: `${this.net}_${this.net}_BTC`
                        }
                    })
                    const addrs: string[] = ad.map(a => a.addr)

                    for (const tx of block.tx) {
                        for (let o of tx.vout) {
                            if (o.scriptPubKey.address && addrs.includes(o.scriptPubKey.address)) {
                                this.newTx({
                                    hash: tx.txid,
                                    to: o.scriptPubKey.address,
                                    value: o.value.toString(),
                                    blockNumber: currentBlockHeight
                                }, ad[addrs.indexOf(o.scriptPubKey.address)])
                            }
                        }
                    }
                }

                this.height = currentBlockHeight;
            }
        } catch (error) {
            this.logger.err(`[checkNewBlocks] [code: ${error.code}]: ${error.message}`);
        }
        rerun()
    }

    private async newTx(tx: any, addr: any): Promise<void> {
        try {
            if (!addr) return
            this.logger.info(`[${this.net}]`, "[new transaction]", tx.hash)

            const txd = await Tx.create({
                txhash: tx.hash,
                value: tx.value,
                ok: false,
                net: this.net,
                currency: `${this.net}_${this.net}_BTC`,
                to: tx.to,
                height: tx.blockNumber
            })


        } catch (e) {
            if (e.code === 430) return
            this.logger.err(`[${this.net}] newTx error [tx: ${tx.hash}, code: ${e.code}]: ${e.message}`)
        }
    }

    private async cron(): Promise<void> {
        const rerun = () => {
            setTimeout(this.cron.bind(this), 1 * 60 * 1000 /* 1min * 60sec * 1000ms */);
        };

        try {
            this.logger.info(`[${this.net}] [CRON]: start`);

            const txs = await Tx.findAll({ where: { ok: false, currency: `${this.net}_${this.net}_BTC` } });
            if (!txs.length) {
                return rerun();
            }

            for (const tx of txs) {
                if (!tx.dataValues.height) continue;

                if ((this.height - tx.dataValues.height) < this.confirmCount) continue;

                await tx.update({ ok: true });

                const addr = await Addr.findOne({
                    where: { addr: tx.dataValues.to },
                    include: Wallet
                });



                this.sender.send({
                    addr: addr.dataValues.addr,
                    privateKey: addr.wallet.privateKey
                }, tx.dataValues.value, Faucets.get(this.net) || this.faucet.addr)

                this.event.emit("confirmedtx", {
                    to: tx.dataValues.to,
                    txhash: tx.dataValues.txhash,
                    value: tx.dataValues.value,
                    currency: tx.dataValues.currency,
                    uhash: addr?.dataValues.wallet.uhash
                });
            }
        } catch (error) {
            this.logger.err(`[${this.net}] cron error: ${error.message}`);
        }
        rerun();
    }



    public async getAddr(coin: string = `${this.net}_${this.net}_BTC`, uhash: string = "0x0"): Promise<IAddress> {
        let wallet = await Wallet.findOne({
            where: {
                uhash
            },
            include: Addr
        })

        let addr: Address = null
        let retAddr: IAddress = null

        if (!wallet) {
            addr = BitcoinCore.generateWallet()

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
                addr = BitcoinCore.generateWallet(wallet.dataValues.privateKey)

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

    private async rpcCall(method: string, params: any[] = []): Promise<any> {
        try {
            const response = await axios.post(this.rpcUrl, {
                jsonrpc: '2.0',
                id: 1,
                method,
                params
            });

            return response.data.result;
        } catch (error) {
            this.logger.err(`[${this.net}] RPC call error: ${error.message}`);
            throw error;
        }
    }

    private async getBlockCount(): Promise<number> {
        return await this.rpcCall('getblockcount');
    }
}